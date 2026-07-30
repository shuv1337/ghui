import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GitHubService } from "../src/services/GitHubService.ts"
import { parseWorkflowDispatchInputs } from "../src/services/github/actions.ts"
import { createFakeGh } from "./support/fakeGh.ts"

const temporaryPaths: string[] = []
afterEach(() => {
	for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true })
})

const viewerRoute = {
	id: "viewer",
	match: { command: "gh", args: ["api", "user"] },
	responses: [{ stdout: '{"login":"octocat"}' }],
} as const

const rawRun = {
	databaseId: 41,
	number: 7,
	attempt: 2,
	workflowName: "CI",
	name: "CI",
	displayTitle: "Feature",
	event: "workflow_dispatch",
	headBranch: "feature",
	headSha: "abc123",
	status: "completed",
	conclusion: "failure",
	url: "https://github.com/owner/repo/actions/runs/41",
	createdAt: "2026-07-01T10:00:00Z",
	startedAt: null,
	updatedAt: "2026-07-01T10:05:00Z",
}

const runWith = <A>(effect: Effect.Effect<A, unknown, GitHubService>, layer: Layer.Layer<GitHubService>) =>
	Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A>)

describe("GitHub Actions command contracts", () => {
	test("parses required, default, boolean, and choice workflow inputs", () => {
		const inputs = parseWorkflowDispatchInputs(`name: Release
on:
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        type: choice
        default: staging
        options:
          - staging
          - production
      dry_run:
        description: Do not deploy
        required: false
        type: boolean
        default: true
jobs: {}`)
		expect(inputs).toEqual([
			{
				name: "environment",
				description: "Target environment",
				required: true,
				type: "choice",
				defaultValue: "staging",
				options: ["staging", "production"],
			},
			{
				name: "dry_run",
				description: "Do not deploy",
				required: false,
				type: "boolean",
				defaultValue: true,
				options: [],
			},
		])
		expect(
			parseWorkflowDispatchInputs(`on:
  workflow_call:
    inputs:
      ignored:
        type: string
  workflow_dispatch:
    inputs:
      selected:
        type: environment
        required: true`),
		).toEqual([{ name: "selected", description: "", required: true, type: "environment", defaultValue: null, options: [] }])
	})

	test("lists repository workflows and runs with exact native argv", async () => {
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "workflows",
					match: { command: "gh", args: ["workflow", "list", "--repo", "owner/repo", "--all", "--limit", "25", "--json", "id,name,state,path"] },
					responses: [{ stdout: JSON.stringify([{ id: 3, name: "CI", state: "active", path: ".github/workflows/ci.yml" }]) }],
				},
				{
					id: "runs",
					match: { command: "gh", argsContain: ["run", "list", "--repo", "owner/repo", "--limit", "30"] },
					responses: [{ stdout: JSON.stringify([rawRun]) }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const result = await runWith(
			GitHubService.use((github) =>
				Effect.all([github.listWorkflows("owner/repo", 25), github.listWorkflowRuns("owner/repo", 30)], {
					concurrency: 1,
				}),
			),
			layer,
		)
		expect(result[0][0]).toMatchObject({ id: 3, state: "active" })
		expect(result[1][0]).toMatchObject({ id: 41, attempt: 2, conclusion: "failure", startedAt: null })
	})

	test("dispatches inputs on stdin and controls runs without exposing values in argv", async () => {
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "dispatch",
					match: { command: "gh", args: ["workflow", "run", "release.yml", "--repo", "owner/repo", "--ref", "main", "--json"] },
					responses: [{ stdout: "" }],
				},
				{ id: "rerun", match: { command: "gh", args: ["run", "rerun", "41", "--repo", "owner/repo", "--failed"] }, responses: [{ stdout: "" }] },
				{ id: "cancel", match: { command: "gh", args: ["run", "cancel", "41", "--repo", "owner/repo"] }, responses: [{ stdout: "" }] },
				{ id: "log", match: { command: "gh", args: ["run", "view", "--job", "99", "--log", "--repo", "owner/repo"] }, responses: [{ stdout: "line 1\nline 2\n" }] },
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const result = await runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.dispatchWorkflow({
						repository: "owner/repo",
						workflow: "release.yml",
						ref: "main",
						values: { production_deploy_key: "Synthetic private workflow input", dry_run: true },
					})
					yield* github.retryRun("owner/repo", 41, true)
					yield* github.cancelRun("owner/repo", 41)
					return yield* github.getJobLog("owner/repo", 99)
				}),
			),
			layer,
		)
		expect(result.text).toBe("line 1\nline 2\n")
		expect(fake.invocations[1]!.stdin).toBe('{"dry_run":true,"production_deploy_key":"Synthetic private workflow input"}')
		expect(fake.invocations[1]!.args.join(" ")).not.toContain("Synthetic private workflow input")
		expect(fake.snapshot()[1]!.stdin).toBe("[REDACTED]")
	})

	test("lists artifacts, rejects traversal and occupied destinations, then downloads explicitly", async () => {
		const root = mkdtempSync(join(tmpdir(), "ghui-artifacts-"))
		temporaryPaths.push(root)
		const empty = join(root, "empty")
		const occupied = join(root, "occupied")
		mkdirSync(empty)
		mkdirSync(occupied)
		writeFileSync(join(occupied, "keep.txt"), "keep")
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "artifacts",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "repos/owner/repo/actions/runs/41/artifacts?per_page=100"] },
					responses: [
						{
							stdout: JSON.stringify([
								{
									artifacts: [
										{
											id: 8,
											name: "linux-build",
											size_in_bytes: 1024,
											expired: false,
											created_at: "2026-07-01T10:00:00Z",
											expires_at: null,
										},
									],
								},
								{
									artifacts: [
										{
											id: 9,
											name: "docs-build",
											size_in_bytes: 512,
											expired: true,
											created_at: "2026-07-01T11:00:00Z",
											expires_at: "2026-07-02T11:00:00Z",
										},
									],
								},
							]),
						},
					],
				},
				{
					id: "download",
					match: { command: "gh", argsContain: ["run", "download", "41", "--repo", "owner/repo", "--name", "linux-build", "--dir"] },
					responses: [{ stdout: "" }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const artifacts = await runWith(
			GitHubService.use((github) => github.listArtifacts("owner/repo", 41)),
			layer,
		)
		expect(artifacts[0]).toMatchObject({ name: "linux-build", sizeInBytes: 1024, expiresAt: null })
		expect(artifacts[1]).toMatchObject({ name: "docs-build", expired: true })
		const unsafe = await runWith(
			GitHubService.use((github) => github.downloadArtifact("owner/repo", 41, "../escape", empty)),
			layer,
		).catch((error) => error)
		const occupiedError = await runWith(
			GitHubService.use((github) => github.downloadArtifact("owner/repo", 41, "linux-build", occupied)),
			layer,
		).catch((error) => error)
		expect(unsafe).toMatchObject({ detail: "Unsafe artifact name." })
		expect(occupiedError).toMatchObject({ detail: "Artifact destination must be empty." })
		expect(
			await runWith(
				GitHubService.use((github) => github.downloadArtifact("owner/repo", 41, "linux-build", empty)),
				layer,
			),
		).toBe(empty)
	})

	test("removes staging data when an artifact download is interrupted", async () => {
		const root = mkdtempSync(join(tmpdir(), "ghui-artifact-interrupt-"))
		temporaryPaths.push(root)
		const destination = join(root, "download")
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "download-timeout",
					match: { command: "gh", argsContain: ["run", "download", "41", "--name", "linux-build"] },
					responses: [{ timeout: true }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		await runWith(
			GitHubService.use((github) => github.downloadArtifact("owner/repo", 41, "linux-build", destination)),
			layer,
		).catch(() => undefined)
		expect(readdirSync(root)).toEqual([])
	})

	test("normalizes rerun attempts, matrix jobs, absent timestamps, and cancelled or skipped rows", async () => {
		const details = {
			...rawRun,
			attempt: 3,
			jobs: [
				{
					databaseId: 91,
					name: "test (os=ubuntu, node=22)",
					status: "completed",
					conclusion: "cancelled",
					startedAt: null,
					completedAt: null,
					url: "https://github.com/owner/repo/actions/jobs/91",
					steps: [
						{ number: 2, name: "Skipped upload", status: "completed", conclusion: "skipped", startedAt: null, completedAt: null },
						{ number: 1, name: "Matrix setup", status: "completed", conclusion: "success", startedAt: null, completedAt: null },
					],
				},
			],
		}
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "details",
					match: { command: "gh", argsContain: ["run", "view", "41", "--repo", "owner/repo", "--json"] },
					responses: [{ stdout: JSON.stringify(details) }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const result = await runWith(
			GitHubService.use((github) => github.getWorkflowRunDetails("owner/repo", 41)),
			layer,
		)
		expect(result.attempt).toBe(3)
		expect(result.jobs[0]).toMatchObject({ name: "test (os=ubuntu, node=22)", conclusion: "cancelled", startedAt: null, completedAt: null })
		expect(result.jobs[0]?.steps.map((step) => [step.number, step.conclusion])).toEqual([
			[1, "success"],
			[2, "skipped"],
		])
	})

	test("preserves a large on-demand log and surfaces permission and timeout failures honestly", async () => {
		const largeLog = Array.from({ length: 20_000 }, (_, index) => `line ${index}`).join("\n")
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "large-log",
					match: { command: "gh", args: ["run", "view", "--job", "99", "--log", "--repo", "owner/repo"] },
					responses: [{ stdout: largeLog }, { timeout: true }],
				},
				{
					id: "artifacts-denied",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "repos/owner/repo/actions/runs/41/artifacts?per_page=100"] },
					responses: [{ exitCode: 1, stderr: "HTTP 403: Resource not accessible by integration" }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const log = await runWith(
			GitHubService.use((github) => github.getJobLog("owner/repo", 99)),
			layer,
		)
		expect(log.text.length).toBe(largeLog.length)
		expect(log.text.endsWith("line 19999")).toBe(true)
		const denied = await runWith(
			GitHubService.use((github) => github.listArtifacts("owner/repo", 41)),
			layer,
		).catch((error) => error)
		expect(denied).toMatchObject({ detail: "HTTP 403: Resource not accessible by integration" })
		const timeout = await runWith(
			GitHubService.use((github) => github.getJobLog("owner/repo", 99)),
			layer,
		).catch((error) => error)
		expect(timeout).toMatchObject({ detail: "Timed out after 50ms" })
	})

	test("bounds native list limits and rejects malformed run responses", async () => {
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "bounded",
					match: { command: "gh", argsContain: ["run", "list", "--repo", "owner/repo", "--limit", "1000"] },
					responses: [{ stdout: "[]" }, { stdout: '[{"databaseId":"not-a-number"}]' }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		expect(
			await runWith(
				GitHubService.use((github) => github.listWorkflowRuns("owner/repo", 50_000)),
				layer,
			),
		).toEqual([])
		const malformed = await runWith(
			GitHubService.use((github) => github.listWorkflowRuns("owner/repo", 50_000)),
			layer,
		).catch((error) => error)
		expect(malformed).toHaveProperty("_tag", "SchemaError")
	})
})
