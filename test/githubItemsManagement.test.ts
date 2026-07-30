import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { GitHubService } from "../src/services/GitHubService.ts"
import { MockGitHubService } from "../src/services/MockGitHubService.ts"
import { createFakeGh } from "./support/fakeGh.ts"

const viewerRoute = {
	id: "viewer",
	match: { command: "gh", args: ["api", "user"] },
	responses: [{ stdout: '{"login":"parity-bot"}' }],
} as const

const runWith = <A>(effect: Effect.Effect<A, unknown, GitHubService>, routes: Parameters<typeof createFakeGh>[0]["routes"]) => {
	const fake = createFakeGh({ routes: [viewerRoute, ...routes] })
	const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
	return { fake, result: Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A>) }
}

describe("GitHub Issue and Pull Request command contracts", () => {
	test("creates and fully edits an issue with private body text on stdin", async () => {
		const { fake, result } = runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.createIssue({
						repository: "owner/repo",
						title: "Parity issue",
						body: "private issue body",
						labels: ["bug", "parity"],
						assignees: ["parity-bot"],
						milestone: "M2",
					})
					yield* github.editIssue({
						repository: "owner/repo",
						number: 42,
						title: "Parity issue updated",
						body: "private updated body",
						addLabels: ["ready"],
						removeLabels: ["bug"],
						addAssignees: ["maintainer"],
						removeAssignees: ["parity-bot"],
						milestone: null,
					})
				}),
			),
			[
				{
					id: "create",
					match: { command: "gh", argsContain: ["issue", "create", "--title", "Parity issue"] },
					responses: [{ stdout: "https://github.com/owner/repo/issues/42\n" }],
				},
				{ id: "edit", match: { command: "gh", argsContain: ["issue", "edit", "42", "--remove-milestone"] }, responses: [{ stdout: "" }] },
			],
		)
		await result

		expect(fake.invocations[1]!.args).toEqual([
			"issue",
			"create",
			"--repo",
			"owner/repo",
			"--title",
			"Parity issue",
			"--body-file",
			"-",
			"--label",
			"bug",
			"--label",
			"parity",
			"--assignee",
			"parity-bot",
			"--milestone",
			"M2",
		])
		expect(fake.invocations[1]!.stdin).toBe("private issue body")
		expect(fake.invocations[2]!.args).toEqual([
			"issue",
			"edit",
			"42",
			"--repo",
			"owner/repo",
			"--title",
			"Parity issue updated",
			"--body-file",
			"-",
			"--add-label",
			"ready",
			"--remove-label",
			"bug",
			"--add-assignee",
			"maintainer",
			"--remove-assignee",
			"parity-bot",
			"--remove-milestone",
		])
		expect(fake.invocations[2]!.stdin).toBe("private updated body")
		expect(fake.snapshot()[1]!.stdin).toBe("[REDACTED]")
	})

	test("reopens and deletes an issue through native confirmation-capable commands", async () => {
		const { fake, result } = runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.reopenIssue("owner/repo", 42)
					yield* github.deleteIssue("owner/repo", 42)
				}),
			),
			[
				{ id: "reopen", match: { command: "gh", args: ["issue", "reopen", "42", "--repo", "owner/repo"] }, responses: [{ stdout: "" }] },
				{ id: "delete", match: { command: "gh", args: ["issue", "delete", "42", "--repo", "owner/repo", "--yes"] }, responses: [{ stdout: "" }] },
			],
		)
		await result
		expect(fake.invocations.slice(1).map((invocation) => invocation.routeId)).toEqual(["reopen", "delete"])
	})

	test("closes items, transitions draft state, and merges with exact native argv", async () => {
		const { fake, result } = runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.closeIssue("owner/repo", 42)
					yield* github.closePullRequest("owner/repo", 73)
					yield* github.toggleDraftStatus("owner/repo", 73, true)
					yield* github.toggleDraftStatus("owner/repo", 73, false)
					yield* github.mergePullRequest("owner/repo", 73, { kind: "now", method: "squash" })
				}),
			),
			[
				{ id: "close-issue", match: { command: "gh", args: ["issue", "close", "42", "--repo", "owner/repo"] }, responses: [{ stdout: "" }] },
				{ id: "close-pr", match: { command: "gh", args: ["pr", "close", "73", "--repo", "owner/repo"] }, responses: [{ stdout: "" }] },
				{ id: "ready", match: { command: "gh", args: ["pr", "ready", "73", "--repo", "owner/repo"] }, responses: [{ stdout: "" }] },
				{ id: "draft", match: { command: "gh", args: ["pr", "ready", "73", "--repo", "owner/repo", "--undo"] }, responses: [{ stdout: "" }] },
				{
					id: "merge",
					match: { command: "gh", args: ["pr", "merge", "73", "--repo", "owner/repo", "--squash", "--delete-branch"] },
					responses: [{ stdout: "" }],
				},
			],
		)
		await result

		expect(fake.invocations.slice(1).map((invocation) => invocation.routeId)).toEqual(["close-issue", "close-pr", "ready", "draft", "merge"])
	})

	test("creates and fully edits a pull request, then reopens and approves it", async () => {
		const { fake, result } = runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.createPullRequest({
						repository: "owner/repo",
						title: "Parity PR",
						body: "private pr body",
						base: "main",
						head: "parity/m2",
						draft: true,
						labels: ["parity"],
						assignees: ["parity-bot"],
						reviewers: ["maintainer"],
						milestone: "M2",
					})
					yield* github.editPullRequest({
						repository: "owner/repo",
						number: 73,
						title: "Parity PR updated",
						body: "private pr body updated",
						base: "release",
						addLabels: ["ready"],
						removeLabels: ["parity"],
						addReviewers: ["reviewer"],
						removeReviewers: ["maintainer"],
					})
					yield* github.reopenPullRequest("owner/repo", 73)
					yield* github.approvePullRequest("owner/repo", 73, "approved privately")
				}),
			),
			[
				{ id: "create", match: { command: "gh", argsContain: ["pr", "create", "--head", "parity/m2", "--draft"] }, responses: [{ stdout: "" }] },
				{ id: "edit", match: { command: "gh", argsContain: ["pr", "edit", "73", "--base", "release"] }, responses: [{ stdout: "" }] },
				{ id: "reopen", match: { command: "gh", args: ["pr", "reopen", "73", "--repo", "owner/repo"] }, responses: [{ stdout: "" }] },
				{
					id: "approve",
					match: { command: "gh", args: ["pr", "review", "73", "--repo", "owner/repo", "--approve", "--body-file", "-"] },
					responses: [{ stdout: "" }],
				},
			],
		)
		await result

		expect(fake.invocations[1]!.stdin).toBe("private pr body")
		expect(fake.invocations[2]!.stdin).toBe("private pr body updated")
		expect(fake.invocations[4]!.stdin).toBe("approved privately")
		expect(fake.invocations[1]!.args).not.toContain("private pr body")
	})
})

describe("GitHub repository metadata contracts", () => {
	test("paginates and normalizes assignees, reviewers, milestones, and branches", async () => {
		const { result } = runWith(
			GitHubService.use((github) =>
				Effect.all({
					assignees: github.listAssignees("owner/repo"),
					reviewers: github.listReviewers("owner/repo"),
					milestones: github.listMilestones("owner/repo"),
					branches: github.listBranches("owner/repo"),
				}),
			),
			[
				{
					id: "assignees",
					match: { command: "gh", argsContain: ["repos/owner/repo/assignees?per_page=100"] },
					responses: [{ stdout: JSON.stringify([[{ login: "alice", name: "Alice" }], [{ login: "deleted-user", name: null }]]) }],
				},
				{
					id: "reviewers",
					match: { command: "gh", argsContain: ["repos/owner/repo/collaborators?affiliation=all&permission=push&per_page=100"] },
					responses: [{ stdout: JSON.stringify([[{ login: "reviewer", name: "Review User" }]]) }],
				},
				{
					id: "milestones",
					match: { command: "gh", argsContain: ["repos/owner/repo/milestones?state=all&per_page=100"] },
					responses: [
						{
							stdout: JSON.stringify([
								[
									{
										number: 1,
										title: "M2",
										description: "",
										state: "open",
										open_issues: 2,
										closed_issues: 3,
										due_on: "2026-09-01T00:00:00Z",
										html_url: "https://github.com/owner/repo/milestone/1",
									},
								],
							]),
						},
					],
				},
				{
					id: "branches",
					match: { command: "gh", argsContain: ["repos/owner/repo/branches?per_page=100"] },
					responses: [{ stdout: JSON.stringify([[{ name: "main", protected: true, commit: { sha: "abc123" } }]]) }],
				},
				{
					id: "default-branch",
					match: { command: "gh", args: ["repo", "view", "owner/repo", "--json", "defaultBranchRef"] },
					responses: [{ stdout: JSON.stringify({ defaultBranchRef: { name: "main" } }) }],
				},
			],
		)
		const metadata = await result

		expect(metadata.assignees).toEqual([
			{ login: "alice", name: "Alice" },
			{ login: "deleted-user", name: null },
		])
		expect(metadata.reviewers[0]?.login).toBe("reviewer")
		expect(metadata.milestones[0]?.dueOn?.toISOString()).toBe("2026-09-01T00:00:00.000Z")
		expect(metadata.branches).toEqual([{ repository: "owner/repo", name: "main", sha: "abc123", protected: true, isDefault: true }])
	})

	test("surfaces permission failures and malformed metadata instead of accepting them", async () => {
		const permission = runWith(
			GitHubService.use((github) => github.listReviewers("owner/private")),
			[
				{
					id: "denied",
					match: { command: "gh", argsContain: ["repos/owner/private/collaborators?affiliation=all&permission=push&per_page=100"] },
					responses: [{ exitCode: 1, stderr: "HTTP 403: Resource not accessible" }],
				},
			],
		)
		await expect(permission.result).rejects.toBeDefined()
		expect(permission.fake.invocations[1]).toMatchObject({ routeId: "denied", status: "failed", stderr: "HTTP 403: Resource not accessible" })

		const malformed = runWith(
			GitHubService.use((github) => github.listMilestones("owner/repo")),
			[{ id: "malformed", match: { command: "gh", argsContain: ["repos/owner/repo/milestones?state=all&per_page=100"] }, responses: [{ stdout: "{not-json" }] }],
		)
		await expect(malformed.result).rejects.toThrow()
	})

	test("accepts empty paginated selector responses", async () => {
		const { result } = runWith(
			GitHubService.use((github) =>
				Effect.all([github.listAssignees("owner/repo"), github.listReviewers("owner/repo"), github.listMilestones("owner/repo"), github.listBranches("owner/repo")]),
			),
			[
				{ id: "assignees", match: { command: "gh", argsContain: ["repos/owner/repo/assignees?per_page=100"] }, responses: [{ stdout: "[[]]" }] },
				{
					id: "reviewers",
					match: { command: "gh", argsContain: ["repos/owner/repo/collaborators?affiliation=all&permission=push&per_page=100"] },
					responses: [{ stdout: "[[]]" }],
				},
				{ id: "milestones", match: { command: "gh", argsContain: ["repos/owner/repo/milestones?state=all&per_page=100"] }, responses: [{ stdout: "[[]]" }] },
				{ id: "branches", match: { command: "gh", argsContain: ["repos/owner/repo/branches?per_page=100"] }, responses: [{ stdout: "[[]]" }] },
				{
					id: "default-branch",
					match: { command: "gh", args: ["repo", "view", "owner/repo", "--json", "defaultBranchRef"] },
					responses: [{ stdout: '{"defaultBranchRef":null}' }],
				},
			],
		)

		expect(await result).toEqual([[], [], [], []])
	})
})

describe("MockGitHubService item management", () => {
	test("converges create, edit, close, reopen, approve, and delete mutations", async () => {
		const layer = MockGitHubService.layer({ prCount: 8, repoCount: 1, repository: "owner/repo", username: "parity-bot" })
		const result = await Effect.runPromise(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					yield* github.createIssue({ repository: "owner/repo", title: "Created issue", body: "body", labels: ["parity"] })
					let issues = yield* github.listAllIssues({ kind: "issue", mode: "all", repository: "owner/repo" })
					const issue = issues.find((item) => item.title === "Created issue")!
					yield* github.editIssue({ repository: issue.repository, number: issue.number, title: "Edited issue", addLabels: ["ready"], removeLabels: ["parity"] })
					yield* github.closeIssue(issue.repository, issue.number)
					yield* github.reopenIssue(issue.repository, issue.number)
					issues = yield* github.listAllIssues({ kind: "issue", mode: "all", repository: "owner/repo" })
					const editedIssue = issues.find((item) => item.number === issue.number)!
					yield* github.deleteIssue(issue.repository, issue.number)

					yield* github.createPullRequest({
						repository: "owner/repo",
						title: "Created PR",
						body: "body",
						base: "main",
						head: "parity/m2",
						draft: true,
					})
					let pullRequests = yield* github.listAllPullRequests({ kind: "pullRequest", mode: "all", repository: "owner/repo" })
					const pullRequest = pullRequests.find((item) => item.title === "Created PR")!
					yield* github.editPullRequest({ repository: pullRequest.repository, number: pullRequest.number, title: "Edited PR", base: "release" })
					yield* github.closePullRequest(pullRequest.repository, pullRequest.number)
					yield* github.reopenPullRequest(pullRequest.repository, pullRequest.number)
					yield* github.approvePullRequest(pullRequest.repository, pullRequest.number)
					pullRequests = yield* github.listAllPullRequests({ kind: "pullRequest", mode: "all", repository: "owner/repo" })
					return {
						editedIssue,
						issueStillExists: (yield* github.listAllIssues({ kind: "issue", mode: "all", repository: "owner/repo" })).some((item) => item.number === issue.number),
						editedPullRequest: pullRequests.find((item) => item.number === pullRequest.number)!,
					}
				}),
			).pipe(Effect.provide(layer)) as Effect.Effect<{
				readonly editedIssue: { readonly title: string; readonly state: string; readonly labels: readonly { readonly name: string }[] }
				readonly issueStillExists: boolean
				readonly editedPullRequest: { readonly title: string; readonly state: string; readonly baseRefName: string; readonly reviewStatus: string }
			}>,
		)

		expect(result.editedIssue).toMatchObject({ title: "Edited issue", state: "open" })
		expect(result.editedIssue.labels.map((label) => label.name)).toEqual(["ready"])
		expect(result.issueStillExists).toBe(false)
		expect(result.editedPullRequest).toMatchObject({ title: "Edited PR", state: "open", baseRefName: "release", reviewStatus: "approved" })
	})
})
