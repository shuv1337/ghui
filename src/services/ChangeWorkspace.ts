import { Context, Effect, Layer, Schema } from "effect"
import type { JjChangeSummary, JjWorkspaceSummary, WorkspaceSnapshot } from "../localDomain.js"
import { CommandError, CommandRunner } from "./CommandRunner.js"
import { jjObservationalArgs } from "./RepositoryContext.js"

export class ChangeWorkspaceError extends Schema.TaggedErrorClass<ChangeWorkspaceError>()("ChangeWorkspaceError", {
	operation: Schema.String,
	detail: Schema.String,
	cause: Schema.Defect(),
}) {}

export interface ChangeWorkspaceScope {
	readonly force?: boolean
}

const BookmarkObjectSchema = Schema.Struct({
	name: Schema.String,
	remote: Schema.optionalKey(Schema.String),
})
const BookmarkEntrySchema = Schema.Union([Schema.String, BookmarkObjectSchema])
const RawChangeSchema = Schema.Struct({
	changeId: Schema.String,
	commitId: Schema.String,
	description: Schema.String,
	empty: Schema.Boolean,
	conflicted: Schema.Boolean,
	mutable: Schema.Boolean,
	divergent: Schema.Boolean,
	bookmarks: Schema.Array(BookmarkEntrySchema),
	remoteBookmarks: Schema.Array(BookmarkEntrySchema),
	parentChangeIds: Schema.Array(Schema.String),
})
const RawWorkspaceSchema = Schema.Struct({
	name: Schema.String,
	changeId: Schema.String,
})

export const JJ_CHANGE_TEMPLATE_VERSION = 1
export const JJ_CHANGE_TEMPLATE = `concat("{", '"changeId":', json(change_id.normal_hex()), ",", '"commitId":', json(commit_id.normal_hex()), ",", '"description":', json(description.first_line()), ",", '"empty":', json(empty), ",", '"conflicted":', json(conflict), ",", '"mutable":', json(!immutable), ",", '"divergent":', json(divergent), ",", '"bookmarks":', json(local_bookmarks), ",", '"remoteBookmarks":', json(remote_bookmarks), ",", '"parentChangeIds":', json(parents.map(|c| c.change_id().normal_hex())), "}\\n")`
export const JJ_WORKSPACE_TEMPLATE = `concat("{", '"name":', json(name), ",", '"changeId":', json(target.change_id().normal_hex()), "}\\n")`
export const JJ_STACK_REVSET = "trunk()::@"
export const JJ_WORKING_COPY_REVSET = "@"

const bookmarkName = (entry: typeof BookmarkEntrySchema.Type): string => {
	if (typeof entry === "string") return entry
	return entry.remote ? `${entry.name}@${entry.remote}` : entry.name
}

export const parseNdjson = <T>(stdout: string, decode: (value: unknown) => T): readonly T[] =>
	stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => decode(JSON.parse(line) as unknown))

export const decodeChangeLine = (value: unknown): JjChangeSummary => {
	const raw = Schema.decodeUnknownSync(RawChangeSchema)(value)
	return {
		changeId: raw.changeId,
		commitId: raw.commitId,
		description: raw.description,
		empty: raw.empty,
		conflicted: raw.conflicted,
		mutable: raw.mutable,
		divergent: raw.divergent,
		parentChangeIds: raw.parentChangeIds,
		bookmarks: raw.bookmarks.map(bookmarkName),
		remoteBookmarks: raw.remoteBookmarks.map(bookmarkName),
	}
}

export const decodeWorkspaceLine = (value: unknown): JjWorkspaceSummary => Schema.decodeUnknownSync(RawWorkspaceSchema)(value)

export const jjRepoArgs = (workspaceRoot: string, ...subcommand: readonly string[]): readonly string[] => jjObservationalArgs("-R", workspaceRoot, ...subcommand)

export interface SnapshotCommandOutput {
	readonly operationId: string
	readonly workspaces: string
	readonly stack: string
	readonly workingCopy: string
	readonly workspaceRoot: string
	readonly trunkRevision: string
}

export const assembleWorkspaceSnapshot = (output: SnapshotCommandOutput): WorkspaceSnapshot => {
	const workspaces = parseNdjson(output.workspaces, decodeWorkspaceLine)
	const stack = parseNdjson(output.stack, decodeChangeLine)
	const workingCopies = parseNdjson(output.workingCopy, decodeChangeLine)
	const workingCopy = workingCopies[0]
	if (!workingCopy) throw new Error("JJ working-copy template returned no change")
	const stackIds = new Set(stack.map((change) => change.changeId))
	const workingCopyOnStack = stackIds.has(workingCopy.changeId)
	const visibleStack = workingCopyOnStack ? stack : [workingCopy, ...stack]
	const workspaceName = workspaces.find((workspace) => workspace.changeId === workingCopy.changeId)?.name ?? workspaces[0]?.name ?? "default"
	const hasMerge = visibleStack.some((change) => change.parentChangeIds.length > 1)
	return {
		operationId: output.operationId.trim(),
		workspaceName,
		workspaceRoot: output.workspaceRoot,
		workingCopy,
		stack: visibleStack,
		workspaces,
		trunkRevision: output.trunkRevision,
		capabilityReason:
			!workingCopyOnStack || stack.length === 0
				? "Stack is not a descendant of trunk; showing the working-copy change."
				: hasMerge
					? "Stack includes a merge; graph edges stay linear."
					: null,
	}
}

export class ChangeWorkspace extends Context.Service<
	ChangeWorkspace,
	{
		readonly snapshot: (scope?: ChangeWorkspaceScope) => Effect.Effect<WorkspaceSnapshot, ChangeWorkspaceError>
	}
>()("ghui/ChangeWorkspace") {
	static readonly disabledLayer = Layer.succeed(
		ChangeWorkspace,
		ChangeWorkspace.of({
			snapshot: () =>
				Effect.fail(
					new ChangeWorkspaceError({
						operation: "snapshot",
						detail: "No Jujutsu workspace is connected",
						cause: "disabled",
					}),
				),
		}),
	)

	static readonly layer = (input: { readonly workspaceRoot: string; readonly trunkRevision: string }) =>
		Layer.effect(
			ChangeWorkspace,
			Effect.gen(function* () {
				const runner = yield* CommandRunner
				let cached: WorkspaceSnapshot | null = null
				const runJj = (operation: string, args: readonly string[]) =>
					runner.run("jj", args).pipe(
						Effect.map((result) => result.stdout),
						Effect.mapError(
							(error) =>
								new ChangeWorkspaceError({
									operation,
									detail: error instanceof CommandError ? error.detail : String(error),
									cause: error,
								}),
						),
					)
				const snapshot = (scope?: ChangeWorkspaceScope) =>
					Effect.gen(function* () {
						const operationId = (yield* runJj("operation", jjRepoArgs(input.workspaceRoot, "op", "log", "-n", "1", "--no-graph", "-T", "self.id()"))).trim()
						if (!scope?.force && cached && cached.operationId === operationId) return cached
						const [workspaces, stack, workingCopy] = yield* Effect.all(
							[
								runJj("workspaces", jjRepoArgs(input.workspaceRoot, "workspace", "list", "-T", JJ_WORKSPACE_TEMPLATE)),
								runJj("stack", jjRepoArgs(input.workspaceRoot, "log", "-r", JJ_STACK_REVSET, "--no-graph", "-T", JJ_CHANGE_TEMPLATE)).pipe(
									Effect.catch(() => runJj("stack", jjRepoArgs(input.workspaceRoot, "log", "-r", JJ_WORKING_COPY_REVSET, "--no-graph", "-T", JJ_CHANGE_TEMPLATE))),
								),
								runJj("working-copy", jjRepoArgs(input.workspaceRoot, "log", "-r", JJ_WORKING_COPY_REVSET, "--no-graph", "-T", JJ_CHANGE_TEMPLATE)),
							],
							{ concurrency: 3 },
						)
						const next = yield* Effect.try({
							try: () =>
								assembleWorkspaceSnapshot({
									operationId,
									workspaces,
									stack,
									workingCopy,
									workspaceRoot: input.workspaceRoot,
									trunkRevision: input.trunkRevision,
								}),
							catch: (cause) =>
								new ChangeWorkspaceError({
									operation: "snapshot",
									detail: cause instanceof Error ? cause.message : "Malformed JJ snapshot",
									cause,
								}),
						})
						cached = next
						return next
					})
				return ChangeWorkspace.of({ snapshot })
			}),
		)
}
