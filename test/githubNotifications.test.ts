import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { GitHubService } from "../src/services/GitHubService.ts"
import { notificationTargetUrl } from "../src/services/github/notifications.ts"
import { createFakeGh } from "./support/fakeGh.ts"

const runWith = <A>(effect: Effect.Effect<A, unknown, GitHubService>, layer: Layer.Layer<GitHubService>) =>
	Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A>)

const viewer = {
	id: "viewer",
	match: { command: "gh", args: ["api", "user"] },
	responses: [{ stdout: '{"login":"octocat"}' }],
} as const

const thread = (overrides: Record<string, unknown> = {}) => ({
	id: "101",
	unread: true,
	reason: "review_requested",
	updated_at: "2026-07-29T12:00:00Z",
	last_read_at: null,
	subject: {
		title: "Review parity",
		url: "https://api.github.com/repos/owner/repo/pulls/42",
		latest_comment_url: null,
		type: "PullRequest",
	},
	repository: { full_name: "owner/repo", html_url: "https://github.com/owner/repo" },
	...overrides,
})

describe("GitHub notifications", () => {
	test("pages unread/all threads, normalizes targets, and marks one thread read", async () => {
		const fake = createFakeGh({
			routes: [
				viewer,
				{
					id: "unread",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "notifications?all=false&participating=false&per_page=100"] },
					responses: [{ stdout: JSON.stringify([[thread()], [thread({ id: "102", subject: { ...thread().subject, title: "Deleted target", url: null, type: "Mystery" } })]]) }],
				},
				{
					id: "all",
					match: { command: "gh", args: ["api", "--paginate", "--slurp", "notifications?all=true&participating=false&per_page=100"] },
					responses: [{ stdout: JSON.stringify([[thread({ id: "103", unread: false, last_read_at: "2026-07-28T10:00:00Z" })]]) }],
				},
				{
					id: "read",
					match: { command: "gh", args: ["api", "--method", "PATCH", "notifications/threads/101"] },
					responses: [{ stdout: "" }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const unread = await runWith(
			GitHubService.use((github) => github.listNotifications()),
			layer,
		)
		expect(unread).toHaveLength(2)
		expect(unread[0]).toMatchObject({
			id: "101",
			subjectType: "pullRequest",
			url: "https://github.com/owner/repo/pull/42",
		})
		expect(unread[1]).toMatchObject({ subjectType: "unknown", url: null })
		const all = await runWith(
			GitHubService.use((github) => github.listNotifications(true)),
			layer,
		)
		expect(all[0]?.lastReadAt?.toISOString()).toBe("2026-07-28T10:00:00.000Z")
		await runWith(
			GitHubService.use((github) => github.markNotificationRead("101")),
			layer,
		)
	})

	test("rejects malformed responses and preserves permission failures", async () => {
		const malformed = createFakeGh({
			routes: [
				viewer,
				{
					id: "malformed",
					match: { command: "gh", argsContain: ["notifications?all=false"] },
					responses: [{ stdout: '[{"id":42}]' }],
				},
			],
		})
		await expect(
			runWith(
				GitHubService.use((github) => github.listNotifications()),
				GitHubService.layerNoDeps.pipe(Layer.provide(malformed.layer)),
			),
		).rejects.toBeDefined()

		const denied = createFakeGh({
			routes: [
				viewer,
				{
					id: "denied",
					match: { command: "gh", argsContain: ["notifications?all=false"] },
					responses: [{ exitCode: 1, stderr: "HTTP 403: Resource not accessible by integration" }],
				},
			],
		})
		await expect(
			runWith(
				GitHubService.use((github) => github.listNotifications()),
				GitHubService.layerNoDeps.pipe(Layer.provide(denied.layer)),
			),
		).rejects.toBeDefined()
	})

	test("only generates web URLs for supported target shapes", () => {
		expect(notificationTargetUrl("https://api.github.com/repos/a/b/issues/7", "https://github.com/a/b", "issue")).toBe("https://github.com/a/b/issues/7")
		expect(notificationTargetUrl(null, "https://github.com/a/b", "repository")).toBe("https://github.com/a/b")
		expect(notificationTargetUrl("https://example.test/private", "https://github.com/a/b", "unknown")).toBeNull()
	})
})
