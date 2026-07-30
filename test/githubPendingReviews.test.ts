import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { GitHubService } from "../src/services/GitHubService.ts"
import { MockGitHubService } from "../src/services/MockGitHubService.ts"
import { createFakeGh } from "./support/fakeGh.ts"

const commentPayload = {
	id: 91,
	body: "queued body",
	path: "src/App.tsx",
	line: 42,
	side: "RIGHT",
	created_at: "2026-07-29T00:00:00Z",
	user: { login: "parity-bot" },
}

describe("GitHub pending review command contracts", () => {
	test("finds and hydrates the viewer's pending review through paginated endpoints", async () => {
		const fake = createFakeGh({
			routes: [
				{ id: "viewer", match: { command: "gh", args: ["api", "user"] }, responses: [{ stdout: '{"login":"parity-bot"}' }] },
				{
					id: "reviews",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "repos/owner/repo/pulls/7/reviews?per_page=100"] },
					responses: [
						{
							stdout: JSON.stringify([
								[
									{ id: 8, state: "APPROVED", commit_id: "old", user: { login: "parity-bot" } },
									{ id: 9, state: "PENDING", commit_id: "abc123", user: { login: "parity-bot" } },
								],
							]),
						},
					],
				},
				{
					id: "comments",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "repos/owner/repo/pulls/7/reviews/9/comments?per_page=100"] },
					responses: [{ stdout: JSON.stringify([[commentPayload]]) }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const review = await Effect.runPromise(GitHubService.use((github) => github.findPendingReview("owner/repo", 7)).pipe(Effect.provide(layer)))

		expect(review).toMatchObject({ id: "9", repository: "owner/repo", number: 7, commitId: "abc123" })
		expect(review?.comments).toHaveLength(1)
		expect(review?.comments[0]).toMatchObject({ id: "91", path: "src/App.tsx", line: 42, side: "RIGHT", body: "queued body" })
	})

	test("creates, queues, submits, and discards with JSON bodies on stdin", async () => {
		const fake = createFakeGh({
			routes: [
				{ id: "viewer", match: { command: "gh", args: ["api", "user"] }, responses: [{ stdout: '{"login":"parity-bot"}' }] },
				{
					id: "create",
					match: { command: "gh", args: ["api", "--method", "POST", "repos/owner/repo/pulls/7/reviews", "--input", "-"] },
					responses: [{ stdout: '{"id":10,"state":"PENDING","commit_id":"abc123","user":{"login":"parity-bot"}}' }],
				},
				{
					id: "add",
					match: { command: "gh", args: ["api", "--method", "POST", "repos/owner/repo/pulls/7/reviews/10/comments", "--input", "-"] },
					responses: [{ stdout: JSON.stringify(commentPayload) }],
				},
				{
					id: "submit",
					match: { command: "gh", args: ["api", "--method", "POST", "repos/owner/repo/pulls/7/reviews/10/events", "--input", "-"] },
					responses: [{ stdout: "" }],
				},
				{
					id: "discard",
					match: { command: "gh", args: ["api", "--method", "DELETE", "repos/owner/repo/pulls/7/reviews/10"] },
					responses: [{ stdout: "" }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		await Effect.runPromise(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					const review = yield* github.createPendingReview("owner/repo", 7, "abc123")
					yield* github.addPendingReviewComment(review, {
						repository: "owner/repo",
						number: 7,
						commitId: "abc123",
						path: "src/App.tsx",
						line: 42,
						side: "RIGHT",
						startLine: 40,
						startSide: "RIGHT",
						body: "queued body",
					})
					yield* github.submitPendingReview(review, "REQUEST_CHANGES", "private summary")
					yield* github.discardPendingReview(review)
				}),
			).pipe(Effect.provide(layer)),
		)

		expect(fake.invocations.map((invocation) => ({ routeId: invocation.routeId, args: invocation.args }))).toEqual([
			{ routeId: "viewer", args: ["api", "user"] },
			{ routeId: "create", args: ["api", "--method", "POST", "repos/owner/repo/pulls/7/reviews", "--input", "-"] },
			{ routeId: "add", args: ["api", "--method", "POST", "repos/owner/repo/pulls/7/reviews/10/comments", "--input", "-"] },
			{ routeId: "submit", args: ["api", "--method", "POST", "repos/owner/repo/pulls/7/reviews/10/events", "--input", "-"] },
			{ routeId: "discard", args: ["api", "--method", "DELETE", "repos/owner/repo/pulls/7/reviews/10"] },
		])
		expect(JSON.parse(fake.invocations[1]!.stdin ?? "")).toEqual({ commit_id: "abc123" })
		expect(JSON.parse(fake.invocations[2]!.stdin ?? "")).toEqual({
			body: "queued body",
			path: "src/App.tsx",
			line: 42,
			side: "RIGHT",
			start_line: 40,
			start_side: "RIGHT",
		})
		expect(JSON.parse(fake.invocations[3]!.stdin ?? "")).toEqual({ event: "REQUEST_CHANGES", body: "private summary" })
		expect(
			fake
				.snapshot()
				.slice(1, 4)
				.every((invocation) => invocation.stdin === "[REDACTED]"),
		).toBe(true)
	})
})

describe("MockGitHubService pending reviews", () => {
	test("resumes a server-backed queue and removes it on submission", async () => {
		const layer = MockGitHubService.layer({ prCount: 2, repoCount: 1, repository: "owner/repo", username: "parity-bot" })
		const result = await Effect.runPromise(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					const review = yield* github.createPendingReview("owner/repo", 1000, "abc123")
					yield* github.addPendingReviewComment(review, {
						repository: "owner/repo",
						number: 1000,
						commitId: "abc123",
						path: "src/App.tsx",
						line: 42,
						side: "RIGHT",
						body: "queued",
					})
					const resumed = yield* github.findPendingReview("owner/repo", 1000)
					yield* github.submitPendingReview(review, "COMMENT", "")
					const afterSubmit = yield* github.findPendingReview("owner/repo", 1000)
					return { resumed, afterSubmit }
				}),
			).pipe(Effect.provide(layer)),
		)

		expect(result.resumed?.comments).toHaveLength(1)
		expect(result.afterSubmit).toBeNull()
	})
})
