import { Effect, Schema } from "effect"
import type { CreateReleaseInput, EditReleaseInput, ReleaseItem } from "../../domain.js"
import type { GitHubClient } from "./client.js"

const NullableString = Schema.NullOr(Schema.String)
const ReleaseListSchema = Schema.Array(
	Schema.Struct({
		name: Schema.String,
		tagName: Schema.String,
		isDraft: Schema.Boolean,
		isPrerelease: Schema.Boolean,
		createdAt: Schema.String,
		publishedAt: NullableString,
		url: Schema.String,
	}),
)

const ReleaseDetailsSchema = Schema.Struct({
	name: Schema.String,
	tagName: Schema.String,
	body: Schema.String,
	isDraft: Schema.Boolean,
	isPrerelease: Schema.Boolean,
	createdAt: Schema.String,
	publishedAt: NullableString,
	url: Schema.String,
	author: Schema.NullOr(Schema.Struct({ login: Schema.String })),
	targetCommitish: Schema.String,
})

const releaseFromRaw = (
	repository: string,
	raw: Schema.Schema.Type<typeof ReleaseListSchema>[number],
	body = "",
	author: string | null = null,
	targetCommitish = "",
): ReleaseItem => ({
	repository,
	tagName: raw.tagName,
	name: raw.name || raw.tagName,
	body,
	isDraft: raw.isDraft,
	isPrerelease: raw.isPrerelease,
	author,
	targetCommitish,
	createdAt: new Date(raw.createdAt),
	publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : null,
	url: raw.url,
})

export const makeGitHubReleases = (client: GitHubClient) => {
	const listReleases = (repository: string, limit = 100) =>
		client
			.json("listReleases", ReleaseListSchema, [
				"release",
				"list",
				"--repo",
				repository,
				"--limit",
				String(Math.max(1, Math.min(1000, limit))),
				"--json",
				"name,tagName,isDraft,isPrerelease,createdAt,publishedAt,url",
			])
			.pipe(Effect.map((releases) => releases.map((release) => releaseFromRaw(repository, release))))

	const getRelease = (repository: string, tagName: string) =>
		client
			.json("getRelease", ReleaseDetailsSchema, [
				"release",
				"view",
				tagName,
				"--repo",
				repository,
				"--json",
				"name,tagName,body,isDraft,isPrerelease,createdAt,publishedAt,url,author,targetCommitish",
			])
			.pipe(Effect.map((release) => releaseFromRaw(repository, release, release.body, release.author?.login ?? null, release.targetCommitish)))

	const createRelease = Effect.fn("GitHubService.createRelease")(function* (input: CreateReleaseInput) {
		yield* client.void(
			"createRelease",
			[
				"release",
				"create",
				input.tagName,
				"--repo",
				input.repository,
				"--title",
				input.name,
				"--notes-file",
				"-",
				...(input.targetCommitish ? ["--target", input.targetCommitish] : []),
				...(input.isDraft ? ["--draft"] : []),
				...(input.isPrerelease ? ["--prerelease"] : []),
			],
			{ stdin: input.body },
		)
		return yield* getRelease(input.repository, input.tagName)
	})

	const editRelease = Effect.fn("GitHubService.editRelease")(function* (input: EditReleaseInput) {
		yield* client.void(
			"editRelease",
			[
				"release",
				"edit",
				input.tagName,
				"--repo",
				input.repository,
				"--title",
				input.name,
				"--notes-file",
				"-",
				`--draft=${input.isDraft}`,
				`--prerelease=${input.isPrerelease}`,
				...(input.targetCommitish ? ["--target", input.targetCommitish] : []),
			],
			{ stdin: input.body },
		)
		return yield* getRelease(input.repository, input.tagName)
	})

	const deleteRelease = (repository: string, tagName: string) => client.void("deleteRelease", ["release", "delete", tagName, "--repo", repository, "--yes"])

	return { listReleases, getRelease, createRelease, editRelease, deleteRelease } as const
}
