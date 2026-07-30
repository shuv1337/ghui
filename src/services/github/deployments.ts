import { Effect, Schema } from "effect"
import type { DeploymentItem, DeploymentState, EnvironmentItem } from "../../domain.js"
import type { GitHubClient } from "./client.js"

const EnvironmentSchema = Schema.Struct({
	id: Schema.Number,
	name: Schema.String,
	html_url: Schema.String,
	protection_rules: Schema.optionalKey(Schema.Array(Schema.Unknown)),
})
const EnvironmentPageSchema = Schema.Struct({ environments: Schema.Array(EnvironmentSchema) })
const EnvironmentPagesSchema = Schema.Union([EnvironmentPageSchema, Schema.Array(EnvironmentPageSchema)])
const DeploymentSchema = Schema.Struct({
	id: Schema.Number,
	environment: Schema.String,
	ref: Schema.String,
	sha: Schema.String,
	task: Schema.String,
	description: Schema.NullOr(Schema.String),
	created_at: Schema.String,
	updated_at: Schema.String,
	statuses_url: Schema.String,
})
const DeploymentPagesSchema = Schema.Union([Schema.Array(DeploymentSchema), Schema.Array(Schema.Array(DeploymentSchema))])
const DeploymentStatusSchema = Schema.Struct({
	state: Schema.String,
	environment_url: Schema.NullOr(Schema.String),
	target_url: Schema.NullOr(Schema.String),
})
const DeploymentStatusPagesSchema = Schema.Union([Schema.Array(DeploymentStatusSchema), Schema.Array(Schema.Array(DeploymentStatusSchema))])

const flattenPages = <T>(value: readonly T[] | readonly (readonly T[])[]): readonly T[] =>
	value.length > 0 && Array.isArray(value[0]) ? (value as readonly (readonly T[])[]).flat() : (value as readonly T[])
const normalizeState = (value: string | undefined): DeploymentState =>
	value === "queued" || value === "in_progress" || value === "pending" || value === "success" || value === "failure" || value === "error" || value === "inactive"
		? value
		: "unknown"

export const makeGitHubDeployments = (client: GitHubClient) => {
	const hydrateDeployment = (repository: string, deployment: Schema.Schema.Type<typeof DeploymentSchema>) =>
		client
			.json("listDeploymentStatuses", DeploymentStatusPagesSchema, ["api", "--paginate", "--slurp", `repos/${repository}/deployments/${deployment.id}/statuses?per_page=100`])
			.pipe(
				Effect.map((pages): DeploymentItem => {
					const latest = flattenPages(pages)[0]
					return {
						repository,
						id: deployment.id,
						environment: deployment.environment,
						ref: deployment.ref,
						sha: deployment.sha,
						task: deployment.task,
						state: normalizeState(latest?.state),
						description: deployment.description ?? "",
						createdAt: new Date(deployment.created_at),
						updatedAt: new Date(deployment.updated_at),
						url: latest?.environment_url ?? latest?.target_url ?? null,
					}
				}),
			)

	const listDeployments = (repository: string, environment: string, limit = 100) =>
		client
			.json("listDeployments", DeploymentPagesSchema, [
				"api",
				"--paginate",
				"--slurp",
				`repos/${repository}/deployments?environment=${encodeURIComponent(environment)}&per_page=100`,
			])
			.pipe(
				Effect.flatMap((pages) =>
					Effect.all(
						flattenPages(pages)
							.slice(0, Math.max(1, Math.min(1000, limit)))
							.map((deployment) => hydrateDeployment(repository, deployment)),
						{ concurrency: 4 },
					),
				),
			)

	const listEnvironments = (repository: string) =>
		client.json("listEnvironments", EnvironmentPagesSchema, ["api", "--paginate", "--slurp", `repos/${repository}/environments?per_page=100`]).pipe(
			Effect.flatMap((rawPages) => {
				const pages = Array.isArray(rawPages) ? rawPages : [rawPages]
				const environments = pages.flatMap((page) => page.environments)
				return Effect.all(
					environments.map((environment) =>
						listDeployments(repository, environment.name, 1).pipe(
							Effect.map(
								(deployments): EnvironmentItem => ({
									repository,
									id: environment.id,
									name: environment.name,
									url: environment.html_url,
									protectionRules: environment.protection_rules?.length ?? 0,
									latestDeployment: deployments[0] ?? null,
								}),
							),
						),
					),
					{ concurrency: 4 },
				)
			}),
		)

	return { listEnvironments, listDeployments } as const
}
