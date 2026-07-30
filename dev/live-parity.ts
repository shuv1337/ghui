import { chmod, mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { Effect, Layer } from "effect"
import { runCli } from "../src/cli.js"
import { makeCliDependencies } from "../src/cliDependencies.js"
import type { IssueItem, PullRequestItem, WorkflowRun } from "../src/domain.js"
import { runBulkItems } from "../src/item/bulk.js"
import { CommandRunner } from "../src/services/CommandRunner.js"
import { GitHubService } from "../src/services/GitHubService.js"
import {
	assertLiveParityAllowed,
	createLiveFixtureLedger,
	executeLiveFixtureOperations,
	type LiveFixtureOperation,
	type LiveParityAction,
	type LiveParityContext,
} from "../test/support/liveParity.js"
import { parityManifest } from "../test/parity/manifest.js"

const MARKER_TOPIC = "ghui-parity-test"
const DEFAULT_OUTPUT = "/tmp/ghui-live-parity-latest.json"

type ScenarioStatus = "passed" | "blocked" | "failed"

export const liveRunnerCapabilityIds = [
	"workspace-navigation",
	"pull-request-browse",
	"issue-browse",
	"releases",
	"issue-management",
	"pull-request-management",
	"metadata-selectors",
	"bulk-item-operations",
	"pending-reviews",
	"suggestions",
	"diff-rendering",
	"actions",
	"action-artifacts",
	"branches",
	"milestones",
	"environments-deployments",
	"runners",
	"notifications",
	"cli-operations",
] as const

export interface LiveScenarioResult {
	readonly capabilityId: string
	readonly scenarioId: string
	readonly action: LiveParityAction
	readonly status: ScenarioStatus
	readonly detail: string
	readonly durationMs: number
}

interface RepositoryPreflight {
	readonly nameWithOwner: string
	readonly viewerPermission: "NONE" | "READ" | "TRIAGE" | "WRITE" | "MAINTAIN" | "ADMIN"
	readonly defaultBranchRef: { readonly name: string } | null
	readonly repositoryTopics: readonly { readonly name: string }[]
}

interface LiveConfiguration {
	readonly repository: string | null
	readonly identity: string | null
	readonly output: string
	readonly apply: boolean
	readonly approved: boolean
	readonly runPrefix: string
}

export interface LiveParityReport {
	readonly schemaVersion: 1
	readonly generatedAt: string
	readonly mode: "check" | "read" | "apply"
	readonly repository: string | null
	readonly identity: string | null
	readonly markerTopic: string
	readonly preflight: {
		readonly passed: boolean
		readonly problems: readonly string[]
		readonly permission: string | null
		readonly defaultBranch: string | null
	}
	readonly summary: Readonly<Record<ScenarioStatus, number>>
	readonly scenarios: readonly LiveScenarioResult[]
	readonly cleanupInventory: readonly unknown[]
}

const permission = (value: RepositoryPreflight["viewerPermission"]): LiveParityContext["viewerPermission"] => value.toLowerCase() as LiveParityContext["viewerPermission"]

const readConfiguration = (args: readonly string[], environment: Readonly<Record<string, string | undefined>> = process.env): LiveConfiguration => ({
	repository: environment.GHUI_PARITY_TEST_REPO?.trim() || null,
	identity: environment.GHUI_PARITY_TEST_IDENTITY?.trim() || null,
	output: resolve(environment.GHUI_PARITY_OUTPUT?.trim() || DEFAULT_OUTPUT),
	apply: args.includes("--apply"),
	approved: environment.GHUI_PARITY_APPROVED === "1",
	runPrefix: environment.GHUI_PARITY_RUN_PREFIX?.trim() || `ghui-p7-${Date.now().toString(36)}`,
})

const commandOutput = async (command: string, args: readonly string[], stdin?: string): Promise<string> => {
	const proc = Bun.spawn({
		cmd: [command, ...args],
		stdin: stdin === undefined ? "ignore" : "pipe",
		stdout: "pipe",
		stderr: "pipe",
	})
	if (stdin !== undefined && proc.stdin) {
		proc.stdin.write(stdin)
		proc.stdin.end()
	}
	const timeout = setTimeout(() => proc.kill("SIGKILL"), 30_000)
	try {
		const [exitCode, stdout, stderr] = await Promise.all([proc.exited, Bun.readableStreamToText(proc.stdout), Bun.readableStreamToText(proc.stderr)])
		if (exitCode !== 0) throw new Error(stderr.trim() || stdout.trim() || `${command} exited ${exitCode}`)
		return stdout
	} finally {
		clearTimeout(timeout)
	}
}

const ghJson = async <A>(args: readonly string[]): Promise<A> => JSON.parse(await commandOutput("gh", args)) as A

const cleanupAll = async (cleanups: readonly (() => Promise<void>)[]) => {
	const failures: string[] = []
	for (const cleanup of cleanups) {
		try {
			await cleanup()
		} catch (cause) {
			failures.push(cause instanceof Error ? cause.message : String(cause))
		}
	}
	if (failures.length > 0) throw new Error(failures.join("; "))
}

const preflight = async (configuration: LiveConfiguration) => {
	const problems: string[] = []
	if (!configuration.repository) problems.push("GHUI_PARITY_TEST_REPO must name the disposable repository exactly")
	if (!configuration.identity) problems.push("GHUI_PARITY_TEST_IDENTITY must name the dedicated test account exactly")
	if (!/^[a-z0-9][a-z0-9-]{5,31}$/i.test(configuration.runPrefix)) {
		problems.push("GHUI_PARITY_RUN_PREFIX must be 6-32 alphanumeric or hyphen characters")
	}
	if (problems.length > 0) return { problems, repository: null, viewer: null }

	try {
		const [repository, viewer] = await Promise.all([
			ghJson<RepositoryPreflight>(["repo", "view", configuration.repository!, "--json", "nameWithOwner,viewerPermission,defaultBranchRef,repositoryTopics"]),
			ghJson<{ readonly login: string }>(["api", "user"]),
		])
		const context: LiveParityContext = {
			configuredRepository: configuration.repository,
			actualRepository: repository.nameWithOwner,
			dedicatedIdentity: viewer.login === configuration.identity,
			viewerPermission: permission(repository.viewerPermission),
			repositoryHasMarker: repository.repositoryTopics.some((topic) => topic.name === MARKER_TOPIC),
			apply: configuration.apply,
			approved: configuration.approved,
		}
		if (!repository.defaultBranchRef) problems.push("Disposable repository must have an initialized default branch")
		try {
			assertLiveParityAllowed(context, configuration.apply ? "destructive" : "read")
		} catch (cause) {
			problems.push(cause instanceof Error ? cause.message : String(cause))
		}
		return { problems, repository, viewer }
	} catch (cause) {
		problems.push(cause instanceof Error ? cause.message : String(cause))
		return { problems, repository: null, viewer: null }
	}
}

const liveCapability = (capabilityId: string) => {
	const capability = parityManifest.find((entry) => entry.id === capabilityId)
	if (!capability || capability.status === "excluded") throw new Error(`Unknown live capability: ${capabilityId}`)
	const scenarioId = capability.scenarios.live[0]
	if (!scenarioId) throw new Error(`Capability ${capabilityId} has no live scenario`)
	return { capabilityId, scenarioId }
}

const result = (capabilityId: string, action: LiveParityAction, status: ScenarioStatus, detail: string, durationMs: number): LiveScenarioResult => ({
	...liveCapability(capabilityId),
	action,
	status,
	detail,
	durationMs,
})

const runScenario = async (capabilityId: string, action: LiveParityAction, run: () => Promise<string>): Promise<LiveScenarioResult> => {
	const startedAt = Date.now()
	try {
		return result(capabilityId, action, "passed", await run(), Date.now() - startedAt)
	} catch (cause) {
		return result(capabilityId, action, "failed", cause instanceof Error ? cause.message : String(cause), Date.now() - startedAt)
	}
}

const runMutationPrerequisite = async (capabilityId: string, run: () => Promise<string>): Promise<LiveScenarioResult> => {
	const checked = await runScenario(capabilityId, "read", run)
	return checked.status === "passed"
		? { ...checked, action: "mutate", status: "blocked", detail: `${checked.detail}; mutation acceptance still requires --apply and current approval.` }
		: checked
}

const blockedMutation = (capabilityId: string): LiveScenarioResult => result(capabilityId, "mutate", "blocked", "Requires --apply plus current explicit mutation approval.", 0)

const requireItems = <A>(items: readonly A[], fixture: string): A => {
	const item = items[0]
	if (!item) throw new Error(`Disposable repository must contain ${fixture}`)
	return item
}

const makeService = () => Effect.runPromise(GitHubService.pipe(Effect.provide(GitHubService.layerNoDeps.pipe(Layer.provide(CommandRunner.layer)))))

type LiveService = Awaited<ReturnType<typeof makeService>>

const execute = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

const runReadSuite = async (repository: string, expectedIdentity: string): Promise<readonly LiveScenarioResult[]> => {
	const service = await makeService()
	let pullRequest: PullRequestItem | null = null
	let issue: IssueItem | null = null
	let actionRun: WorkflowRun | null = null

	const scenarios: LiveScenarioResult[] = []

	scenarios.push(
		await runScenario("workspace-navigation", "read", async () => {
			const [viewer, details] = await Promise.all([execute(service.getAuthenticatedUser()), execute(service.getRepositoryDetails(repository))])
			if (viewer !== expectedIdentity) throw new Error(`Authenticated viewer does not match the configured dedicated identity`)
			if (details.repository !== repository) throw new Error("Repository detail response did not preserve repository identity")
			return `viewer and repository context verified; default branch ${details.defaultBranch ?? "absent"}`
		}),
	)

	scenarios.push(
		await runScenario("pull-request-browse", "read", async () => {
			const page = await execute(service.listPullRequestPage({ kind: "pullRequest", mode: "all", repository, cursor: null, pageSize: 25 }))
			pullRequest = requireItems(page.items, "at least one open fixture Pull Request")
			const details = await execute(service.getPullRequestDetails(repository, pullRequest.number))
			return `listed ${page.items.length} Pull Requests and hydrated fixture #${details.number}`
		}),
	)

	scenarios.push(
		await runScenario("issue-browse", "read", async () => {
			const page = await execute(service.listIssuePage({ kind: "issue", mode: "all", repository, cursor: null, pageSize: 25 }))
			issue = requireItems(page.items, "at least one open fixture Issue")
			const comments = await execute(service.listIssueComments(repository, issue.number))
			return `listed ${page.items.length} Issues and decoded ${comments.length} fixture comments`
		}),
	)

	scenarios.push(
		await runScenario("metadata-selectors", "read", async () => {
			const [labels, assignees, reviewers, milestones, branches] = await Promise.all([
				execute(service.listRepoLabels(repository)),
				execute(service.listAssignees(repository)),
				execute(service.listReviewers(repository)),
				execute(service.listMilestones(repository)),
				execute(service.listBranches(repository)),
			])
			requireItems(branches, "a default branch")
			return `decoded ${labels.length} labels, ${assignees.length} assignees, ${reviewers.length} reviewers, ${milestones.length} milestones, and ${branches.length} branches`
		}),
	)

	scenarios.push(
		await runScenario("diff-rendering", "read", async () => {
			if (!pullRequest) throw new Error("Pull Request browse prerequisite failed")
			const patch = await execute(service.getPullRequestDiff(repository, pullRequest.number))
			if (!patch.includes("diff --git")) throw new Error("Fixture Pull Request does not expose a textual diff")
			return `decoded a ${patch.length}-byte fixture diff`
		}),
	)

	scenarios.push(
		await runMutationPrerequisite("actions", async () => {
			const [workflows, runs] = await Promise.all([execute(service.listWorkflows(repository)), execute(service.listWorkflowRuns(repository, 25))])
			requireItems(workflows, "an active fixture workflow")
			actionRun = requireItems(runs, "at least one fixture workflow run")
			const details = await execute(service.getWorkflowRunDetails(repository, actionRun.id))
			return `decoded ${workflows.length} workflows, ${runs.length} runs, and ${details.jobs.length} jobs`
		}),
	)

	scenarios.push(
		await runMutationPrerequisite("action-artifacts", async () => {
			if (!actionRun) throw new Error("Actions prerequisite failed")
			const artifacts = await execute(service.listArtifacts(repository, actionRun.id))
			requireItems(artifacts, "an artifact on the latest fixture run")
			return `decoded ${artifacts.length} fixture artifacts`
		}),
	)

	scenarios.push(
		await runScenario("environments-deployments", "read", async () => {
			const environments = await execute(service.listEnvironments(repository))
			const environment = requireItems(environments, "a fixture environment")
			const deployments = await execute(service.listDeployments(repository, environment.name))
			requireItems(deployments, `a deployment for environment ${environment.name}`)
			return `decoded ${environments.length} environments and ${deployments.length} deployments`
		}),
	)

	scenarios.push(
		await runScenario("runners", "read", async () => {
			const runners = await execute(service.listRunners(repository))
			return `runner permission and schema verified; ${runners.length} repository runners visible`
		}),
	)

	scenarios.push(
		await runMutationPrerequisite("notifications", async () => {
			const notifications = await execute(service.listNotifications(false))
			const fixtureNotifications = notifications.filter((notification) => notification.repository === repository)
			requireItems(fixtureNotifications, "an unread fixture notification for the dedicated identity")
			return `decoded ${fixtureNotifications.length} unread fixture notifications for the disposable repository`
		}),
	)

	scenarios.push(
		await runScenario("cli-operations", "read", async () => {
			const dependencies = makeCliDependencies("live-parity")
			const [doctor, repos] = await Promise.all([runCli(["--repo", repository, "doctor", "--json"], dependencies), runCli(["repos", "--json"], dependencies)])
			if (doctor.exitCode !== 0) throw new Error(`doctor failed with exit ${doctor.exitCode}`)
			const visible = JSON.parse(repos.stdout) as readonly { readonly nameWithOwner?: string }[]
			if (!visible.some((entry) => entry.nameWithOwner === repository)) throw new Error("repos output omitted the disposable repository")
			return "doctor and repository listing passed through the production CLI"
		}),
	)

	for (const capabilityId of [
		"releases",
		"issue-management",
		"pull-request-management",
		"bulk-item-operations",
		"pending-reviews",
		"suggestions",
		"branches",
		"milestones",
	] as const) {
		scenarios.push(blockedMutation(capabilityId))
	}

	return scenarios
}

interface CoreFixtureState {
	readonly label: string
	readonly milestoneNumber: number
	readonly milestoneTitle: string
	readonly issues: readonly number[]
	readonly releaseTag: string
	readonly branchName: string
	readonly pullRequestNumber: number
}

const exactIssueNumbers = async (repository: string, titlePrefix: string): Promise<readonly number[]> => {
	const issues = await ghJson<readonly { readonly number: number; readonly title: string }[]>([
		"issue",
		"list",
		"--repo",
		repository,
		"--state",
		"all",
		"--limit",
		"100",
		"--json",
		"number,title",
		"--search",
		`${titlePrefix} in:title`,
	])
	return issues.filter((issue) => issue.title.startsWith(titlePrefix)).map((issue) => issue.number)
}

const exactPullRequestNumber = async (repository: string, title: string): Promise<number> => {
	const pullRequests = await ghJson<readonly { readonly number: number; readonly title: string }[]>([
		"pr",
		"list",
		"--repo",
		repository,
		"--state",
		"all",
		"--limit",
		"100",
		"--json",
		"number,title",
		"--search",
		`${title} in:title`,
	])
	const match = pullRequests.find((pullRequest) => pullRequest.title === title)
	if (!match) throw new Error("Created fixture Pull Request was not discoverable")
	return match.number
}

const cleanupRecordedFixtures = async (service: LiveService, repository: string, ledger: ReturnType<typeof createLiveFixtureLedger>): Promise<void> => {
	await cleanupAll(
		[...ledger.pending()]
			.filter((fixture) => ["pullRequest", "branch", "issue", "milestone", "release", "label"].includes(fixture.kind))
			.reverse()
			.map((fixture) => async () => {
				switch (fixture.kind) {
					case "pullRequest":
						await execute(service.closePullRequest(repository, Number(fixture.id)))
						ledger.recordCleanup(fixture.kind, fixture.id, "retained", "GitHub does not support Pull Request deletion; fixture was closed.")
						return
					case "branch": {
						const branch = (await execute(service.listBranches(repository))).find((candidate) => candidate.name === fixture.id)
						if (branch) await execute(service.deleteBranch(repository, branch, null))
						ledger.recordCleanup(fixture.kind, fixture.id, "removed")
						return
					}
					case "issue":
						await execute(service.deleteIssue(repository, Number(fixture.id)))
						ledger.recordCleanup(fixture.kind, fixture.id, "removed")
						return
					case "milestone":
						await execute(service.deleteMilestone(repository, Number(fixture.id)))
						ledger.recordCleanup(fixture.kind, fixture.id, "removed")
						return
					case "release":
						await execute(service.deleteRelease(repository, fixture.id))
						await commandOutput("gh", ["api", "--method", "DELETE", `repos/${repository}/git/refs/tags/${encodeURIComponent(fixture.id)}`])
						ledger.recordCleanup(fixture.kind, fixture.id, "removed")
						return
					case "label":
						await commandOutput("gh", ["label", "delete", fixture.id, "--repo", repository, "--yes"])
						ledger.recordCleanup(fixture.kind, fixture.id, "removed")
						return
					default:
						throw new Error(`No cleanup implementation for ${fixture.kind}:${fixture.id}`)
				}
			}),
	)
}

const waitForValue = async <A>(
	label: string,
	load: () => Promise<A | null>,
	{ attempts = 45, intervalMs = 2_000 }: { readonly attempts?: number; readonly intervalMs?: number } = {},
): Promise<A> => {
	for (let attempt = 0; attempt < attempts; attempt++) {
		const value = await load()
		if (value !== null) return value
		await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs))
	}
	throw new Error(`Timed out waiting for ${label}`)
}

interface ActionFixtureState {
	readonly workflowPath: string
	readonly workflowName: string
	readonly runId: number
	readonly environment: string
	readonly artifactName: string
}

export const actionWorkflowYaml = (workflowName: string, artifactName: string) => `name: ${workflowName}
on:
  workflow_dispatch:
    inputs:
      message:
        description: Fixture message
        required: true
        type: string
      delay:
        description: Delay before completion
        required: true
        type: choice
        default: "30"
        options:
          - "0"
          - "30"
      publish:
        description: Publish artifact
        required: true
        type: boolean
        default: true
      target:
        description: Deployment environment
        required: true
        type: environment
      recipient:
        description: Dedicated notification recipient
        required: true
        type: string
permissions:
  contents: read
  issues: write
jobs:
  parity:
    runs-on: ubuntu-latest
    environment: \${{ inputs.target }}
    steps:
      - name: Delay
        run: sleep "\${{ inputs.delay }}"
      - name: Build fixture
        run: printf '%s\\n' "\${{ inputs.message }}" > artifact.txt
      - name: Upload fixture
        if: \${{ inputs.publish }}
        uses: actions/upload-artifact@v4
        with:
          name: ${artifactName}
          path: artifact.txt
      - name: Notify fixture identity
        env:
          GH_TOKEN: \${{ github.token }}
        run: gh issue create --repo "\${{ github.repository }}" --title "${workflowName}-notification" --body "@\${{ inputs.recipient }} ${workflowName} notification"
`

const workflowContentSha = async (repository: string, workflowPath: string): Promise<string | null> => {
	try {
		return (await ghJson<{ readonly sha: string }>(["api", `repos/${repository}/contents/${workflowPath}`])).sha
	} catch {
		return null
	}
}

const cleanupActionFixtures = async (repository: string, defaultBranch: string, ledger: ReturnType<typeof createLiveFixtureLedger>): Promise<void> => {
	const pending = ledger.pending()
	const runs = pending.filter((fixture) => fixture.kind === "workflowRun")
	const artifacts = pending.filter((fixture) => fixture.kind === "artifact")
	const environments = pending.filter((fixture) => fixture.kind === "environment")
	const deployments = pending.filter((fixture) => fixture.kind === "deployment")
	const workflows = pending.filter((fixture) => fixture.kind === "workflow")
	const issues = pending.filter((fixture) => fixture.kind === "issue")
	const notifications = pending.filter((fixture) => fixture.kind === "notification")
	await cleanupAll([
		...notifications.map((fixture) => async () => {
			await commandOutput("gh", ["api", "--method", "PATCH", `notifications/threads/${encodeURIComponent(fixture.id)}`])
			ledger.recordCleanup(fixture.kind, fixture.id, "retained", "Fixture notification was intentionally marked read.")
		}),
		...issues.map((fixture) => async () => {
			await commandOutput("gh", ["issue", "delete", fixture.id, "--repo", repository, "--yes"])
			ledger.recordCleanup(fixture.kind, fixture.id, "removed")
		}),
		...runs.map((fixture) => async () => {
			await commandOutput("gh", ["api", "--method", "DELETE", `repos/${repository}/actions/runs/${fixture.id}`])
			ledger.recordCleanup(fixture.kind, fixture.id, "removed")
			for (const artifact of artifacts) ledger.recordCleanup(artifact.kind, artifact.id, "removed", "Artifact removed with its workflow run.")
		}),
		...environments.map((fixture) => async () => {
			await commandOutput("gh", ["api", "--method", "DELETE", `repos/${repository}/environments/${encodeURIComponent(fixture.id)}`])
			ledger.recordCleanup(fixture.kind, fixture.id, "removed")
			for (const deployment of deployments) ledger.recordCleanup(deployment.kind, deployment.id, "removed", "Deployment removed with its environment.")
		}),
		...workflows.map((fixture) => async () => {
			const sha = await workflowContentSha(repository, fixture.id)
			if (sha) {
				await commandOutput(
					"gh",
					["api", "--method", "DELETE", `repos/${repository}/contents/${fixture.id}`, "--input", "-"],
					JSON.stringify({ message: `Remove ${fixture.name}`, sha, branch: defaultBranch }),
				)
			}
			ledger.recordCleanup(fixture.kind, fixture.id, "removed")
		}),
	])
}

const makeActionFixtureOperation = ({
	service,
	repository,
	defaultBranch,
	viewer,
	runPrefix,
	ledger,
}: {
	readonly service: LiveService
	readonly repository: string
	readonly defaultBranch: string
	readonly viewer: string
	readonly runPrefix: string
	readonly ledger: ReturnType<typeof createLiveFixtureLedger>
}): LiveFixtureOperation<ActionFixtureState> => {
	const workflowName = `${runPrefix}-actions`
	const workflowPath = `.github/workflows/${runPrefix}.yml`
	const environment = `${runPrefix}-environment`
	const artifactName = `${runPrefix}-artifact`
	const notificationIssueTitle = `${workflowName}-notification`
	const reconcile = async () => {
		try {
			if (!ledger.inventory().some((fixture) => fixture.kind === "workflowRun")) {
				const run = (await execute(service.listWorkflowRuns(repository, 50))).find((candidate) => candidate.workflowName === workflowName)
				if (run) ledger.record({ kind: "workflowRun", id: String(run.id), name: `${runPrefix}-run-${run.id}` })
			}
		} catch {}
		try {
			if (!ledger.inventory().some((fixture) => fixture.kind === "environment")) {
				const target = (await execute(service.listEnvironments(repository))).find((candidate) => candidate.name === environment)
				if (target) ledger.record({ kind: "environment", id: target.name, name: target.name })
			}
		} catch {}
		try {
			const recordedIssues = new Set(
				ledger
					.inventory()
					.filter((fixture) => fixture.kind === "issue")
					.map((fixture) => fixture.id),
			)
			for (const number of await exactIssueNumbers(repository, notificationIssueTitle)) {
				if (!recordedIssues.has(String(number))) ledger.record({ kind: "issue", id: String(number), name: notificationIssueTitle })
			}
		} catch {}
	}

	return {
		id: "actions-artifacts-environment",
		setup: async () => {
			try {
				await commandOutput(
					"gh",
					["api", "--method", "PUT", `repos/${repository}/contents/${workflowPath}`, "--input", "-"],
					JSON.stringify({
						message: `${runPrefix} parity workflow`,
						content: Buffer.from(actionWorkflowYaml(workflowName, artifactName)).toString("base64"),
						branch: defaultBranch,
					}),
				)
				ledger.record({ kind: "workflow", id: workflowPath, name: workflowName })
				const workflow = await waitForValue("fixture workflow registration", async () => {
					const workflows = await execute(service.listWorkflows(repository))
					return workflows.find((candidate) => candidate.name === workflowName) ?? null
				})
				const inputs = await execute(service.getWorkflowInputs(repository, workflow.path))
				if (!["message", "delay", "publish", "target", "recipient"].every((name) => inputs.some((input) => input.name === name))) {
					throw new Error("Fixture workflow inputs did not round-trip through the typed parser")
				}
				await execute(
					service.dispatchWorkflow({
						repository,
						workflow: workflow.path,
						ref: defaultBranch,
						values: { message: runPrefix, delay: "30", publish: true, target: environment, recipient: viewer },
					}),
				)
				const run = await waitForValue("dispatched fixture run", async () => {
					const runs = await execute(service.listWorkflowRuns(repository, 50))
					return runs.find((candidate) => candidate.workflowName === workflowName) ?? null
				})
				ledger.record({ kind: "workflowRun", id: String(run.id), name: `${runPrefix}-run-${run.id}` })
				return { workflowPath, workflowName, runId: run.id, environment, artifactName }
			} catch (cause) {
				await reconcile()
				try {
					await cleanupActionFixtures(repository, defaultBranch, ledger)
				} catch (cleanupCause) {
					throw new Error(
						`${cause instanceof Error ? cause.message : String(cause)}; cleanup residue: ${cleanupCause instanceof Error ? cleanupCause.message : String(cleanupCause)}`,
					)
				}
				throw cause
			}
		},
		verify: async (fixture) => {
			await execute(service.cancelRun(repository, fixture.runId))
			await waitForValue("cancelled fixture run", async () => {
				const run = (await execute(service.listWorkflowRuns(repository, 50))).find((candidate) => candidate.id === fixture.runId)
				return run?.status === "completed" ? run : null
			})
			await execute(service.retryRun(repository, fixture.runId))
			const completed = await waitForValue(
				"successful fixture rerun",
				async () => {
					const run = (await execute(service.listWorkflowRuns(repository, 50))).find((candidate) => candidate.id === fixture.runId)
					return run?.status === "completed" && run.attempt >= 2 && run.conclusion === "success" ? run : null
				},
				{ attempts: 90 },
			)
			const details = await execute(service.getWorkflowRunDetails(repository, completed.id))
			const job = requireItems(details.jobs, "a fixture workflow job")
			const log = await execute(service.getJobLog(repository, job.id))
			if (!log.text.includes(runPrefix)) throw new Error("Fixture job log omitted its marker")

			const artifact = (await execute(service.listArtifacts(repository, completed.id))).find((candidate) => candidate.name === fixture.artifactName)
			if (!artifact) throw new Error("Successful fixture rerun did not publish its artifact")
			ledger.record({ kind: "artifact", id: String(artifact.id), name: fixture.artifactName })
			const destination = `/tmp/${runPrefix}-artifact-download`
			const downloaded = await execute(service.downloadArtifact(repository, completed.id, fixture.artifactName, destination))
			if (!downloaded.endsWith(`${runPrefix}-artifact-download`)) throw new Error("Artifact download destination did not round-trip")

			const target = (await execute(service.listEnvironments(repository))).find((candidate) => candidate.name === fixture.environment)
			if (!target) throw new Error("Fixture environment was not visible")
			ledger.record({ kind: "environment", id: target.name, name: target.name })
			const deployment = requireItems(await execute(service.listDeployments(repository, target.name)), "a fixture deployment")
			ledger.record({ kind: "deployment", id: String(deployment.id), name: `${runPrefix}-deployment-${deployment.id}` })

			const notificationIssue = await waitForValue("notification fixture Issue", async () => {
				const numbers = await exactIssueNumbers(repository, notificationIssueTitle)
				return numbers[0] ?? null
			})
			ledger.record({ kind: "issue", id: String(notificationIssue), name: notificationIssueTitle })
			const notification = await waitForValue(
				"dedicated fixture notification",
				async () => {
					const notifications = await execute(service.listNotifications(false))
					return notifications.find((candidate) => candidate.repository === repository && candidate.subject === notificationIssueTitle) ?? null
				},
				{ attempts: 90 },
			)
			ledger.record({ kind: "notification", id: notification.id, name: `${runPrefix}-notification-${notification.id}` })
			await execute(service.markNotificationRead(notification.id))
			const updated = (await execute(service.listNotifications(true))).find((candidate) => candidate.id === notification.id)
			if (!updated || updated.unread) throw new Error("Fixture notification did not converge to read")
			ledger.recordCleanup("notification", notification.id, "retained", "Fixture notification was intentionally marked read.")
		},
		cleanup: async () => {
			await reconcile()
			await cleanupAll([() => cleanupActionFixtures(repository, defaultBranch, ledger), () => rm(`/tmp/${runPrefix}-artifact-download`, { recursive: true, force: true })])
		},
	}
}

const eraseFixtureOperation = <A>(operation: LiveFixtureOperation<A>): LiveFixtureOperation<unknown> => ({
	id: operation.id,
	setup: operation.setup,
	verify: (fixture) => operation.verify(fixture as A),
	cleanup: (fixture) => operation.cleanup(fixture as A),
})

const makeCoreFixtureOperation = ({
	service,
	repository,
	defaultBranch,
	sourceSha,
	viewer,
	runPrefix,
	ledger,
	onVerified,
}: {
	readonly service: LiveService
	readonly repository: string
	readonly defaultBranch: string
	readonly sourceSha: string
	readonly viewer: string
	readonly runPrefix: string
	readonly ledger: ReturnType<typeof createLiveFixtureLedger>
	readonly onVerified: () => Promise<void>
}): LiveFixtureOperation<CoreFixtureState> => {
	const label = `${runPrefix}-label`
	const issuePrefix = `${runPrefix}-issue`
	const milestoneTitle = `${runPrefix}-milestone`
	const releaseTag = `${runPrefix}-release`
	const branchName = `${runPrefix}-branch`
	const pullRequestTitle = `${runPrefix}-pull-request`
	const filePath = `ghui-parity/${runPrefix}.txt`

	return {
		id: "core-github-fixtures",
		setup: async () => {
			try {
				await commandOutput("gh", ["label", "create", label, "--repo", repository, "--color", "5319E7", "--description", "ghui parity fixture"])
				ledger.record({ kind: "label", id: label, name: label })

				const milestone = await execute(
					service.createMilestone({
						repository,
						title: milestoneTitle,
						description: `${runPrefix} live parity milestone`,
						dueOn: new Date(Date.now() + 86_400_000),
					}),
				)
				ledger.record({ kind: "milestone", id: String(milestone.number), name: milestoneTitle })

				const createdIssues: number[] = []
				for (let index = 1; index <= 3; index++) {
					const title = `${issuePrefix}-${index}`
					await execute(
						service.createIssue({
							repository,
							title,
							body: `${runPrefix} live parity issue ${index}`,
							labels: [label],
							milestone: milestoneTitle,
						}),
					)
					const number = (await exactIssueNumbers(repository, title))[0]
					if (!number) throw new Error(`Created fixture Issue ${title} was not discoverable`)
					createdIssues.push(number)
					ledger.record({ kind: "issue", id: String(number), name: title })
				}
				const issues = createdIssues
				if (issues.length !== 3) throw new Error(`Expected three fixture Issues, found ${issues.length}`)

				await execute(
					service.createRelease({
						repository,
						tagName: releaseTag,
						name: `${runPrefix} release`,
						body: `${runPrefix} release body`,
						isDraft: true,
						isPrerelease: false,
						targetCommitish: defaultBranch,
					}),
				)
				ledger.record({ kind: "release", id: releaseTag, name: releaseTag })

				await execute(service.createBranch({ repository, name: branchName, sourceRef: defaultBranch, sourceSha }))
				ledger.record({ kind: "branch", id: branchName, name: branchName })
				await commandOutput(
					"gh",
					["api", "--method", "PUT", `repos/${repository}/contents/${filePath}`, "--input", "-"],
					JSON.stringify({
						message: `${runPrefix} fixture change`,
						content: Buffer.from(`${runPrefix} fixture line\n`).toString("base64"),
						branch: branchName,
					}),
				)
				await execute(
					service.createPullRequest({
						repository,
						title: pullRequestTitle,
						body: `${runPrefix} Pull Request body`,
						base: defaultBranch,
						head: branchName,
						draft: true,
						labels: [label],
						assignees: [viewer],
						milestone: milestoneTitle,
					}),
				)
				const pullRequestNumber = await exactPullRequestNumber(repository, pullRequestTitle)
				ledger.record({ kind: "pullRequest", id: String(pullRequestNumber), name: pullRequestTitle })

				return {
					label,
					milestoneNumber: milestone.number,
					milestoneTitle,
					issues,
					releaseTag,
					branchName,
					pullRequestNumber,
				}
			} catch (cause) {
				try {
					const recorded = new Set(ledger.inventory().map((fixture) => `${fixture.kind}:${fixture.id}`))
					for (const number of await exactIssueNumbers(repository, issuePrefix)) {
						if (!recorded.has(`issue:${number}`)) ledger.record({ kind: "issue", id: String(number), name: `${issuePrefix}-${number}` })
					}
					if (!ledger.inventory().some((fixture) => fixture.kind === "pullRequest")) {
						try {
							const number = await exactPullRequestNumber(repository, pullRequestTitle)
							ledger.record({ kind: "pullRequest", id: String(number), name: pullRequestTitle })
						} catch {}
					}
				} catch {}
				try {
					await cleanupRecordedFixtures(service, repository, ledger)
				} catch (cleanupCause) {
					throw new Error(
						`${cause instanceof Error ? cause.message : String(cause)}; cleanup residue: ${cleanupCause instanceof Error ? cleanupCause.message : String(cleanupCause)}`,
					)
				}
				throw cause
			}
		},
		verify: async (fixture) => {
			const firstIssue = fixture.issues[0]!
			await execute(
				service.editIssue({
					repository,
					number: firstIssue,
					title: `${issuePrefix}-edited`,
					body: `${runPrefix} edited body`,
					milestone: fixture.milestoneTitle,
				}),
			)
			await execute(service.closeIssue(repository, firstIssue))
			await execute(service.reopenIssue(repository, firstIssue))
			const bulk = await runBulkItems(fixture.issues, (number) => execute(service.addIssueLabel(repository, number, fixture.label)), { concurrency: 3 })
			if (bulk.succeeded !== fixture.issues.length) throw new Error("Bulk Issue label verification did not fully succeed")

			await execute(
				service.editMilestone({
					repository,
					number: fixture.milestoneNumber,
					title: fixture.milestoneTitle,
					description: `${runPrefix} edited milestone`,
					dueOn: null,
					state: "closed",
				}),
			)
			await execute(
				service.editMilestone({
					repository,
					number: fixture.milestoneNumber,
					title: fixture.milestoneTitle,
					description: `${runPrefix} reopened milestone`,
					dueOn: null,
					state: "open",
				}),
			)
			const milestoneIssues = await execute(service.listMilestoneIssues(repository, fixture.milestoneTitle))
			if (!fixture.issues.every((number) => milestoneIssues.some((issue) => issue.number === number))) throw new Error("Milestone omitted a fixture Issue")

			const release = await execute(service.getRelease(repository, fixture.releaseTag))
			await execute(
				service.editRelease({
					repository,
					tagName: fixture.releaseTag,
					name: `${runPrefix} edited release`,
					body: `${runPrefix} edited release body`,
					isDraft: release.isDraft,
					isPrerelease: true,
					targetCommitish: defaultBranch,
				}),
			)

			await execute(
				service.editPullRequest({
					repository,
					number: fixture.pullRequestNumber,
					title: `${pullRequestTitle} edited`,
					body: `${runPrefix} edited Pull Request body`,
					base: defaultBranch,
					addLabels: [fixture.label],
				}),
			)
			await execute(service.toggleDraftStatus(repository, fixture.pullRequestNumber, true))
			await execute(service.toggleDraftStatus(repository, fixture.pullRequestNumber, false))
			await execute(service.closePullRequest(repository, fixture.pullRequestNumber))
			await execute(service.reopenPullRequest(repository, fixture.pullRequestNumber))
			const details = await execute(service.getPullRequestDetails(repository, fixture.pullRequestNumber))
			const patch = await execute(service.getPullRequestDiff(repository, fixture.pullRequestNumber))
			if (!patch.includes(filePath)) throw new Error("Fixture Pull Request diff omitted its changed file")

			const pending = await execute(service.createPendingReview(repository, fixture.pullRequestNumber, details.headRefOid))
			await execute(
				service.addPendingReviewComment(pending, {
					repository,
					number: fixture.pullRequestNumber,
					commitId: details.headRefOid,
					path: filePath,
					line: 1,
					side: "RIGHT",
					body: `\`\`\`suggestion\n${runPrefix} suggested line\n\`\`\``,
				}),
			)
			await execute(service.submitPendingReview(pending, "COMMENT", `${runPrefix} atomic review`))
			await onVerified()
		},
		cleanup: async () => cleanupRecordedFixtures(service, repository, ledger),
	}
}

const runCoreMutationSuite = async ({
	repository,
	defaultBranch,
	viewer,
	runPrefix,
	output,
}: {
	readonly repository: string
	readonly defaultBranch: string
	readonly viewer: string
	readonly runPrefix: string
	readonly output: string
}) => {
	const service = await makeService()
	const defaultBranchItem = (await execute(service.listBranches(repository))).find((branch) => branch.name === defaultBranch && branch.isDefault)
	if (!defaultBranchItem) throw new Error(`Could not resolve default branch ${defaultBranch}`)
	const ledger = createLiveFixtureLedger(runPrefix)
	let readResults: readonly LiveScenarioResult[] = []
	const actionOperation = makeActionFixtureOperation({
		service,
		repository,
		defaultBranch,
		viewer,
		runPrefix,
		ledger,
	})
	const coreOperation = makeCoreFixtureOperation({
		service,
		repository,
		defaultBranch,
		sourceSha: defaultBranchItem.sha,
		viewer,
		runPrefix,
		ledger,
		onVerified: async () => {
			readResults = await runReadSuite(repository, viewer)
		},
	})
	const operationResults = await executeLiveFixtureOperations([eraseFixtureOperation(actionOperation), eraseFixtureOperation(coreOperation)], async (results) => {
		await mkdir(dirname(output), { recursive: true })
		await writeFile(
			output,
			`${JSON.stringify(
				{
					schemaVersion: 1,
					generatedAt: new Date().toISOString(),
					mode: "apply",
					inProgress: true,
					repository,
					runPrefix,
					operationResults: results,
					cleanupInventory: ledger.inventory(),
				},
				null,
				2,
			)}\n`,
			{ mode: 0o600 },
		)
		await chmod(output, 0o600)
	})
	const actionResult = operationResults[0]!
	const coreResult = operationResults[1]!
	const actionPassed = actionResult.setup === "passed" && actionResult.verify === "passed" && actionResult.cleanup === "passed"
	const corePassed = coreResult.setup === "passed" && coreResult.verify === "passed" && coreResult.cleanup === "passed"
	const actionStatus: ScenarioStatus = actionPassed ? "passed" : actionResult.setup === "not-run" ? "blocked" : "failed"
	const coreStatus: ScenarioStatus = corePassed ? "passed" : coreResult.setup === "not-run" ? "blocked" : "failed"
	const coreDetail = corePassed
		? "Created, mutated, observed, and cleaned the prefixed live fixture."
		: [coreResult.detail, coreResult.cleanupDetail].filter(Boolean).join("; ") || "Core fixture operation did not complete."
	const coreResults = ["releases", "issue-management", "pull-request-management", "bulk-item-operations", "pending-reviews", "suggestions", "branches", "milestones"].map(
		(capabilityId) => result(capabilityId, "destructive", coreStatus, coreDetail, 0),
	)
	const actionDetail = actionPassed
		? "Dispatched, cancelled, reran, inspected, downloaded, and cleaned the prefixed Actions fixture."
		: [actionResult.detail, actionResult.cleanupDetail].filter(Boolean).join("; ") || "Actions fixture operation did not complete."
	const actionResults = ["actions", "action-artifacts", "environments-deployments", "notifications"].map((capabilityId) =>
		result(capabilityId, "destructive", actionStatus, actionDetail, 0),
	)
	const replacedIds = new Set([...coreResults, ...actionResults].map((entry) => entry.capabilityId))
	const available = new Map(
		[...readResults.filter((entry) => !replacedIds.has(entry.capabilityId)), ...coreResults, ...actionResults].map((entry) => [entry.capabilityId, entry] as const),
	)
	return {
		scenarios: liveRunnerCapabilityIds.map(
			(capabilityId) => available.get(capabilityId) ?? result(capabilityId, "mutate", "blocked", "Scenario was not reached because an earlier fixture operation failed.", 0),
		),
		cleanupInventory: ledger.inventory(),
		operationResults,
	}
}

const emptySummary = (): Record<ScenarioStatus, number> => ({ passed: 0, blocked: 0, failed: 0 })

export const buildSummary = (scenarios: readonly LiveScenarioResult[]): Readonly<Record<ScenarioStatus, number>> =>
	scenarios.reduce((summary, scenario) => {
		summary[scenario.status] += 1
		return summary
	}, emptySummary())

const writeReport = async (path: string, report: LiveParityReport) => {
	await mkdir(dirname(path), { recursive: true })
	await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
	await chmod(path, 0o600)
}

export const runLiveParity = async (
	args: readonly string[],
	environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{ readonly report: LiveParityReport; readonly exitCode: number; readonly output: string }> => {
	const configuration = readConfiguration(args, environment)
	const mode: LiveParityReport["mode"] = configuration.apply ? "apply" : args.includes("--read") ? "read" : "check"
	const checked = await preflight(configuration)
	let scenarios: readonly LiveScenarioResult[] = []
	let cleanupInventory: readonly unknown[] = []

	if (checked.problems.length === 0 && checked.repository && checked.viewer && mode !== "check") {
		if (mode === "apply" && checked.repository.defaultBranchRef) {
			try {
				const mutation = await runCoreMutationSuite({
					repository: checked.repository.nameWithOwner,
					defaultBranch: checked.repository.defaultBranchRef.name,
					viewer: checked.viewer.login,
					runPrefix: configuration.runPrefix,
					output: configuration.output,
				})
				scenarios = mutation.scenarios
				cleanupInventory = [...mutation.cleanupInventory, ...mutation.operationResults]
			} catch (cause) {
				const detail = cause instanceof Error ? cause.message : String(cause)
				scenarios = liveRunnerCapabilityIds.map((capabilityId) => result(capabilityId, "destructive", "failed", detail, 0))
			}
		} else {
			scenarios = await runReadSuite(checked.repository.nameWithOwner, checked.viewer.login)
		}
	}

	const report: LiveParityReport = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		mode,
		repository: checked.repository?.nameWithOwner ?? configuration.repository,
		identity: checked.viewer?.login ?? configuration.identity,
		markerTopic: MARKER_TOPIC,
		preflight: {
			passed: checked.problems.length === 0,
			problems: checked.problems,
			permission: checked.repository?.viewerPermission ?? null,
			defaultBranch: checked.repository?.defaultBranchRef?.name ?? null,
		},
		summary: buildSummary(scenarios),
		scenarios,
		cleanupInventory,
	}
	await writeReport(configuration.output, report)
	const exitCode =
		checked.problems.length > 0 ? 2 : scenarios.some((scenario) => scenario.status === "failed") ? 1 : scenarios.some((scenario) => scenario.status === "blocked") ? 3 : 0
	return { report, exitCode, output: configuration.output }
}

if (import.meta.main) {
	const { report, exitCode, output } = await runLiveParity(Bun.argv.slice(2))
	process.stdout.write(
		`${JSON.stringify(
			{
				mode: report.mode,
				preflight: report.preflight,
				summary: report.summary,
				output,
			},
			null,
			2,
		)}\n`,
	)
	process.exit(exitCode)
}
