import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun"
import { Context, Effect, Layer, Schema } from "effect"
import * as Migrator from "effect/unstable/sql/Migrator"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
	checkConclusions,
	checkRollupStatuses,
	checkRunStatuses,
	type IssueItem,
	pullRequestQueueModes,
	pullRequestStates,
	reviewStatuses,
	type PullRequestItem,
	type ReleaseItem,
	type RepositoryDetails,
	runConclusions,
	runStatuses,
	type WorkflowRun,
	type WorkflowRunDetails,
	type BranchItem,
	type MilestoneItem,
	type EnvironmentItem,
	type DeploymentItem,
	type RepositoryRunner,
	type NotificationItem,
} from "../domain.js"
import type { IssueLoad } from "../issueLoad.js"
import { type IssueView, issueViewCacheKey } from "../issueViews.js"
import { mergeCachedDetails } from "../pullRequestCache.js"
import type { PullRequestLoad } from "../pullRequestLoad.js"
import { type PullRequestView, viewCacheKey } from "../pullRequestViews.js"
import { makeWorkspacePreferences, WorkspacePreferences, type ViewerId, type WorkspacePreferencesInput } from "../workspacePreferences.js"

export interface PullRequestCacheKey {
	readonly repository: string
	readonly number: number
}

export interface IssueCacheKey {
	readonly repository: string
	readonly number: number
}

export interface RepoRollupRow {
	readonly repository: string
	readonly pullRequestCount: number
	readonly issueCount: number
	readonly lastActivityAt: Date | null
}

export interface ReleaseCacheLoad {
	readonly repository: string
	readonly data: readonly ReleaseItem[]
	readonly fetchedAt: Date
}

export interface ActionsRunCacheLoad {
	readonly repository: string
	readonly data: readonly WorkflowRun[]
	readonly fetchedAt: Date
}

export interface RepositoryResourceCacheLoad<T> {
	readonly repository: string
	readonly data: readonly T[]
	readonly fetchedAt: Date
}

export type NotificationCacheSummary = Omit<NotificationItem, "subject">

export class CacheError extends Schema.TaggedErrorClass<CacheError>()("CacheError", {
	operation: Schema.String,
	cause: Schema.Defect(),
}) {}

const CheckConclusionSchema = Schema.Literals(checkConclusions)
const CheckRunStatusSchema = Schema.Literals(checkRunStatuses)
const CheckRollupStatusSchema = Schema.Literals(checkRollupStatuses)
const PullRequestStateSchema = Schema.Literals(pullRequestStates)
const ReviewStatusSchema = Schema.Literals(reviewStatuses)

const CachedPullRequestLabelSchema = Schema.Struct({
	name: Schema.String,
	color: Schema.NullOr(Schema.String),
})

const CachedCheckItemSchema = Schema.Struct({
	name: Schema.String,
	status: CheckRunStatusSchema,
	conclusion: Schema.NullOr(CheckConclusionSchema),
})

const CachedPullRequestItemSchema = Schema.Struct({
	repository: Schema.String,
	author: Schema.String,
	headRefOid: Schema.String,
	headRefName: Schema.optionalKey(Schema.String),
	baseRefName: Schema.optionalKey(Schema.String),
	defaultBranchName: Schema.optionalKey(Schema.String),
	number: Schema.Number,
	title: Schema.String,
	body: Schema.String,
	labels: Schema.Array(CachedPullRequestLabelSchema),
	additions: Schema.Number,
	deletions: Schema.Number,
	changedFiles: Schema.Number,
	state: PullRequestStateSchema,
	reviewStatus: ReviewStatusSchema,
	checkStatus: CheckRollupStatusSchema,
	checkSummary: Schema.NullOr(Schema.String),
	checks: Schema.Array(CachedCheckItemSchema),
	autoMergeEnabled: Schema.Boolean,
	detailLoaded: Schema.Boolean,
	createdAt: Schema.String,
	updatedAt: Schema.optional(Schema.String),
	closedAt: Schema.NullOr(Schema.String),
	url: Schema.String,
})

const CachedPullRequestViewSchema = Schema.Union([
	Schema.Struct({ _tag: Schema.tag("Queue"), mode: Schema.Literals(pullRequestQueueModes), repository: Schema.NullOr(Schema.String) }),
	Schema.Struct({ _tag: Schema.tag("Repository"), repository: Schema.String }),
])

// IssueView's Queue mode excludes "all" — that mode is reserved for the
// Repository view (server-side `mode: "all" + repo`). Keep the literals in
// sync with `IssueView`'s Queue branch in `issueViews.ts`.
const issueQueueModes = ["authored", "assigned", "mentioned"] as const

const CachedIssueViewSchema = Schema.Union([
	Schema.Struct({ _tag: Schema.tag("Queue"), mode: Schema.Literals(issueQueueModes), repository: Schema.NullOr(Schema.String) }),
	Schema.Struct({ _tag: Schema.tag("Repository"), repository: Schema.String }),
])

const issueStates = ["open", "closed"] as const
const IssueStateSchema = Schema.Literals(issueStates)

const CachedIssueItemSchema = Schema.Struct({
	repository: Schema.String,
	author: Schema.String,
	number: Schema.Number,
	state: IssueStateSchema,
	title: Schema.String,
	body: Schema.String,
	labels: Schema.Array(CachedPullRequestLabelSchema),
	commentCount: Schema.Number,
	createdAt: Schema.String,
	updatedAt: Schema.String,
	url: Schema.String,
})

const CachedRepositoryDetailsSchema = Schema.Struct({
	repository: Schema.String,
	description: Schema.NullOr(Schema.String),
	url: Schema.String,
	stargazerCount: Schema.Number,
	forkCount: Schema.Number,
	openIssueCount: Schema.Number,
	openPullRequestCount: Schema.Number,
	defaultBranch: Schema.NullOr(Schema.String),
	pushedAt: Schema.NullOr(Schema.String),
	isArchived: Schema.Boolean,
	isPrivate: Schema.Boolean,
})

const CachedReleaseItemSchema = Schema.Struct({
	repository: Schema.String,
	tagName: Schema.String,
	name: Schema.String,
	body: Schema.String,
	isDraft: Schema.Boolean,
	isPrerelease: Schema.Boolean,
	author: Schema.NullOr(Schema.String),
	targetCommitish: Schema.String,
	createdAt: Schema.String,
	publishedAt: Schema.NullOr(Schema.String),
	url: Schema.String,
})

const RunStatusSchema = Schema.Literals(runStatuses)
const RunConclusionSchema = Schema.NullOr(Schema.Literals(runConclusions))
const CachedWorkflowRunSchema = Schema.Struct({
	id: Schema.Number,
	number: Schema.Number,
	attempt: Schema.Number,
	workflowName: Schema.String,
	displayTitle: Schema.String,
	event: Schema.String,
	headBranch: Schema.String,
	headSha: Schema.String,
	status: RunStatusSchema,
	conclusion: RunConclusionSchema,
	url: Schema.String,
	createdAt: Schema.String,
	startedAt: Schema.NullOr(Schema.String),
	updatedAt: Schema.NullOr(Schema.String),
})
const CachedRunStepSchema = Schema.Struct({
	number: Schema.Number,
	name: Schema.String,
	status: RunStatusSchema,
	conclusion: RunConclusionSchema,
	startedAt: Schema.NullOr(Schema.String),
	completedAt: Schema.NullOr(Schema.String),
})
const CachedRunJobSchema = Schema.Struct({
	id: Schema.Number,
	name: Schema.String,
	status: RunStatusSchema,
	conclusion: RunConclusionSchema,
	startedAt: Schema.NullOr(Schema.String),
	completedAt: Schema.NullOr(Schema.String),
	url: Schema.String,
	steps: Schema.Array(CachedRunStepSchema),
})
const CachedWorkflowRunDetailsSchema = Schema.Struct({
	...CachedWorkflowRunSchema.fields,
	jobs: Schema.Array(CachedRunJobSchema),
})
const CachedBranchItemSchema = Schema.Struct({
	repository: Schema.String,
	name: Schema.String,
	sha: Schema.String,
	protected: Schema.Boolean,
	isDefault: Schema.Boolean,
})
const CachedMilestoneItemSchema = Schema.Struct({
	repository: Schema.String,
	number: Schema.Number,
	title: Schema.String,
	description: Schema.String,
	state: Schema.Literals(["open", "closed"]),
	openIssues: Schema.Number,
	closedIssues: Schema.Number,
	dueOn: Schema.NullOr(Schema.String),
	url: Schema.String,
})
const CachedDeploymentItemSchema = Schema.Struct({
	repository: Schema.String,
	id: Schema.Number,
	environment: Schema.String,
	ref: Schema.String,
	sha: Schema.String,
	task: Schema.String,
	state: Schema.Literals(["queued", "in_progress", "pending", "success", "failure", "error", "inactive", "unknown"]),
	description: Schema.String,
	createdAt: Schema.String,
	updatedAt: Schema.String,
	url: Schema.NullOr(Schema.String),
})
const CachedEnvironmentItemSchema = Schema.Struct({
	repository: Schema.String,
	id: Schema.Number,
	name: Schema.String,
	url: Schema.String,
	protectionRules: Schema.Number,
	latestDeployment: Schema.NullOr(CachedDeploymentItemSchema),
})
const CachedRunnerSchema = Schema.Struct({
	repository: Schema.String,
	id: Schema.Number,
	name: Schema.String,
	os: Schema.String,
	status: Schema.Literals(["online", "offline"]),
	busy: Schema.Boolean,
	labels: Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.Literals(["read-only", "custom"]) })),
})
const CachedNotificationSummarySchema = Schema.Struct({
	id: Schema.String,
	unread: Schema.Boolean,
	reason: Schema.String,
	subjectType: Schema.Literals(["issue", "pullRequest", "release", "discussion", "commit", "repository", "unknown"]),
	repository: Schema.String,
	updatedAt: Schema.String,
	lastReadAt: Schema.NullOr(Schema.String),
	url: Schema.NullOr(Schema.String),
})

type CachedPullRequestItem = Schema.Schema.Type<typeof CachedPullRequestItemSchema>
type CachedIssueItem = Schema.Schema.Type<typeof CachedIssueItemSchema>
type CachedRepositoryDetails = Schema.Schema.Type<typeof CachedRepositoryDetailsSchema>
type CachedReleaseItem = Schema.Schema.Type<typeof CachedReleaseItemSchema>
type CachedWorkflowRun = Schema.Schema.Type<typeof CachedWorkflowRunSchema>
type CachedWorkflowRunDetails = Schema.Schema.Type<typeof CachedWorkflowRunDetailsSchema>
type CachedBranchItem = Schema.Schema.Type<typeof CachedBranchItemSchema>
type CachedMilestoneItem = Schema.Schema.Type<typeof CachedMilestoneItemSchema>
type CachedDeploymentItem = Schema.Schema.Type<typeof CachedDeploymentItemSchema>
type CachedEnvironmentItem = Schema.Schema.Type<typeof CachedEnvironmentItemSchema>
type CachedRunner = Schema.Schema.Type<typeof CachedRunnerSchema>
type CachedNotificationSummary = Schema.Schema.Type<typeof CachedNotificationSummarySchema>

interface ResourceSnapshotRow {
	readonly data_json: string
	readonly fetched_at: string
}

interface PullRequestRow {
	readonly pr_key: string
	readonly data_json: string
}

interface IssueRow {
	readonly issue_key: string
	readonly data_json: string
}

interface RepoRollupQueryRow {
	readonly repository: string
	readonly count: number
	readonly last_activity_at: string | null
}

interface QueueSnapshotRow {
	readonly view_json: string
	readonly pr_keys_json: string
	readonly fetched_at: string
	readonly end_cursor: string | null
	readonly has_next_page: number
}

interface WorkspacePreferencesRow {
	readonly preferences_json: string
}

interface RepositoryDetailsRow {
	readonly data_json: string
}

interface RepositoryDetailsFetchedAtRow {
	readonly updated_at: string
}

interface ReleaseRow {
	readonly release_key: string
	readonly data_json: string
}

interface ReleaseSnapshotRow {
	readonly tag_names_json: string
	readonly fetched_at: string
}

interface ActionsRunSnapshotRow {
	readonly data_json: string
	readonly fetched_at: string
}

interface ActionsRunDetailRow {
	readonly data_json: string
}

export const pullRequestCacheKey = ({ repository, number }: PullRequestCacheKey) => `${repository}#${number}`
export const issueCacheKey = ({ repository, number }: IssueCacheKey) => `${repository}#${number}`
export const releaseCacheKey = ({ repository, tagName }: Pick<ReleaseItem, "repository" | "tagName">) => `${repository}#${tagName}`
export const actionsRunCacheKey = (repository: string, runId: number) => `${repository}#${runId}`

const parseDate = (value: string) => {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

const parseJson = (operation: string, json: string) =>
	Effect.try({
		try: () => JSON.parse(json) as unknown,
		catch: (cause) => new CacheError({ operation, cause }),
	})

const decodeUnknownSync = Schema.decodeUnknownSync as unknown as <A>(schema: Schema.Schema<A>) => (input: unknown) => A

const decodeCached = <S extends Schema.Top>(operation: string, schema: S, value: unknown) =>
	Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new CacheError({ operation, cause })))

const toCacheError = (operation: string, cause: unknown) => (cause instanceof CacheError ? cause : new CacheError({ operation, cause }))

const cachedPullRequestToDomain = (cached: CachedPullRequestItem): PullRequestItem | null => {
	const createdAt = parseDate(cached.createdAt)
	if (!createdAt) return null
	const updatedAt = cached.updatedAt !== undefined ? parseDate(cached.updatedAt) : createdAt
	if (!updatedAt) return null
	const closedAt = cached.closedAt === null ? null : parseDate(cached.closedAt)
	if (cached.closedAt !== null && !closedAt) return null
	return {
		repository: cached.repository,
		author: cached.author,
		headRefOid: cached.headRefOid,
		headRefName: cached.headRefName ?? "",
		baseRefName: cached.baseRefName ?? "main",
		defaultBranchName: cached.defaultBranchName ?? cached.baseRefName ?? "main",
		number: cached.number,
		title: cached.title,
		body: cached.body,
		labels: cached.labels,
		additions: cached.additions,
		deletions: cached.deletions,
		changedFiles: cached.changedFiles,
		state: cached.state,
		reviewStatus: cached.reviewStatus,
		checkStatus: cached.checkStatus,
		checkSummary: cached.checkSummary,
		checks: cached.checks,
		autoMergeEnabled: cached.autoMergeEnabled,
		detailLoaded: cached.detailLoaded,
		createdAt,
		updatedAt,
		closedAt,
		url: cached.url,
	}
}

const cachedIssueToDomain = (cached: CachedIssueItem): IssueItem | null => {
	const createdAt = parseDate(cached.createdAt)
	if (!createdAt) return null
	const updatedAt = parseDate(cached.updatedAt)
	if (!updatedAt) return null
	return {
		repository: cached.repository,
		author: cached.author,
		number: cached.number,
		state: cached.state,
		title: cached.title,
		body: cached.body,
		labels: cached.labels,
		commentCount: cached.commentCount,
		createdAt,
		updatedAt,
		url: cached.url,
	}
}

const encodeIssue = (issue: IssueItem): CachedIssueItem => ({
	repository: issue.repository,
	author: issue.author,
	number: issue.number,
	state: issue.state,
	title: issue.title,
	body: issue.body,
	labels: issue.labels,
	commentCount: issue.commentCount,
	createdAt: issue.createdAt.toISOString(),
	updatedAt: issue.updatedAt.toISOString(),
	url: issue.url,
})

const encodePullRequest = (pullRequest: PullRequestItem): CachedPullRequestItem => ({
	repository: pullRequest.repository,
	author: pullRequest.author,
	headRefOid: pullRequest.headRefOid,
	headRefName: pullRequest.headRefName,
	baseRefName: pullRequest.baseRefName,
	defaultBranchName: pullRequest.defaultBranchName,
	number: pullRequest.number,
	title: pullRequest.title,
	body: pullRequest.body,
	labels: pullRequest.labels,
	additions: pullRequest.additions,
	deletions: pullRequest.deletions,
	changedFiles: pullRequest.changedFiles,
	state: pullRequest.state,
	reviewStatus: pullRequest.reviewStatus,
	checkStatus: pullRequest.checkStatus,
	checkSummary: pullRequest.checkSummary,
	checks: pullRequest.checks,
	autoMergeEnabled: pullRequest.autoMergeEnabled,
	detailLoaded: pullRequest.detailLoaded,
	createdAt: pullRequest.createdAt.toISOString(),
	updatedAt: pullRequest.updatedAt.toISOString(),
	closedAt: pullRequest.closedAt?.toISOString() ?? null,
	url: pullRequest.url,
})

const repositoryDetailsToDomain = (cached: CachedRepositoryDetails): RepositoryDetails | null => {
	const pushedAt = cached.pushedAt === null ? null : parseDate(cached.pushedAt)
	if (cached.pushedAt !== null && !pushedAt) return null
	return { ...cached, pushedAt }
}

const encodeRepositoryDetails = (details: RepositoryDetails): CachedRepositoryDetails => ({
	...details,
	pushedAt: details.pushedAt?.toISOString() ?? null,
})

const encodeRelease = (release: ReleaseItem): CachedReleaseItem => ({
	...release,
	createdAt: release.createdAt.toISOString(),
	publishedAt: release.publishedAt?.toISOString() ?? null,
})

const cachedReleaseToDomain = (cached: CachedReleaseItem): ReleaseItem | null => {
	const createdAt = parseDate(cached.createdAt)
	if (!createdAt) return null
	const publishedAt = cached.publishedAt === null ? null : parseDate(cached.publishedAt)
	if (cached.publishedAt !== null && !publishedAt) return null
	return { ...cached, createdAt, publishedAt }
}

const encodeWorkflowRun = (run: WorkflowRun): CachedWorkflowRun => ({
	...run,
	createdAt: run.createdAt.toISOString(),
	startedAt: run.startedAt?.toISOString() ?? null,
	updatedAt: run.updatedAt?.toISOString() ?? null,
})

const encodeWorkflowRunDetails = (run: WorkflowRunDetails): CachedWorkflowRunDetails => ({
	...encodeWorkflowRun(run),
	jobs: run.jobs.map((job) => ({
		...job,
		startedAt: job.startedAt?.toISOString() ?? null,
		completedAt: job.completedAt?.toISOString() ?? null,
		steps: job.steps.map((step) => ({
			...step,
			startedAt: step.startedAt?.toISOString() ?? null,
			completedAt: step.completedAt?.toISOString() ?? null,
		})),
	})),
})

const cachedWorkflowRunToDomain = (cached: CachedWorkflowRun): WorkflowRun | null => {
	const createdAt = parseDate(cached.createdAt)
	const startedAt = cached.startedAt === null ? null : parseDate(cached.startedAt)
	const updatedAt = cached.updatedAt === null ? null : parseDate(cached.updatedAt)
	if (!createdAt || (cached.startedAt !== null && !startedAt) || (cached.updatedAt !== null && !updatedAt)) return null
	return { ...cached, createdAt, startedAt, updatedAt }
}

const cachedWorkflowRunDetailsToDomain = (cached: CachedWorkflowRunDetails): WorkflowRunDetails | null => {
	const run = cachedWorkflowRunToDomain(cached)
	if (!run) return null
	const jobs = cached.jobs.map((job) => {
		const startedAt = job.startedAt === null ? null : parseDate(job.startedAt)
		const completedAt = job.completedAt === null ? null : parseDate(job.completedAt)
		if ((job.startedAt !== null && !startedAt) || (job.completedAt !== null && !completedAt)) return null
		const steps = job.steps.map((step) => {
			const stepStartedAt = step.startedAt === null ? null : parseDate(step.startedAt)
			const stepCompletedAt = step.completedAt === null ? null : parseDate(step.completedAt)
			if ((step.startedAt !== null && !stepStartedAt) || (step.completedAt !== null && !stepCompletedAt)) return null
			return { ...step, startedAt: stepStartedAt, completedAt: stepCompletedAt }
		})
		if (steps.some((step) => step === null)) return null
		return { ...job, startedAt, completedAt, steps: steps as WorkflowRunDetails["jobs"][number]["steps"] }
	})
	if (jobs.some((job) => job === null)) return null
	return { ...run, jobs: jobs as WorkflowRunDetails["jobs"] }
}

const decodePullRequestJson = (json: string): Effect.Effect<PullRequestItem, CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodePullRequest", json)
		const cached = yield* decodeCached("decodePullRequest", CachedPullRequestItemSchema, value)
		const pullRequest = cachedPullRequestToDomain(cached)
		if (!pullRequest) return yield* new CacheError({ operation: "decodePullRequest", cause: "invalid cached date" })
		return pullRequest
	})

const decodePullRequestViewJson = (json: string): Effect.Effect<PullRequestView, CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodePullRequestView", json)
		const view = yield* decodeCached("decodePullRequestView", CachedPullRequestViewSchema, value)
		return view
	})

const decodeIssueJson = (json: string): Effect.Effect<IssueItem, CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodeIssue", json)
		const cached = yield* decodeCached("decodeIssue", CachedIssueItemSchema, value)
		const issue = cachedIssueToDomain(cached)
		if (!issue) return yield* new CacheError({ operation: "decodeIssue", cause: "invalid cached date" })
		return issue
	})

const decodeIssueViewJson = (json: string): Effect.Effect<IssueView, CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodeIssueView", json)
		const view = yield* decodeCached("decodeIssueView", CachedIssueViewSchema, value)
		return view
	})

const decodeStringArrayJson = (json: string): Effect.Effect<readonly string[], CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodeQueueKeys", json)
		return yield* decodeCached("decodeQueueKeys", Schema.Array(Schema.String), value)
	})

const decodeWorkspacePreferencesJson = (json: string): Effect.Effect<WorkspacePreferences, CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodeWorkspacePreferences", json)
		return yield* decodeCached("decodeWorkspacePreferences", WorkspacePreferences, value)
	})

const decodeRepositoryDetailsJson = (json: string): Effect.Effect<RepositoryDetails, CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodeRepositoryDetails", json)
		const cached = yield* decodeCached("decodeRepositoryDetails", CachedRepositoryDetailsSchema, value)
		const details = repositoryDetailsToDomain(cached)
		if (!details) return yield* new CacheError({ operation: "decodeRepositoryDetails", cause: "invalid cached date" })
		return details
	})

const decodeReleaseJson = (json: string): Effect.Effect<ReleaseItem, CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodeRelease", json)
		const cached = yield* decodeCached("decodeRelease", CachedReleaseItemSchema, value)
		const release = cachedReleaseToDomain(cached)
		if (!release) return yield* new CacheError({ operation: "decodeRelease", cause: "invalid cached date" })
		return release
	})

const decodeWorkflowRunsJson = (json: string): Effect.Effect<readonly WorkflowRun[], CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodeWorkflowRuns", json)
		const cached = yield* decodeCached("decodeWorkflowRuns", Schema.Array(CachedWorkflowRunSchema), value)
		const runs = cached.map(cachedWorkflowRunToDomain)
		if (runs.some((run) => run === null)) return yield* new CacheError({ operation: "decodeWorkflowRuns", cause: "invalid cached date" })
		return runs as readonly WorkflowRun[]
	})

const decodeWorkflowRunDetailsJson = (json: string): Effect.Effect<WorkflowRunDetails, CacheError> =>
	Effect.gen(function* () {
		const value = yield* parseJson("decodeWorkflowRunDetails", json)
		const cached = yield* decodeCached("decodeWorkflowRunDetails", CachedWorkflowRunDetailsSchema, value)
		const run = cachedWorkflowRunDetailsToDomain(cached)
		if (!run) return yield* new CacheError({ operation: "decodeWorkflowRunDetails", cause: "invalid cached date" })
		return run
	})

const dateFromCache = (operation: string, value: string) => {
	const date = parseDate(value)
	return date ? Effect.succeed(date) : Effect.fail(new CacheError({ operation, cause: `Invalid cached date: ${value}` }))
}

const applyPragmas = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient
	yield* sql`PRAGMA synchronous = NORMAL`
	yield* sql`PRAGMA busy_timeout = 5000`
	yield* sql`PRAGMA foreign_keys = ON`
	yield* sql`PRAGMA temp_store = MEMORY`
	yield* sql`PRAGMA journal_size_limit = 16777216`
})

const cacheMigrations = {
	"001_initial_cache_schema": Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		yield* sql`CREATE TABLE IF NOT EXISTS pull_requests (
			pr_key TEXT PRIMARY KEY,
			repository TEXT NOT NULL,
			number INTEGER NOT NULL,
			url TEXT NOT NULL,
			head_ref_oid TEXT NOT NULL,
			state TEXT NOT NULL,
			detail_loaded INTEGER NOT NULL,
			data_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`
		yield* sql`CREATE INDEX IF NOT EXISTS pull_requests_repository_number_idx ON pull_requests (repository, number)`
		yield* sql`CREATE TABLE IF NOT EXISTS queue_snapshots (
			viewer TEXT NOT NULL,
			view_key TEXT NOT NULL,
			view_json TEXT NOT NULL,
			pr_keys_json TEXT NOT NULL,
			fetched_at TEXT NOT NULL,
			end_cursor TEXT,
			has_next_page INTEGER NOT NULL,
			PRIMARY KEY (viewer, view_key)
		)`
	}),
	"002_workspace_preferences": Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		yield* sql`CREATE TABLE IF NOT EXISTS workspace_preferences (
			viewer TEXT PRIMARY KEY,
			preferences_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`
	}),
	"004_repository_details": Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		yield* sql`CREATE TABLE IF NOT EXISTS repository_details (
			repository TEXT PRIMARY KEY,
			data_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`
	}),
	// Drop queue snapshots stored under the legacy `view_key` format
	// (e.g. `authored`, `repository:owner/name`). Rows are rebuilt from the live
	// service on next fetch; without this they'd just sit orphaned until the
	// age-based prune ran in ~30 days.
	"003_unified_queue_view_key": Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		yield* sql`DELETE FROM queue_snapshots WHERE view_key NOT LIKE 'pullRequest:%' AND view_key NOT LIKE 'issue:%'`
	}),
	// Issue queue cache. Mirrors `pull_requests` but with a slimmer row (no
	// checks/state/headRefOid). The shared `queue_snapshots` table holds the
	// list ordering — its `pr_keys_json` column is used for both kinds; the
	// `view_key` prefix (`pullRequest:` vs `issue:`) is the discriminator.
	"005_issues_table": Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		yield* sql`CREATE TABLE IF NOT EXISTS issues (
			issue_key TEXT PRIMARY KEY,
			repository TEXT NOT NULL,
			number INTEGER NOT NULL,
			url TEXT NOT NULL,
			data_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`
		yield* sql`CREATE INDEX IF NOT EXISTS issues_repository_number_idx ON issues (repository, number)`
	}),
	"006_releases": Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		yield* sql`CREATE TABLE IF NOT EXISTS releases (
			release_key TEXT PRIMARY KEY,
			repository TEXT NOT NULL,
			tag_name TEXT NOT NULL,
			data_json TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`
		yield* sql`CREATE INDEX IF NOT EXISTS releases_repository_tag_idx ON releases (repository, tag_name)`
		yield* sql`CREATE TABLE IF NOT EXISTS release_snapshots (
			repository TEXT PRIMARY KEY,
			tag_names_json TEXT NOT NULL,
			fetched_at TEXT NOT NULL
		)`
	}),
	"007_actions_runs": Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		yield* sql`CREATE TABLE IF NOT EXISTS action_run_snapshots (
			repository TEXT PRIMARY KEY,
			data_json TEXT NOT NULL,
			fetched_at TEXT NOT NULL
		)`
		yield* sql`CREATE TABLE IF NOT EXISTS action_run_details (
			run_key TEXT PRIMARY KEY,
			repository TEXT NOT NULL,
			run_id INTEGER NOT NULL,
			data_json TEXT NOT NULL,
			fetched_at TEXT NOT NULL
		)`
		yield* sql`CREATE INDEX IF NOT EXISTS action_run_details_repository_run_idx ON action_run_details (repository, run_id)`
	}),
	"008_repository_resources": Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient
		yield* sql`CREATE TABLE IF NOT EXISTS repository_resource_snapshots (
			repository TEXT NOT NULL,
			resource TEXT NOT NULL,
			data_json TEXT NOT NULL,
			fetched_at TEXT NOT NULL,
			PRIMARY KEY(repository, resource)
		)`
		yield* sql`CREATE INDEX IF NOT EXISTS repository_resource_fetched_idx ON repository_resource_snapshots (fetched_at)`
	}),
} satisfies Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>

const pullRequestRow = (pullRequest: PullRequestItem, updatedAt = new Date().toISOString()) => ({
	pr_key: pullRequestCacheKey(pullRequest),
	repository: pullRequest.repository,
	number: pullRequest.number,
	url: pullRequest.url,
	head_ref_oid: pullRequest.headRefOid,
	state: pullRequest.state,
	detail_loaded: pullRequest.detailLoaded ? 1 : 0,
	data_json: JSON.stringify(encodePullRequest(pullRequest)),
	updated_at: updatedAt,
})

const upsertPullRequestRowsSql = (sql: SqlClient.SqlClient, pullRequests: readonly PullRequestItem[]): Effect.Effect<void, SqlError> => {
	if (pullRequests.length === 0) return Effect.void
	const updatedAt = new Date().toISOString()
	const rows = pullRequests.map((pullRequest) => pullRequestRow(pullRequest, updatedAt))
	return sql`INSERT INTO pull_requests ${sql.insert(rows)}
		ON CONFLICT(pr_key) DO UPDATE SET
			repository = excluded.repository,
			number = excluded.number,
			url = excluded.url,
			head_ref_oid = excluded.head_ref_oid,
			state = excluded.state,
			detail_loaded = excluded.detail_loaded,
			data_json = excluded.data_json,
			updated_at = excluded.updated_at`.pipe(Effect.asVoid)
}

const upsertPullRequestSql = (sql: SqlClient.SqlClient, pullRequest: PullRequestItem) => upsertPullRequestRowsSql(sql, [pullRequest])

const readPullRequestSql = (sql: SqlClient.SqlClient, key: PullRequestCacheKey) =>
	Effect.gen(function* () {
		const rows = yield* sql<PullRequestRow>`SELECT pr_key, data_json FROM pull_requests WHERE pr_key = ${pullRequestCacheKey(key)} LIMIT 1`
		const row = rows[0]
		if (!row) return null
		return yield* decodePullRequestJson(row.data_json)
	})

const issueRow = (issue: IssueItem, updatedAt = new Date().toISOString()) => ({
	issue_key: issueCacheKey(issue),
	repository: issue.repository,
	number: issue.number,
	url: issue.url,
	data_json: JSON.stringify(encodeIssue(issue)),
	updated_at: updatedAt,
})

const upsertIssueRowsSql = (sql: SqlClient.SqlClient, issues: readonly IssueItem[]): Effect.Effect<void, SqlError> => {
	if (issues.length === 0) return Effect.void
	const updatedAt = new Date().toISOString()
	const rows = issues.map((issue) => issueRow(issue, updatedAt))
	return sql`INSERT INTO issues ${sql.insert(rows)}
		ON CONFLICT(issue_key) DO UPDATE SET
			repository = excluded.repository,
			number = excluded.number,
			url = excluded.url,
			data_json = excluded.data_json,
			updated_at = excluded.updated_at`.pipe(Effect.asVoid)
}

const upsertIssueSql = (sql: SqlClient.SqlClient, issue: IssueItem) => upsertIssueRowsSql(sql, [issue])

const readIssueSql = (sql: SqlClient.SqlClient, key: IssueCacheKey) =>
	Effect.gen(function* () {
		const rows = yield* sql<IssueRow>`SELECT issue_key, data_json FROM issues WHERE issue_key = ${issueCacheKey(key)} LIMIT 1`
		const row = rows[0]
		if (!row) return null
		return yield* decodeIssueJson(row.data_json)
	})

const upsertReleaseRowsSql = (sql: SqlClient.SqlClient, releases: readonly ReleaseItem[]): Effect.Effect<void, SqlError> => {
	if (releases.length === 0) return Effect.void
	const updatedAt = new Date().toISOString()
	const rows = releases.map((release) => ({
		release_key: releaseCacheKey(release),
		repository: release.repository,
		tag_name: release.tagName,
		data_json: JSON.stringify(encodeRelease(release)),
		updated_at: updatedAt,
	}))
	return sql`INSERT INTO releases ${sql.insert(rows)}
		ON CONFLICT(release_key) DO UPDATE SET
			repository = excluded.repository,
			tag_name = excluded.tag_name,
			data_json = excluded.data_json,
			updated_at = excluded.updated_at`.pipe(Effect.asVoid)
}

const pruneSql = (sql: SqlClient.SqlClient) => {
	const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
	return Effect.gen(function* () {
		yield* sql`DELETE FROM queue_snapshots WHERE fetched_at < ${cutoff}`
		yield* sql`DELETE FROM pull_requests
			WHERE updated_at < ${cutoff}
			AND pr_key NOT IN (
				SELECT value FROM queue_snapshots, json_each(queue_snapshots.pr_keys_json)
				WHERE view_key LIKE 'pullRequest:%'
			)`
		yield* sql`DELETE FROM issues
			WHERE updated_at < ${cutoff}
			AND issue_key NOT IN (
				SELECT value FROM queue_snapshots, json_each(queue_snapshots.pr_keys_json)
				WHERE view_key LIKE 'issue:%'
			)`
		yield* sql`DELETE FROM release_snapshots WHERE fetched_at < ${cutoff}`
		yield* sql`DELETE FROM releases
			WHERE updated_at < ${cutoff}
			AND tag_name NOT IN (
				SELECT value FROM release_snapshots, json_each(release_snapshots.tag_names_json)
				WHERE release_snapshots.repository = releases.repository
			)`
		yield* sql`DELETE FROM action_run_snapshots WHERE fetched_at < ${cutoff}`
		yield* sql`DELETE FROM action_run_details WHERE fetched_at < ${cutoff}`
		yield* sql`DELETE FROM repository_resource_snapshots WHERE fetched_at < ${cutoff}`
	}).pipe(Effect.catch(() => Effect.void))
}

const liveCacheService = (sql: SqlClient.SqlClient) => {
	const readWorkspacePreferences = (viewer: ViewerId): Effect.Effect<WorkspacePreferences | null, CacheError> =>
		Effect.gen(function* () {
			const rows = yield* sql<WorkspacePreferencesRow>`SELECT preferences_json FROM workspace_preferences WHERE viewer = ${viewer} LIMIT 1`
			const row = rows[0]
			if (!row) return null
			return yield* decodeWorkspacePreferencesJson(row.preferences_json)
		}).pipe(Effect.mapError((cause) => toCacheError("readWorkspacePreferences", cause)))

	const writeWorkspacePreferences = Effect.fn("CacheService.writeWorkspacePreferences")(function* (input: WorkspacePreferencesInput | WorkspacePreferences) {
		const preferences = input instanceof WorkspacePreferences ? input : makeWorkspacePreferences(input)
		const row = {
			viewer: preferences.viewer,
			preferences_json: JSON.stringify(preferences),
			updated_at: new Date().toISOString(),
		}
		yield* sql`INSERT INTO workspace_preferences ${sql.insert(row)}
			ON CONFLICT(viewer) DO UPDATE SET
				preferences_json = excluded.preferences_json,
				updated_at = excluded.updated_at`.pipe(Effect.mapError((cause) => toCacheError("writeWorkspacePreferences", cause)))
	})

	const readQueue = (viewer: string, view: PullRequestView): Effect.Effect<PullRequestLoad | null, CacheError> =>
		Effect.gen(function* () {
			const rows =
				yield* sql<QueueSnapshotRow>`SELECT view_json, pr_keys_json, fetched_at, end_cursor, has_next_page FROM queue_snapshots WHERE viewer = ${viewer} AND view_key = ${viewCacheKey(view)} LIMIT 1`
			const snapshot = rows[0]
			if (!snapshot) return null

			const [cachedView, prKeys, fetchedAt] = yield* Effect.all([
				decodePullRequestViewJson(snapshot.view_json),
				decodeStringArrayJson(snapshot.pr_keys_json),
				dateFromCache("decodeQueue", snapshot.fetched_at),
			])
			if (viewCacheKey(cachedView) !== viewCacheKey(view)) return null
			if (prKeys.length === 0) {
				return {
					view,
					data: [],
					fetchedAt,
					endCursor: snapshot.end_cursor,
					hasNextPage: snapshot.has_next_page === 1,
				} satisfies PullRequestLoad
			}

			const prRows = yield* sql<PullRequestRow>`SELECT pr_key, data_json FROM pull_requests WHERE pr_key IN ${sql.in(prKeys)}`
			const byKey = new Map<string, PullRequestItem>()
			for (const row of prRows) {
				const decoded = yield* decodePullRequestJson(row.data_json).pipe(Effect.catch(() => Effect.succeed(null)))
				if (decoded) byKey.set(row.pr_key, decoded)
			}
			const data = prKeys.flatMap((key: string) => {
				const pullRequest = byKey.get(key)
				return pullRequest ? [pullRequest] : []
			})

			return {
				view,
				data,
				fetchedAt,
				endCursor: snapshot.end_cursor,
				hasNextPage: snapshot.has_next_page === 1,
			} satisfies PullRequestLoad
		}).pipe(Effect.mapError((cause) => toCacheError("readQueue", cause)))

	const writeQueue = Effect.fn("CacheService.writeQueue")(function* (viewer: string, load: PullRequestLoad) {
		const fetchedAt = load.fetchedAt ?? new Date()
		const write = Effect.gen(function* () {
			if (load.data.length > 0) {
				const keys = load.data.map(pullRequestCacheKey)
				const existingRows = yield* sql<PullRequestRow>`SELECT pr_key, data_json FROM pull_requests WHERE pr_key IN ${sql.in(keys)}`
				const existing: PullRequestItem[] = []
				for (const row of existingRows) {
					const decoded = yield* decodePullRequestJson(row.data_json).pipe(Effect.catch(() => Effect.succeed(null)))
					if (decoded) existing.push(decoded)
				}
				yield* upsertPullRequestRowsSql(sql, mergeCachedDetails(load.data, existing))
			}
			const snapshot = {
				viewer,
				view_key: viewCacheKey(load.view),
				view_json: JSON.stringify(load.view),
				pr_keys_json: JSON.stringify(load.data.map(pullRequestCacheKey)),
				fetched_at: fetchedAt.toISOString(),
				end_cursor: load.endCursor,
				has_next_page: load.hasNextPage ? 1 : 0,
			}
			yield* sql`INSERT INTO queue_snapshots ${sql.insert(snapshot)}
				ON CONFLICT(viewer, view_key) DO UPDATE SET
					view_json = excluded.view_json,
					pr_keys_json = excluded.pr_keys_json,
					fetched_at = excluded.fetched_at,
					end_cursor = excluded.end_cursor,
					has_next_page = excluded.has_next_page`
		})
		const wrote = yield* sql.withTransaction(write).pipe(
			Effect.as(true),
			Effect.catch(() => Effect.succeed(false)),
		)
		if (wrote) yield* pruneSql(sql)
	})

	const readPullRequest = (key: PullRequestCacheKey): Effect.Effect<PullRequestItem | null, CacheError> =>
		readPullRequestSql(sql, key).pipe(Effect.mapError((cause) => toCacheError("readPullRequest", cause)))

	const upsertPullRequest = Effect.fn("CacheService.upsertPullRequest")(function* (pullRequest: PullRequestItem) {
		yield* upsertPullRequestSql(sql, pullRequest).pipe(Effect.catch(() => Effect.void))
	})

	const readIssueQueue = (viewer: string, view: IssueView): Effect.Effect<IssueLoad | null, CacheError> =>
		Effect.gen(function* () {
			const rows =
				yield* sql<QueueSnapshotRow>`SELECT view_json, pr_keys_json, fetched_at, end_cursor, has_next_page FROM queue_snapshots WHERE viewer = ${viewer} AND view_key = ${issueViewCacheKey(view)} LIMIT 1`
			const snapshot = rows[0]
			if (!snapshot) return null

			const [cachedView, issueKeys, fetchedAt] = yield* Effect.all([
				decodeIssueViewJson(snapshot.view_json),
				decodeStringArrayJson(snapshot.pr_keys_json),
				dateFromCache("decodeIssueQueue", snapshot.fetched_at),
			])
			if (issueViewCacheKey(cachedView) !== issueViewCacheKey(view)) return null
			if (issueKeys.length === 0) {
				return {
					view,
					data: [],
					fetchedAt,
					endCursor: snapshot.end_cursor,
					hasNextPage: snapshot.has_next_page === 1,
				} satisfies IssueLoad
			}

			const issueRows = yield* sql<IssueRow>`SELECT issue_key, data_json FROM issues WHERE issue_key IN ${sql.in(issueKeys)}`
			const byKey = new Map<string, IssueItem>()
			for (const row of issueRows) {
				const decoded = yield* decodeIssueJson(row.data_json).pipe(Effect.catch(() => Effect.succeed(null)))
				if (decoded) byKey.set(row.issue_key, decoded)
			}
			const data = issueKeys.flatMap((key: string) => {
				const issue = byKey.get(key)
				return issue ? [issue] : []
			})

			return {
				view,
				data,
				fetchedAt,
				endCursor: snapshot.end_cursor,
				hasNextPage: snapshot.has_next_page === 1,
			} satisfies IssueLoad
		}).pipe(Effect.mapError((cause) => toCacheError("readIssueQueue", cause)))

	const writeIssueQueue = Effect.fn("CacheService.writeIssueQueue")(function* (viewer: string, load: IssueLoad) {
		const fetchedAt = load.fetchedAt ?? new Date()
		const write = Effect.gen(function* () {
			if (load.data.length > 0) {
				yield* upsertIssueRowsSql(sql, load.data)
			}
			const snapshot = {
				viewer,
				view_key: issueViewCacheKey(load.view),
				view_json: JSON.stringify(load.view),
				pr_keys_json: JSON.stringify(load.data.map(issueCacheKey)),
				fetched_at: fetchedAt.toISOString(),
				end_cursor: load.endCursor,
				has_next_page: load.hasNextPage ? 1 : 0,
			}
			yield* sql`INSERT INTO queue_snapshots ${sql.insert(snapshot)}
				ON CONFLICT(viewer, view_key) DO UPDATE SET
					view_json = excluded.view_json,
					pr_keys_json = excluded.pr_keys_json,
					fetched_at = excluded.fetched_at,
					end_cursor = excluded.end_cursor,
					has_next_page = excluded.has_next_page`
		})
		const wrote = yield* sql.withTransaction(write).pipe(
			Effect.as(true),
			Effect.catch(() => Effect.succeed(false)),
		)
		if (wrote) yield* pruneSql(sql)
	})

	const readIssue = (key: IssueCacheKey): Effect.Effect<IssueItem | null, CacheError> => readIssueSql(sql, key).pipe(Effect.mapError((cause) => toCacheError("readIssue", cause)))

	const upsertIssue = Effect.fn("CacheService.upsertIssue")(function* (issue: IssueItem) {
		yield* upsertIssueSql(sql, issue).pipe(Effect.catch(() => Effect.void))
	})

	const readReleaseList = (repository: string): Effect.Effect<ReleaseCacheLoad | null, CacheError> =>
		Effect.gen(function* () {
			const snapshots = yield* sql<ReleaseSnapshotRow>`SELECT tag_names_json, fetched_at FROM release_snapshots WHERE repository = ${repository} LIMIT 1`
			const snapshot = snapshots[0]
			if (!snapshot) return null
			const [tagNames, fetchedAt] = yield* Effect.all([decodeStringArrayJson(snapshot.tag_names_json), dateFromCache("decodeReleaseSnapshot", snapshot.fetched_at)])
			if (tagNames.length === 0) return { repository, data: [], fetchedAt }
			const keys = tagNames.map((tagName) => releaseCacheKey({ repository, tagName }))
			const rows = yield* sql<ReleaseRow>`SELECT release_key, data_json FROM releases WHERE release_key IN ${sql.in(keys)}`
			const byKey = new Map<string, ReleaseItem>()
			for (const row of rows) {
				const release = yield* decodeReleaseJson(row.data_json).pipe(Effect.catch(() => Effect.succeed(null)))
				if (release) byKey.set(row.release_key, release)
			}
			return { repository, data: keys.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : [])), fetchedAt }
		}).pipe(Effect.mapError((cause) => toCacheError("readReleaseList", cause)))

	const writeReleaseList = Effect.fn("CacheService.writeReleaseList")(function* (load: ReleaseCacheLoad) {
		const write = Effect.gen(function* () {
			yield* upsertReleaseRowsSql(sql, load.data)
			const snapshot = {
				repository: load.repository,
				tag_names_json: JSON.stringify(load.data.map((release) => release.tagName)),
				fetched_at: load.fetchedAt.toISOString(),
			}
			yield* sql`INSERT INTO release_snapshots ${sql.insert(snapshot)}
				ON CONFLICT(repository) DO UPDATE SET
					tag_names_json = excluded.tag_names_json,
					fetched_at = excluded.fetched_at`
		})
		yield* sql.withTransaction(write).pipe(Effect.catch(() => Effect.void))
	})

	const upsertRelease = Effect.fn("CacheService.upsertRelease")(function* (release: ReleaseItem) {
		yield* upsertReleaseRowsSql(sql, [release]).pipe(Effect.catch(() => Effect.void))
		yield* sql`DELETE FROM release_snapshots WHERE repository = ${release.repository}`.pipe(Effect.catch(() => Effect.void))
	})

	const deleteRelease = Effect.fn("CacheService.deleteRelease")(function* (repository: string, tagName: string) {
		yield* sql`DELETE FROM releases WHERE release_key = ${releaseCacheKey({ repository, tagName })}`.pipe(Effect.catch(() => Effect.void))
		yield* sql`DELETE FROM release_snapshots WHERE repository = ${repository}`.pipe(Effect.catch(() => Effect.void))
	})

	const readActionRuns = (repository: string): Effect.Effect<ActionsRunCacheLoad | null, CacheError> =>
		Effect.gen(function* () {
			const rows = yield* sql<ActionsRunSnapshotRow>`SELECT data_json, fetched_at FROM action_run_snapshots WHERE repository = ${repository} LIMIT 1`
			const row = rows[0]
			if (!row) return null
			const [data, fetchedAt] = yield* Effect.all([decodeWorkflowRunsJson(row.data_json), dateFromCache("decodeActionRunSnapshot", row.fetched_at)])
			return { repository, data, fetchedAt }
		}).pipe(
			Effect.mapError((cause) => toCacheError("readActionRuns", cause)),
			Effect.catch(() => Effect.succeed(null)),
		)

	const writeActionRuns = Effect.fn("CacheService.writeActionRuns")(function* (load: ActionsRunCacheLoad) {
		const row = {
			repository: load.repository,
			data_json: JSON.stringify(load.data.map(encodeWorkflowRun)),
			fetched_at: load.fetchedAt.toISOString(),
		}
		yield* sql`INSERT INTO action_run_snapshots ${sql.insert(row)}
			ON CONFLICT(repository) DO UPDATE SET
				data_json = excluded.data_json,
				fetched_at = excluded.fetched_at`.pipe(Effect.catch(() => Effect.void))
	})

	const readActionRunDetails = (repository: string, runId: number): Effect.Effect<WorkflowRunDetails | null, CacheError> =>
		Effect.gen(function* () {
			const rows = yield* sql<ActionsRunDetailRow>`SELECT data_json FROM action_run_details WHERE run_key = ${actionsRunCacheKey(repository, runId)} LIMIT 1`
			const row = rows[0]
			return row ? yield* decodeWorkflowRunDetailsJson(row.data_json) : null
		}).pipe(
			Effect.mapError((cause) => toCacheError("readActionRunDetails", cause)),
			Effect.catch(() => Effect.succeed(null)),
		)

	const writeActionRunDetails = Effect.fn("CacheService.writeActionRunDetails")(function* (repository: string, details: WorkflowRunDetails) {
		const row = {
			run_key: actionsRunCacheKey(repository, details.id),
			repository,
			run_id: details.id,
			data_json: JSON.stringify(encodeWorkflowRunDetails(details)),
			fetched_at: new Date().toISOString(),
		}
		yield* sql`INSERT INTO action_run_details ${sql.insert(row)}
			ON CONFLICT(run_key) DO UPDATE SET
				data_json = excluded.data_json,
				fetched_at = excluded.fetched_at`.pipe(Effect.catch(() => Effect.void))
	})

	const invalidateActionRuns = Effect.fn("CacheService.invalidateActionRuns")(function* (repository: string, runId?: number) {
		yield* sql`DELETE FROM action_run_snapshots WHERE repository = ${repository}`.pipe(Effect.catch(() => Effect.void))
		if (runId !== undefined) {
			yield* sql`DELETE FROM action_run_details WHERE run_key = ${actionsRunCacheKey(repository, runId)}`.pipe(Effect.catch(() => Effect.void))
		}
	})

	const readResource = <T>(repository: string, resource: string, schema: Schema.Schema<readonly T[]>): Effect.Effect<RepositoryResourceCacheLoad<T> | null, CacheError> =>
		Effect.gen(function* () {
			const rows =
				yield* sql<ResourceSnapshotRow>`SELECT data_json, fetched_at FROM repository_resource_snapshots WHERE repository = ${repository} AND resource = ${resource} LIMIT 1`
			const row = rows[0]
			if (!row) return null
			const parsed = yield* Effect.try({
				try: () => JSON.parse(row.data_json) as unknown,
				catch: (cause) => new CacheError({ operation: `decodeResource:${resource}`, cause }),
			})
			const [data, fetchedAt] = yield* Effect.all([
				Effect.try({
					try: () => decodeUnknownSync(schema)(parsed),
					catch: (cause) => new CacheError({ operation: `decodeResource:${resource}`, cause }),
				}),
				dateFromCache(`decodeResource:${resource}`, row.fetched_at),
			])
			return { repository, data, fetchedAt }
		}).pipe(
			Effect.mapError((cause) => (cause instanceof CacheError ? cause : toCacheError(`readResource:${resource}`, cause))),
			Effect.catch(() => Effect.succeed(null)),
		)
	const writeResource = <T>(resource: string, encode: (value: T) => unknown) =>
		Effect.fn(`CacheService.writeResource:${resource}`)(function* (load: RepositoryResourceCacheLoad<T>) {
			const row = {
				repository: load.repository,
				resource,
				data_json: JSON.stringify(load.data.map(encode)),
				fetched_at: load.fetchedAt.toISOString(),
			}
			yield* sql`INSERT INTO repository_resource_snapshots ${sql.insert(row)}
				ON CONFLICT(repository, resource) DO UPDATE SET
					data_json = excluded.data_json,
					fetched_at = excluded.fetched_at`.pipe(Effect.catch(() => Effect.void))
		})
	const invalidateResource = (repository: string, resource: string) =>
		sql`DELETE FROM repository_resource_snapshots WHERE repository = ${repository} AND resource = ${resource}`.pipe(
			Effect.asVoid,
			Effect.catch(() => Effect.void),
		)
	const encodeMilestone = (item: MilestoneItem) => ({ ...item, dueOn: item.dueOn?.toISOString() ?? null })
	const reviveMilestones = (data: readonly CachedMilestoneItem[]): readonly MilestoneItem[] => data.map((item) => ({ ...item, dueOn: item.dueOn ? new Date(item.dueOn) : null }))
	const encodeDeployment = (item: DeploymentItem) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })
	const reviveDeployments = (data: readonly CachedDeploymentItem[]): readonly DeploymentItem[] =>
		data.map((item) => ({ ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) }))
	const encodeEnvironment = (item: EnvironmentItem) => ({ ...item, latestDeployment: item.latestDeployment ? encodeDeployment(item.latestDeployment) : null })
	const reviveEnvironments = (data: readonly CachedEnvironmentItem[]): readonly EnvironmentItem[] =>
		data.map((item) => ({ ...item, latestDeployment: item.latestDeployment ? reviveDeployments([item.latestDeployment])[0]! : null }))

	const readBranches = (repository: string): Effect.Effect<RepositoryResourceCacheLoad<BranchItem> | null, CacheError> =>
		readResource<CachedBranchItem>(repository, "branches", Schema.Array(CachedBranchItemSchema))
	const writeBranches = writeResource<BranchItem>("branches", (value) => value)
	const invalidateBranches = (repository: string) => invalidateResource(repository, "branches")
	const readMilestones = (repository: string): Effect.Effect<RepositoryResourceCacheLoad<MilestoneItem> | null, CacheError> =>
		Effect.gen(function* () {
			const row = yield* readResource<CachedMilestoneItem>(repository, "milestones", Schema.Array(CachedMilestoneItemSchema))
			if (!row) return null
			return { ...row, data: reviveMilestones(row.data) }
		}).pipe(Effect.catch(() => Effect.succeed(null)))
	const writeMilestones = writeResource<MilestoneItem>("milestones", encodeMilestone)
	const invalidateMilestones = (repository: string) => invalidateResource(repository, "milestones")
	const readEnvironments = (repository: string): Effect.Effect<RepositoryResourceCacheLoad<EnvironmentItem> | null, CacheError> =>
		Effect.gen(function* () {
			const row = yield* readResource<CachedEnvironmentItem>(repository, "environments", Schema.Array(CachedEnvironmentItemSchema))
			return row ? { ...row, data: reviveEnvironments(row.data) } : null
		})
	const writeEnvironments = writeResource<EnvironmentItem>("environments", encodeEnvironment)
	const readDeployments = (repository: string, environment: string): Effect.Effect<RepositoryResourceCacheLoad<DeploymentItem> | null, CacheError> =>
		Effect.gen(function* () {
			const row = yield* readResource<CachedDeploymentItem>(repository, `deployments:${environment}`, Schema.Array(CachedDeploymentItemSchema))
			return row ? { ...row, data: reviveDeployments(row.data) } : null
		})
	const writeDeployments = (environment: string, load: RepositoryResourceCacheLoad<DeploymentItem>) =>
		writeResource<DeploymentItem>(`deployments:${environment}`, encodeDeployment)(load)
	const readRunners = (repository: string): Effect.Effect<RepositoryResourceCacheLoad<RepositoryRunner> | null, CacheError> =>
		readResource<CachedRunner>(repository, "runners", Schema.Array(CachedRunnerSchema))
	const writeRunners = writeResource<RepositoryRunner>("runners", (value) => value)
	const notificationResource = (includeRead: boolean) => `notifications:${includeRead ? "all" : "unread"}`
	const readNotificationSummaries = (viewer: string, includeRead: boolean): Effect.Effect<RepositoryResourceCacheLoad<NotificationCacheSummary> | null, CacheError> =>
		Effect.gen(function* () {
			const row = yield* readResource<CachedNotificationSummary>(viewer, notificationResource(includeRead), Schema.Array(CachedNotificationSummarySchema))
			if (!row) return null
			const data = row.data.flatMap((item) => {
				const updatedAt = parseDate(item.updatedAt)
				const lastReadAt = item.lastReadAt ? parseDate(item.lastReadAt) : null
				return updatedAt && (item.lastReadAt === null || lastReadAt) ? [{ ...item, updatedAt, lastReadAt }] : []
			})
			return { ...row, data }
		}).pipe(Effect.catch(() => Effect.succeed(null)))
	const writeNotificationSummaries = (viewer: string, includeRead: boolean, load: RepositoryResourceCacheLoad<NotificationItem>) =>
		writeResource<NotificationItem>(notificationResource(includeRead), (item) => ({
			id: item.id,
			unread: item.unread,
			reason: item.reason,
			subjectType: item.subjectType,
			repository: item.repository,
			updatedAt: item.updatedAt.toISOString(),
			lastReadAt: item.lastReadAt?.toISOString() ?? null,
			url: item.url,
		}))({ ...load, repository: viewer })
	const invalidateNotificationSummaries = (viewer: string) =>
		Effect.all([invalidateResource(viewer, notificationResource(false)), invalidateResource(viewer, notificationResource(true))], { concurrency: 2 }).pipe(Effect.asVoid)

	const readRepoRollup = (viewer: string): Effect.Effect<readonly RepoRollupRow[], CacheError> =>
		Effect.gen(function* () {
			// Viewer-scoped GROUP BY over the items referenced by this viewer's
			// queue snapshots. PR + issue tables are aggregated independently then
			// merged in code so the final row carries both counts and the latest
			// activity across kinds. `last_activity_at` reads the domain `updatedAt`
			// from `data_json` (sortable as ISO 8601), not the row write time —
			// the latter would always reflect "now-ish" since rows are upserted on
			// every queue write.
			const prRows = yield* sql<RepoRollupQueryRow>`
				SELECT pr.repository AS repository,
					COUNT(*) AS count,
					MAX(json_extract(pr.data_json, '$.updatedAt')) AS last_activity_at
				FROM pull_requests pr
				WHERE pr.pr_key IN (
					SELECT json_each.value
					FROM queue_snapshots, json_each(queue_snapshots.pr_keys_json)
					WHERE viewer = ${viewer} AND view_key LIKE 'pullRequest:%'
				)
				GROUP BY pr.repository`
			const issueRows = yield* sql<RepoRollupQueryRow>`
				SELECT i.repository AS repository,
					COUNT(*) AS count,
					MAX(json_extract(i.data_json, '$.updatedAt')) AS last_activity_at
				FROM issues i
				WHERE i.issue_key IN (
					SELECT json_each.value
					FROM queue_snapshots, json_each(queue_snapshots.pr_keys_json)
					WHERE viewer = ${viewer} AND view_key LIKE 'issue:%'
				)
				GROUP BY i.repository`

			const byRepository = new Map<string, { pullRequestCount: number; issueCount: number; lastActivityAt: Date | null }>()
			const ensure = (repository: string) => {
				const current = byRepository.get(repository)
				if (current) return current
				const next = { pullRequestCount: 0, issueCount: 0, lastActivityAt: null as Date | null }
				byRepository.set(repository, next)
				return next
			}
			const bumpActivity = (entry: { lastActivityAt: Date | null }, raw: string | null) => {
				if (!raw) return
				const date = parseDate(raw)
				if (!date) return
				if (!entry.lastActivityAt || entry.lastActivityAt < date) entry.lastActivityAt = date
			}
			for (const row of prRows) {
				const entry = ensure(row.repository)
				entry.pullRequestCount = row.count
				bumpActivity(entry, row.last_activity_at)
			}
			for (const row of issueRows) {
				const entry = ensure(row.repository)
				entry.issueCount = row.count
				bumpActivity(entry, row.last_activity_at)
			}
			return [...byRepository.entries()].map(
				([repository, entry]): RepoRollupRow => ({
					repository,
					pullRequestCount: entry.pullRequestCount,
					issueCount: entry.issueCount,
					lastActivityAt: entry.lastActivityAt,
				}),
			)
		}).pipe(Effect.mapError((cause) => toCacheError("readRepoRollup", cause)))

	const readRepositoryDetails = (repository: string): Effect.Effect<RepositoryDetails | null, CacheError> =>
		Effect.gen(function* () {
			const rows = yield* sql<RepositoryDetailsRow>`SELECT data_json FROM repository_details WHERE repository = ${repository} LIMIT 1`
			const row = rows[0]
			if (!row) return null
			return yield* decodeRepositoryDetailsJson(row.data_json)
		}).pipe(Effect.mapError((cause) => toCacheError("readRepositoryDetails", cause)))

	const readRepositoryDetailsFetchedAt = (repository: string): Effect.Effect<Date | null, CacheError> =>
		Effect.gen(function* () {
			const rows = yield* sql<RepositoryDetailsFetchedAtRow>`SELECT updated_at FROM repository_details WHERE repository = ${repository} LIMIT 1`
			const row = rows[0]
			if (!row) return null
			return parseDate(row.updated_at)
		}).pipe(Effect.mapError((cause) => toCacheError("readRepositoryDetailsFetchedAt", cause)))

	const writeRepositoryDetails = Effect.fn("CacheService.writeRepositoryDetails")(function* (details: RepositoryDetails) {
		const row = {
			repository: details.repository,
			data_json: JSON.stringify(encodeRepositoryDetails(details)),
			updated_at: new Date().toISOString(),
		}
		yield* sql`INSERT INTO repository_details ${sql.insert(row)}
			ON CONFLICT(repository) DO UPDATE SET
				data_json = excluded.data_json,
				updated_at = excluded.updated_at`.pipe(Effect.catch(() => Effect.void))
	})

	const prune = Effect.fn("CacheService.prune")(function* () {
		yield* pruneSql(sql)
	})

	return {
		readQueue,
		writeQueue,
		readPullRequest,
		upsertPullRequest,
		readIssueQueue,
		writeIssueQueue,
		readIssue,
		upsertIssue,
		readReleaseList,
		writeReleaseList,
		upsertRelease,
		deleteRelease,
		readActionRuns,
		writeActionRuns,
		readActionRunDetails,
		writeActionRunDetails,
		invalidateActionRuns,
		readBranches,
		writeBranches,
		invalidateBranches,
		readMilestones,
		writeMilestones,
		invalidateMilestones,
		readEnvironments,
		writeEnvironments,
		readDeployments,
		writeDeployments,
		readRunners,
		writeRunners,
		readNotificationSummaries,
		writeNotificationSummaries,
		invalidateNotificationSummaries,
		readRepoRollup,
		readRepositoryDetails,
		readRepositoryDetailsFetchedAt,
		writeRepositoryDetails,
		readWorkspacePreferences,
		writeWorkspacePreferences,
		prune,
	}
}

export class CacheService extends Context.Service<
	CacheService,
	{
		readonly readQueue: (viewer: string, view: PullRequestView) => Effect.Effect<PullRequestLoad | null, CacheError>
		readonly writeQueue: (viewer: string, load: PullRequestLoad) => Effect.Effect<void>
		readonly readPullRequest: (key: PullRequestCacheKey) => Effect.Effect<PullRequestItem | null, CacheError>
		readonly upsertPullRequest: (pullRequest: PullRequestItem) => Effect.Effect<void>
		readonly readIssueQueue: (viewer: string, view: IssueView) => Effect.Effect<IssueLoad | null, CacheError>
		readonly writeIssueQueue: (viewer: string, load: IssueLoad) => Effect.Effect<void>
		readonly readIssue: (key: IssueCacheKey) => Effect.Effect<IssueItem | null, CacheError>
		readonly upsertIssue: (issue: IssueItem) => Effect.Effect<void>
		readonly readReleaseList: (repository: string) => Effect.Effect<ReleaseCacheLoad | null, CacheError>
		readonly writeReleaseList: (load: ReleaseCacheLoad) => Effect.Effect<void>
		readonly upsertRelease: (release: ReleaseItem) => Effect.Effect<void>
		readonly deleteRelease: (repository: string, tagName: string) => Effect.Effect<void>
		readonly readActionRuns: (repository: string) => Effect.Effect<ActionsRunCacheLoad | null, CacheError>
		readonly writeActionRuns: (load: ActionsRunCacheLoad) => Effect.Effect<void>
		readonly readActionRunDetails: (repository: string, runId: number) => Effect.Effect<WorkflowRunDetails | null, CacheError>
		readonly writeActionRunDetails: (repository: string, details: WorkflowRunDetails) => Effect.Effect<void>
		readonly invalidateActionRuns: (repository: string, runId?: number) => Effect.Effect<void>
		readonly readBranches: (repository: string) => Effect.Effect<RepositoryResourceCacheLoad<BranchItem> | null, CacheError>
		readonly writeBranches: (load: RepositoryResourceCacheLoad<BranchItem>) => Effect.Effect<void>
		readonly invalidateBranches: (repository: string) => Effect.Effect<void>
		readonly readMilestones: (repository: string) => Effect.Effect<RepositoryResourceCacheLoad<MilestoneItem> | null, CacheError>
		readonly writeMilestones: (load: RepositoryResourceCacheLoad<MilestoneItem>) => Effect.Effect<void>
		readonly invalidateMilestones: (repository: string) => Effect.Effect<void>
		readonly readEnvironments: (repository: string) => Effect.Effect<RepositoryResourceCacheLoad<EnvironmentItem> | null, CacheError>
		readonly writeEnvironments: (load: RepositoryResourceCacheLoad<EnvironmentItem>) => Effect.Effect<void>
		readonly readDeployments: (repository: string, environment: string) => Effect.Effect<RepositoryResourceCacheLoad<DeploymentItem> | null, CacheError>
		readonly writeDeployments: (environment: string, load: RepositoryResourceCacheLoad<DeploymentItem>) => Effect.Effect<void>
		readonly readRunners: (repository: string) => Effect.Effect<RepositoryResourceCacheLoad<RepositoryRunner> | null, CacheError>
		readonly writeRunners: (load: RepositoryResourceCacheLoad<RepositoryRunner>) => Effect.Effect<void>
		readonly readNotificationSummaries: (viewer: string, includeRead: boolean) => Effect.Effect<RepositoryResourceCacheLoad<NotificationCacheSummary> | null, CacheError>
		readonly writeNotificationSummaries: (viewer: string, includeRead: boolean, load: RepositoryResourceCacheLoad<NotificationItem>) => Effect.Effect<void>
		readonly invalidateNotificationSummaries: (viewer: string) => Effect.Effect<void>
		readonly readRepoRollup: (viewer: string) => Effect.Effect<readonly RepoRollupRow[], CacheError>
		readonly readRepositoryDetails: (repository: string) => Effect.Effect<RepositoryDetails | null, CacheError>
		readonly readRepositoryDetailsFetchedAt: (repository: string) => Effect.Effect<Date | null, CacheError>
		readonly writeRepositoryDetails: (details: RepositoryDetails) => Effect.Effect<void>
		readonly readWorkspacePreferences: (viewer: ViewerId) => Effect.Effect<WorkspacePreferences | null, CacheError>
		readonly writeWorkspacePreferences: (preferences: WorkspacePreferencesInput | WorkspacePreferences) => Effect.Effect<void, CacheError>
		readonly prune: () => Effect.Effect<void>
	}
>()("ghui/CacheService") {
	static readonly disabledLayer = Layer.succeed(
		CacheService,
		CacheService.of({
			readQueue: () => Effect.succeed(null),
			writeQueue: () => Effect.void,
			readPullRequest: () => Effect.succeed(null),
			upsertPullRequest: () => Effect.void,
			readIssueQueue: () => Effect.succeed(null),
			writeIssueQueue: () => Effect.void,
			readIssue: () => Effect.succeed(null),
			upsertIssue: () => Effect.void,
			readReleaseList: () => Effect.succeed(null),
			writeReleaseList: () => Effect.void,
			upsertRelease: () => Effect.void,
			deleteRelease: () => Effect.void,
			readActionRuns: () => Effect.succeed(null),
			writeActionRuns: () => Effect.void,
			readActionRunDetails: () => Effect.succeed(null),
			writeActionRunDetails: () => Effect.void,
			invalidateActionRuns: () => Effect.void,
			readBranches: () => Effect.succeed(null),
			writeBranches: () => Effect.void,
			invalidateBranches: () => Effect.void,
			readMilestones: () => Effect.succeed(null),
			writeMilestones: () => Effect.void,
			invalidateMilestones: () => Effect.void,
			readEnvironments: () => Effect.succeed(null),
			writeEnvironments: () => Effect.void,
			readDeployments: () => Effect.succeed(null),
			writeDeployments: () => Effect.void,
			readRunners: () => Effect.succeed(null),
			writeRunners: () => Effect.void,
			readNotificationSummaries: () => Effect.succeed(null),
			writeNotificationSummaries: () => Effect.void,
			invalidateNotificationSummaries: () => Effect.void,
			readRepoRollup: () => Effect.succeed([]),
			readRepositoryDetails: () => Effect.succeed(null),
			readRepositoryDetailsFetchedAt: () => Effect.succeed(null),
			writeRepositoryDetails: () => Effect.void,
			readWorkspacePreferences: () => Effect.succeed(null),
			writeWorkspacePreferences: () => Effect.void,
			prune: () => Effect.void,
		}),
	)

	static readonly layerSqlite = Layer.effect(
		CacheService,
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient
			return CacheService.of(liveCacheService(sql))
		}),
	)

	static readonly layerSqliteFile = (filename: string): Layer.Layer<CacheService, SqlError | Migrator.MigrationError | CacheError> => {
		const sqlLayer = SqliteClient.layer({ filename })
		const setupLayer = Layer.effectDiscard(
			Effect.gen(function* () {
				yield* applyPragmas
				yield* SqliteMigrator.run({ loader: Migrator.fromRecord(cacheMigrations), table: "ghui_cache_migrations" })
			}),
		)
		const liveLayer = Layer.mergeAll(setupLayer, CacheService.layerSqlite).pipe(Layer.provide(sqlLayer))
		return Layer.unwrap(
			Effect.tryPromise({
				try: () => mkdir(dirname(filename), { recursive: true }),
				catch: (cause) => new CacheError({ operation: "createCacheDirectory", cause }),
			}).pipe(Effect.as(liveLayer)),
		)
	}

	static readonly layerFromPath = (filename: string | null): Layer.Layer<CacheService> =>
		filename === null ? CacheService.disabledLayer : CacheService.layerSqliteFile(filename).pipe(Layer.catchCause(() => CacheService.disabledLayer))
}
