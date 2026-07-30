import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import type { CreateReleaseInput } from "../src/domain.ts"
import { GitHubService } from "../src/services/GitHubService.ts"
import { MockGitHubService } from "../src/services/MockGitHubService.ts"
import { createFakeGh } from "./support/fakeGh.ts"

const viewerRoute = {
	id: "viewer",
	match: { command: "gh", args: ["api", "user"] },
	responses: [{ stdout: '{"login":"octocat"}' }],
} as const

const rawRelease = {
	name: "Version 1.2.3",
	tagName: "v1.2.3",
	body: "Private release body",
	isDraft: false,
	isPrerelease: true,
	createdAt: "2026-07-01T10:00:00Z",
	publishedAt: "2026-07-01T11:00:00Z",
	url: "https://github.com/owner/repo/releases/tag/v1.2.3",
	author: { login: "octocat" },
	targetCommitish: "main",
}

const runWith = <A>(effect: Effect.Effect<A, unknown, GitHubService>, layer: Layer.Layer<GitHubService>) =>
	Effect.runPromise(effect.pipe(Effect.provide(layer)) as Effect.Effect<A>)

describe("GitHub Releases command contracts", () => {
	test("lists releases through the native gh subcommand and normalizes dates", async () => {
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "release-list",
					match: {
						command: "gh",
						args: ["release", "list", "--repo", "owner/repo", "--limit", "25", "--json", "name,tagName,isDraft,isPrerelease,createdAt,publishedAt,url"],
					},
					responses: [{ stdout: JSON.stringify([{ ...rawRelease, body: undefined, author: undefined, targetCommitish: undefined }]) }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const releases = await runWith(
			GitHubService.use((github) => github.listReleases("owner/repo", 25)),
			layer,
		)

		expect(releases).toHaveLength(1)
		expect(releases[0]).toMatchObject({ repository: "owner/repo", tagName: "v1.2.3", isPrerelease: true, body: "" })
		expect(releases[0]!.publishedAt?.toISOString()).toBe("2026-07-01T11:00:00.000Z")
		expect(fake.invocations[1]!.args[0]).toBe("release")
	})

	test("creates a release with notes on stdin, then reads authoritative details", async () => {
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "release-create",
					match: {
						command: "gh",
						args: ["release", "create", "v1.2.3", "--repo", "owner/repo", "--title", "Version 1.2.3", "--notes-file", "-", "--target", "main", "--prerelease"],
					},
					responses: [{ stdout: `${rawRelease.url}\n` }],
				},
				{
					id: "release-view",
					match: { command: "gh", argsContain: ["release", "view", "v1.2.3", "owner/repo"] },
					responses: [{ stdout: JSON.stringify(rawRelease) }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const input: CreateReleaseInput = {
			repository: "owner/repo",
			tagName: "v1.2.3",
			name: "Version 1.2.3",
			body: "Private release body",
			isDraft: false,
			isPrerelease: true,
			targetCommitish: "main",
		}
		const created = await runWith(
			GitHubService.use((github) => github.createRelease(input)),
			layer,
		)

		expect(created.body).toBe("Private release body")
		expect(fake.invocations[1]!.stdin).toBe("Private release body")
		expect(fake.invocations[1]!.args).not.toContain("Private release body")
		expect(fake.snapshot()[1]!.stdin).toBe("[REDACTED]")
	})

	test("edits flags explicitly and deletes without deleting the tag", async () => {
		const editedRaw = { ...rawRelease, isDraft: true, isPrerelease: false, publishedAt: null }
		const fake = createFakeGh({
			routes: [
				viewerRoute,
				{
					id: "release-edit",
					match: { command: "gh", argsContain: ["release", "edit", "v1.2.3", "--draft=true", "--prerelease=false"] },
					responses: [{ stdout: "" }],
				},
				{
					id: "release-view",
					match: { command: "gh", argsContain: ["release", "view", "v1.2.3"] },
					responses: [{ stdout: JSON.stringify(editedRaw) }],
				},
				{
					id: "release-delete",
					match: { command: "gh", args: ["release", "delete", "v1.2.3", "--repo", "owner/repo", "--yes"] },
					responses: [{ stdout: "" }],
				},
			],
		})
		const layer = GitHubService.layerNoDeps.pipe(Layer.provide(fake.layer))
		const edited = await runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					const release = yield* github.editRelease({
						repository: "owner/repo",
						tagName: "v1.2.3",
						name: "Version 1.2.3",
						body: "Updated",
						isDraft: true,
						isPrerelease: false,
						targetCommitish: null,
					})
					yield* github.deleteRelease("owner/repo", "v1.2.3")
					return release
				}),
			),
			layer,
		)
		expect(edited.isDraft).toBe(true)
		expect(fake.invocations.at(-1)!.args).not.toContain("--cleanup-tag")
	})
})

describe("MockGitHubService releases", () => {
	test("maintains deterministic mutable create, edit, and delete state", async () => {
		const layer = MockGitHubService.layer({ prCount: 8, repoCount: 1, repository: "owner/repo", username: "octocat" })
		const result = await runWith(
			GitHubService.use((github) =>
				Effect.gen(function* () {
					const before = yield* github.listReleases("owner/repo")
					yield* github.createRelease({
						repository: "owner/repo",
						tagName: "v9.0.0",
						name: "Nine",
						body: "Created",
						isDraft: true,
						isPrerelease: false,
						targetCommitish: "main",
					})
					const created = yield* github.getRelease("owner/repo", "v9.0.0")
					yield* github.editRelease({ ...created, name: "Nine final", body: "Edited", isDraft: false, targetCommitish: created.targetCommitish })
					const edited = yield* github.getRelease("owner/repo", "v9.0.0")
					yield* github.deleteRelease("owner/repo", "v9.0.0")
					const after = yield* github.listReleases("owner/repo")
					return { before, created, edited, after }
				}),
			),
			layer,
		)

		expect(result.before).toHaveLength(4)
		expect(result.created).toMatchObject({ name: "Nine", body: "Created", isDraft: true })
		expect(result.edited).toMatchObject({ name: "Nine final", body: "Edited", isDraft: false })
		expect(result.after).toHaveLength(4)
		expect(result.after.some((release) => release.tagName === "v9.0.0")).toBe(false)
	})
})
