import { Effect, Schema } from "effect"
import type { RepositoryRunner } from "../../domain.js"
import type { GitHubClient } from "./client.js"

const RunnerSchema = Schema.Struct({
	id: Schema.Number,
	name: Schema.String,
	os: Schema.String,
	status: Schema.String,
	busy: Schema.Boolean,
	labels: Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String })),
})
const RunnerPageSchema = Schema.Struct({ total_count: Schema.Number, runners: Schema.Array(RunnerSchema) })
const RunnerPagesSchema = Schema.Union([RunnerPageSchema, Schema.Array(RunnerPageSchema)])

export const makeGitHubRunners = (client: GitHubClient) => {
	const listRunners = (repository: string) =>
		client.json("listRunners", RunnerPagesSchema, ["api", "--paginate", "--slurp", `repos/${repository}/actions/runners?per_page=100`]).pipe(
			Effect.map((rawPages): readonly RepositoryRunner[] => {
				const pages: readonly Schema.Schema.Type<typeof RunnerPageSchema>[] = Array.isArray(rawPages) ? rawPages : [rawPages]
				return pages.flatMap((page) =>
					page.runners.map((runner) => ({
						repository,
						id: runner.id,
						name: runner.name,
						os: runner.os,
						status: runner.status.toLowerCase() === "online" ? "online" : "offline",
						busy: runner.busy,
						labels: runner.labels.map((label) => ({ name: label.name, type: label.type.toLowerCase() === "custom" ? "custom" : "read-only" })),
					})),
				)
			}),
		)

	return { listRunners } as const
}
