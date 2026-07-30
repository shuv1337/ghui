import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { GitHubService } from "../src/services/GitHubService.ts"
import { branchDeleteDisabledReason, branchNameValidationError } from "../src/services/github/branches.ts"
import { milestoneProgressPercent } from "../src/services/github/milestones.ts"
import { createFakeGh } from "./support/fakeGh.ts"

const viewerRoute = {
	id: "viewer",
	match: { command: "gh", args: ["api", "user"] },
	responses: [{ stdout: '{"login":"octocat"}' }],
} as const

const runWith = <A>(effect: Effect.Effect<A, unknown, GitHubService>, layer: Layer.Layer<GitHubService>) =>
	Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A>)

const milestoneRaw = {
	number: 7,
	title: "Parity",
	description: "Ship it",
	state: "open",
	open_issues: 3,
	closed_issues: 7,
	due_on: "2026-09-01T23:59:59Z",
	html_url: "https://github.com/owner/repo/milestone/7",
}

describe("GitHub repository resource contracts", () => {
	test("lists branches with default metadata and creates/deletes with exact refs and percent encoding", async () => {
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "branches",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "repos/owner/repo/branches?per_page=100"] },
					responses: [{ stdout: '[[{"name":"main","protected":true,"commit":{"sha":"aaa"}},{"name":"feature/x","protected":false,"commit":{"sha":"bbb"}}]]' }],
				},
				{
					id: "default",
					match: { command: "gh", args: ["repo", "view", "owner/repo", "--json", "defaultBranchRef"] },
					responses: [{ stdout: '{"defaultBranchRef":{"name":"main"}}' }],
				},
				{
					id: "create",
					match: { command: "gh", args: ["api", "--method", "POST", "repos/owner/repo/git/refs", "--input", "-"] },
					responses: [{ stdout: "" }],
				},
				{
					id: "delete",
					match: { command: "gh", args: ["api", "--method", "DELETE", "repos/owner/repo/git/refs/heads/feature%2Fx"] },
					responses: [{ stdout: "" }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const branches = await runWith(
			GitHubService.use((github) => github.listBranches("owner/repo")),
			layer,
		)
		expect(branches).toEqual([
			{ repository: "owner/repo", name: "main", sha: "aaa", protected: true, isDefault: true },
			{ repository: "owner/repo", name: "feature/x", sha: "bbb", protected: false, isDefault: false },
		])
		const created = await runWith(
			GitHubService.use((github) => github.createBranch({ repository: "owner/repo", name: "parity/m5", sourceRef: "main", sourceSha: "aaa" })),
			layer,
		)
		expect(created.name).toBe("parity/m5")
		expect(fake.invocations.find((invocation) => invocation.routeId === "create")?.stdin).toBe('{"ref":"refs/heads/parity/m5","sha":"aaa"}')
		await runWith(
			GitHubService.use((github) => github.deleteBranch("owner/repo", branches[1]!, null)),
			layer,
		)
	})

	test("validates ref names and guards default, protected, and checked-out branch deletion", () => {
		expect(branchNameValidationError("")).toBeDefined()
		expect(branchNameValidationError("bad..name")).toBeDefined()
		expect(branchNameValidationError("bad.lock")).toBeDefined()
		expect(branchNameValidationError("feature/good")).toBeNull()
		const base = { repository: "owner/repo", name: "topic", sha: "abc", protected: false, isDefault: false }
		expect(branchDeleteDisabledReason({ ...base, isDefault: true }, null)).toContain("default")
		expect(branchDeleteDisabledReason({ ...base, protected: true }, null)).toContain("Protected")
		expect(branchDeleteDisabledReason(base, "topic")).toContain("currently selected")
		expect(branchDeleteDisabledReason(base, null)).toBeNull()
	})

	test("normalizes milestone progress and serializes create/edit/delete bodies", async () => {
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "list",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "repos/owner/repo/milestones?state=all&per_page=100"] },
					responses: [{ stdout: JSON.stringify([[milestoneRaw]]) }],
				},
				{
					id: "issues",
					match: {
						command: "gh",
						args: ["issue", "list", "--repo", "owner/repo", "--milestone", "Parity", "--state", "all", "--limit", "25", "--json", "number,title,state,url"],
					},
					responses: [{ stdout: '[{"number":1,"title":"Done","state":"CLOSED","url":"https://github.com/owner/repo/issues/1"}]' }],
				},
				{
					id: "create",
					match: { command: "gh", args: ["api", "--method", "POST", "repos/owner/repo/milestones", "--input", "-"] },
					responses: [{ stdout: JSON.stringify(milestoneRaw) }],
				},
				{
					id: "edit",
					match: { command: "gh", args: ["api", "--method", "PATCH", "repos/owner/repo/milestones/7", "--input", "-"] },
					responses: [{ stdout: JSON.stringify({ ...milestoneRaw, state: "closed" }) }],
				},
				{
					id: "delete",
					match: { command: "gh", args: ["api", "--method", "DELETE", "repos/owner/repo/milestones/7"] },
					responses: [{ stdout: "" }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const milestones = await runWith(
			GitHubService.use((github) => github.listMilestones("owner/repo")),
			layer,
		)
		expect(milestoneProgressPercent(milestones[0]!)).toBe(70)
		expect(milestoneProgressPercent({ openIssues: 0, closedIssues: 0 })).toBe(0)
		const issues = await runWith(
			GitHubService.use((github) => github.listMilestoneIssues("owner/repo", "Parity", 25)),
			layer,
		)
		expect(issues[0]?.state).toBe("closed")
		const input = { repository: "owner/repo", title: "Parity", description: "Ship it", dueOn: new Date("2026-09-01T00:00:00Z") }
		await runWith(
			GitHubService.use((github) => github.createMilestone(input)),
			layer,
		)
		await runWith(
			GitHubService.use((github) => github.editMilestone({ ...input, number: 7, state: "closed" })),
			layer,
		)
		await runWith(
			GitHubService.use((github) => github.deleteMilestone("owner/repo", 7)),
			layer,
		)
		expect(JSON.parse(fake.invocations.find((invocation) => invocation.routeId === "create")!.stdin!)).toEqual({
			title: "Parity",
			description: "Ship it",
			due_on: "2026-09-01T23:59:59.000Z",
		})
		expect(JSON.parse(fake.invocations.find((invocation) => invocation.routeId === "edit")!.stdin!).state).toBe("closed")
	})

	test("hydrates paginated environments/deployments and preserves no-deployment states", async () => {
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "environments",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "repos/owner/repo/environments?per_page=100"] },
					responses: [
						{
							stdout: JSON.stringify([
								{
									environments: [
										{ id: 1, name: "production", html_url: "https://github.com/owner/repo/deployments/production", protection_rules: [{}] },
										{ id: 2, name: "preview", html_url: "https://github.com/owner/repo/deployments/preview", protection_rules: [] },
									],
								},
							]),
						},
					],
				},
				{
					id: "production-deployments",
					match: { command: "gh", argsContain: ["repos/owner/repo/deployments?environment=production&per_page=100"] },
					responses: [
						{
							stdout: JSON.stringify([
								[
									{
										id: 10,
										environment: "production",
										ref: "main",
										sha: "abc",
										task: "deploy",
										description: null,
										created_at: "2026-07-01T10:00:00Z",
										updated_at: "2026-07-01T10:05:00Z",
										statuses_url: "ignored",
									},
								],
							]),
						},
					],
				},
				{
					id: "preview-deployments",
					match: { command: "gh", argsContain: ["repos/owner/repo/deployments?environment=preview&per_page=100"] },
					responses: [{ stdout: "[[]]" }],
				},
				{
					id: "statuses",
					match: { command: "gh", argsContain: ["repos/owner/repo/deployments/10/statuses?per_page=100"] },
					responses: [{ stdout: '[[{"state":"success","environment_url":"https://prod.example","target_url":null}]]' }],
				},
			],
		})
		const environments = await runWith(
			GitHubService.use((github) => github.listEnvironments("owner/repo")),
			GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer)),
		)
		expect(environments[0]?.latestDeployment).toMatchObject({ id: 10, state: "success", url: "https://prod.example" })
		expect(environments[1]?.latestDeployment).toBeNull()
	})

	test("lists runner status, busy state, label types, and surfaces admin permission failures", async () => {
		const success = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "runners",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "repos/owner/repo/actions/runners?per_page=100"] },
					responses: [
						{
							stdout: JSON.stringify([
								{
									total_count: 2,
									runners: [
										{ id: 1, name: "gpu", os: "linux", status: "online", busy: true, labels: [{ name: "gpu", type: "custom" }] },
										{ id: 2, name: "mac", os: "macos", status: "offline", busy: false, labels: [{ name: "self-hosted", type: "read-only" }] },
									],
								},
							]),
						},
					],
				},
			],
		})
		const runners = await runWith(
			GitHubService.use((github) => github.listRunners("owner/repo")),
			GitHubService.layerNoDeps.pipe(Layer.provide(success.layer)),
		)
		expect(runners.map((runner) => [runner.status, runner.busy, runner.labels[0]?.type])).toEqual([
			["online", true, "custom"],
			["offline", false, "read-only"],
		])

		const denied = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "denied",
					match: { command: "gh", argsContain: ["actions/runners?per_page=100"] },
					responses: [{ exitCode: 1, stderr: "HTTP 403: Must have admin rights to Repository." }],
				},
			],
		})
		await expect(
			runWith(
				GitHubService.use((github) => github.listRunners("owner/repo")),
				GitHubService.layerNoDeps.pipe(Layer.provide(denied.layer)),
			),
		).rejects.toBeDefined()
	})
})
