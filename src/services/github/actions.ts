import { Effect, Schema } from "effect"
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import type { ActionArtifact, ActionJobLog, Workflow, WorkflowDispatchInput, WorkflowInput, WorkflowInputType } from "../../domain.js"
import { CommandError } from "../CommandRunner.js"
import { parseWorkflowRuns } from "../githubNormalize.js"
import { WorkflowRunListSchema } from "../githubSchemas.js"
import type { GitHubClient } from "./client.js"

const WorkflowListSchema = Schema.Array(
	Schema.Struct({
		id: Schema.Number,
		name: Schema.String,
		state: Schema.String,
		path: Schema.String,
	}),
)

const ArtifactsResponseSchema = Schema.Struct({
	artifacts: Schema.Array(
		Schema.Struct({
			id: Schema.Number,
			name: Schema.String,
			size_in_bytes: Schema.Number,
			expired: Schema.Boolean,
			created_at: Schema.String,
			expires_at: Schema.NullOr(Schema.String),
		}),
	),
})
const PagedArtifactsResponseSchema = Schema.Union([ArtifactsResponseSchema, Schema.Array(ArtifactsResponseSchema)])
type ArtifactsResponse = Schema.Schema.Type<typeof ArtifactsResponseSchema>

const RUN_LIST_FIELDS = "databaseId,number,attempt,workflowName,name,displayTitle,event,headBranch,headSha,status,conclusion,url,createdAt,startedAt,updatedAt"

const workflowState = (value: string): Workflow["state"] => {
	if (value === "disabled_manually" || value === "disabled_inactivity" || value === "disabled_fork") return value
	return "active"
}

const safeArtifactName = (name: string) => name.length > 0 && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\") && !name.includes("\0")

const scalar = (value: string) => {
	const trimmed = value.trim()
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1)
	return trimmed
}

/** Small, deliberately scoped parser for workflow_dispatch.inputs. It is not a
 * general YAML parser; it only consumes the indentation-stable mapping emitted
 * by `gh workflow view --yaml` and ignores every other workflow field. */
export const parseWorkflowDispatchInputs = (yaml: string): readonly WorkflowInput[] => {
	const lines = yaml.split(/\r?\n/)
	const dispatchLine = lines.findIndex((line) => /^\s*workflow_dispatch:\s*$/.test(line))
	if (dispatchLine < 0) return []
	const dispatchIndent = lines[dispatchLine]!.match(/^\s*/)?.[0].length ?? 0
	const relativeInputsLine = lines.slice(dispatchLine + 1).findIndex((line) => {
		if (line.trim().length === 0 || line.trimStart().startsWith("#")) return false
		const indent = line.match(/^\s*/)?.[0].length ?? 0
		return indent > dispatchIndent && /^\s+inputs:\s*$/.test(line)
	})
	const inputsLine = relativeInputsLine < 0 ? -1 : dispatchLine + 1 + relativeInputsLine
	if (inputsLine < 0) return []
	const inputsIndent = lines[inputsLine]!.match(/^\s*/)?.[0].length ?? 0
	const results: WorkflowInput[] = []
	let current: { name: string; indent: number; values: Record<string, string>; options: string[] } | null = null
	const flush = () => {
		if (!current) return
		const typeValue = current.values.type
		const type: WorkflowInputType = typeValue === "boolean" || typeValue === "choice" || typeValue === "environment" ? typeValue : "string"
		const rawDefault = current.values.default
		results.push({
			name: current.name,
			description: current.values.description ?? "",
			required: current.values.required === "true",
			type,
			defaultValue: rawDefault === undefined ? null : type === "boolean" ? rawDefault === "true" : rawDefault,
			options: current.options,
		})
		current = null
	}
	for (let index = inputsLine + 1; index < lines.length; index++) {
		const line = lines[index]!
		if (line.trim().length === 0 || line.trimStart().startsWith("#")) continue
		const indent = line.match(/^\s*/)?.[0].length ?? 0
		if (indent <= inputsIndent) break
		const inputMatch = line.match(/^(\s+)([A-Za-z0-9_.-]+):\s*$/)
		if (inputMatch && indent === inputsIndent + 2) {
			flush()
			current = { name: inputMatch[2]!, indent, values: {}, options: [] }
			continue
		}
		if (!current) continue
		const optionMatch = line.match(/^\s*-\s+(.+?)\s*$/)
		if (optionMatch) {
			current.options.push(scalar(optionMatch[1]!))
			continue
		}
		const field = line.match(/^\s+([A-Za-z_]+):\s*(.*?)\s*$/)
		if (field) current.values[field[1]!] = scalar(field[2]!)
	}
	flush()
	return results
}

export const makeGitHubActions = (client: GitHubClient, runFetchLimit: number) => {
	const listWorkflows = (repository: string, limit = 100) =>
		client
			.json("listWorkflows", WorkflowListSchema, [
				"workflow",
				"list",
				"--repo",
				repository,
				"--all",
				"--limit",
				String(Math.max(1, Math.min(1000, limit))),
				"--json",
				"id,name,state,path",
			])
			.pipe(Effect.map((items) => items.map((item): Workflow => ({ ...item, state: workflowState(item.state) }))))

	const listWorkflowRuns = (repository: string, limit = runFetchLimit) =>
		client
			.json("listWorkflowRuns", WorkflowRunListSchema, ["run", "list", "--repo", repository, "--limit", String(Math.max(1, Math.min(1000, limit))), "--json", RUN_LIST_FIELDS])
			.pipe(Effect.map(parseWorkflowRuns))

	const getWorkflowInputs = (repository: string, workflow: string) =>
		client.run("getWorkflowInputs", ["workflow", "view", workflow, "--repo", repository, "--yaml"]).pipe(Effect.map((result) => parseWorkflowDispatchInputs(result.stdout)))

	const dispatchWorkflow = (input: WorkflowDispatchInput) =>
		client.void("dispatchWorkflow", ["workflow", "run", input.workflow, "--repo", input.repository, "--ref", input.ref, "--json"], {
			stdin: JSON.stringify(Object.fromEntries(Object.entries(input.values).sort(([left], [right]) => left.localeCompare(right)))),
		})

	const retryRun = (repository: string, runId: number, failedOnly = false) =>
		client.void("retryRun", ["run", "rerun", String(runId), "--repo", repository, ...(failedOnly ? ["--failed"] : [])])

	const cancelRun = (repository: string, runId: number) => client.void("cancelRun", ["run", "cancel", String(runId), "--repo", repository])

	const getJobLog = (repository: string, jobId: number) =>
		client
			.run("getJobLog", ["run", "view", "--job", String(jobId), "--log", "--repo", repository])
			.pipe(Effect.map((result): ActionJobLog => ({ repository, jobId, text: result.stdout })))

	const listArtifacts = (repository: string, runId: number) =>
		client.json("listArtifacts", PagedArtifactsResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`]).pipe(
			Effect.map((response) => {
				const pages: readonly ArtifactsResponse[] = Array.isArray(response) ? (response as readonly ArtifactsResponse[]) : [response as ArtifactsResponse]
				return pages
					.flatMap((page) => page.artifacts)
					.map(
						(artifact): ActionArtifact => ({
							id: artifact.id,
							name: artifact.name,
							sizeInBytes: artifact.size_in_bytes,
							expired: artifact.expired,
							createdAt: new Date(artifact.created_at),
							expiresAt: artifact.expires_at ? new Date(artifact.expires_at) : null,
						}),
					)
			}),
		)

	const downloadArtifact = (repository: string, runId: number, artifactName: string, destination: string) =>
		Effect.gen(function* () {
			if (!safeArtifactName(artifactName)) {
				return yield* new CommandError({ command: "gh", args: [], detail: "Unsafe artifact name.", cause: artifactName })
			}
			const absoluteDestination = resolve(destination)
			if (existsSync(absoluteDestination) && (!statSync(absoluteDestination).isDirectory() || readdirSync(absoluteDestination).length > 0)) {
				return yield* new CommandError({ command: "gh", args: [], detail: "Artifact destination must be empty.", cause: absoluteDestination })
			}
			const staging = mkdtempSync(join(dirname(absoluteDestination), `.${basename(absoluteDestination)}.ghui-`))
			let committed = false
			yield* client.void("downloadArtifact", ["run", "download", String(runId), "--repo", repository, "--name", artifactName, "--dir", staging]).pipe(
				Effect.tap(() =>
					Effect.sync(() => {
						if (existsSync(absoluteDestination)) rmSync(absoluteDestination, { recursive: true })
						renameSync(staging, absoluteDestination)
						committed = true
					}),
				),
				Effect.ensuring(
					Effect.sync(() => {
						if (!committed && existsSync(staging)) rmSync(staging, { recursive: true, force: true })
					}),
				),
			)
			return absoluteDestination
		})

	return { listWorkflows, listWorkflowRuns, getWorkflowInputs, dispatchWorkflow, retryRun, cancelRun, getJobLog, listArtifacts, downloadArtifact } as const
}
