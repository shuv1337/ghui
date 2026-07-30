import { Schema } from "effect"

export type LoadStatus = "loading" | "ready" | "error"

export const pullRequestStates = ["open", "closed", "merged"] as const
export type PullRequestState = (typeof pullRequestStates)[number]

export const pullRequestQueueModes = ["authored", "review", "assigned", "mentioned"] as const
export type PullRequestUserQueueMode = (typeof pullRequestQueueModes)[number]
export type PullRequestQueueMode = "repository" | PullRequestUserQueueMode

export const pullRequestQueueLabels = {
	repository: "repository",
	authored: "authored",
	review: "review requested",
	assigned: "assigned",
	mentioned: "mentioned",
} as const satisfies Record<PullRequestQueueMode, string>

export const pullRequestQueueSearchQualifier = (mode: PullRequestQueueMode, repository: string | null) => {
	const qualifiers = {
		repository: repository ? `repo:${repository}` : "author:@me",
		authored: "author:@me",
		review: "review-requested:@me",
		assigned: "assignee:@me",
		mentioned: "mentions:@me",
	} as const satisfies Record<PullRequestQueueMode, string>
	const qualifier = qualifiers[mode]
	const repositoryQualifier = mode === "repository" || !repository ? "" : ` repo:${repository}`
	return mode === "repository" && repository ? qualifier : `${qualifier}${repositoryQualifier} archived:false`
}

export const checkConclusions = ["success", "failure", "neutral", "skipped", "cancelled", "timed_out"] as const
export type CheckConclusion = (typeof checkConclusions)[number]

export const checkRunStatuses = ["completed", "in_progress", "queued", "pending"] as const
export type CheckRunStatus = (typeof checkRunStatuses)[number]

export const checkRollupStatuses = ["passing", "pending", "failing", "none"] as const
export type CheckRollupStatus = (typeof checkRollupStatuses)[number]

export const reviewStatuses = ["draft", "approved", "changes", "review", "none"] as const
export type ReviewStatus = (typeof reviewStatuses)[number]

export type Mergeable = "mergeable" | "conflicting" | "unknown"

// DiffCommentSide is the only literal type still consumed at runtime — GitHubService
// uses it as a Schema inside PullRequestCommentSchema.
export const DiffCommentSide = Schema.Literals(["LEFT", "RIGHT"])
export type DiffCommentSide = Schema.Schema.Type<typeof DiffCommentSide>

export const pullRequestMergeMethods = ["squash", "merge", "rebase"] as const
export type PullRequestMergeMethod = (typeof pullRequestMergeMethods)[number]

export const pullRequestMergeKinds = ["now", "auto", "admin", "disable-auto"] as const
export type PullRequestMergeKind = (typeof pullRequestMergeKinds)[number]
export type PullRequestMergeMethodKind = Exclude<PullRequestMergeKind, "disable-auto">

export type PullRequestMergeAction =
	| {
			readonly kind: PullRequestMergeMethodKind
			readonly method: PullRequestMergeMethod
	  }
	| {
			readonly kind: "disable-auto"
	  }

export interface RepositoryMergeMethods {
	readonly squash: boolean
	readonly merge: boolean
	readonly rebase: boolean
}

export const allowedMergeMethodList = (allowed: RepositoryMergeMethods): readonly PullRequestMergeMethod[] => pullRequestMergeMethods.filter((method) => allowed[method])

export const pullRequestReviewEvents = ["COMMENT", "APPROVE", "REQUEST_CHANGES"] as const
export type PullRequestReviewEvent = (typeof pullRequestReviewEvents)[number]

export interface CheckItem {
	readonly name: string
	readonly status: CheckRunStatus
	readonly conclusion: CheckConclusion | null
}

export interface PullRequestLabel {
	readonly name: string
	readonly color: string | null
}

export interface RepositoryUser {
	readonly login: string
	readonly name: string | null
}

export interface RepositoryMilestone {
	readonly number: number
	readonly title: string
	readonly state: "open" | "closed"
	readonly dueOn: Date | null
}

export interface RepositoryBranch {
	readonly name: string
	readonly sha: string
	readonly protected: boolean
}

export interface BranchItem extends RepositoryBranch {
	readonly repository: string
	readonly isDefault: boolean
}

export interface CreateBranchInput {
	readonly repository: string
	readonly name: string
	readonly sourceRef: string
	readonly sourceSha: string
}

export interface MilestoneItem extends RepositoryMilestone {
	readonly repository: string
	readonly description: string
	readonly openIssues: number
	readonly closedIssues: number
	readonly url: string
}

export interface MilestoneIssue {
	readonly repository: string
	readonly number: number
	readonly title: string
	readonly state: "open" | "closed"
	readonly url: string
}

export interface CreateMilestoneInput {
	readonly repository: string
	readonly title: string
	readonly description: string
	readonly dueOn: Date | null
}

export interface EditMilestoneInput extends CreateMilestoneInput {
	readonly number: number
	readonly state: "open" | "closed"
}

export type DeploymentState = "queued" | "in_progress" | "pending" | "success" | "failure" | "error" | "inactive" | "unknown"

export interface DeploymentItem {
	readonly repository: string
	readonly id: number
	readonly environment: string
	readonly ref: string
	readonly sha: string
	readonly task: string
	readonly state: DeploymentState
	readonly description: string
	readonly createdAt: Date
	readonly updatedAt: Date
	readonly url: string | null
}

export interface EnvironmentItem {
	readonly repository: string
	readonly id: number
	readonly name: string
	readonly url: string
	readonly protectionRules: number
	readonly latestDeployment: DeploymentItem | null
}

export interface RepositoryRunner {
	readonly repository: string
	readonly id: number
	readonly name: string
	readonly os: string
	readonly status: "online" | "offline"
	readonly busy: boolean
	readonly labels: readonly {
		readonly name: string
		readonly type: "read-only" | "custom"
	}[]
}

export type NotificationSubjectType = "issue" | "pullRequest" | "release" | "discussion" | "commit" | "repository" | "unknown"

export interface NotificationItem {
	readonly id: string
	readonly unread: boolean
	readonly reason: string
	readonly subjectType: NotificationSubjectType
	readonly subject: string
	readonly repository: string
	readonly updatedAt: Date
	readonly lastReadAt: Date | null
	readonly url: string | null
}

export interface ItemMetadataChanges {
	readonly addLabels?: readonly string[]
	readonly removeLabels?: readonly string[]
	readonly addAssignees?: readonly string[]
	readonly removeAssignees?: readonly string[]
	readonly milestone?: string | null
}

export interface CreateIssueInput {
	readonly repository: string
	readonly title: string
	readonly body: string
	readonly labels?: readonly string[]
	readonly assignees?: readonly string[]
	readonly milestone?: string | null
}

export interface EditIssueInput extends ItemMetadataChanges {
	readonly repository: string
	readonly number: number
	readonly title?: string
	readonly body?: string
}

export interface CreatePullRequestInput {
	readonly repository: string
	readonly title: string
	readonly body: string
	readonly base: string
	readonly head: string
	readonly draft: boolean
	readonly labels?: readonly string[]
	readonly assignees?: readonly string[]
	readonly reviewers?: readonly string[]
	readonly milestone?: string | null
}

export interface EditPullRequestInput extends ItemMetadataChanges {
	readonly repository: string
	readonly number: number
	readonly title?: string
	readonly body?: string
	readonly base?: string
	readonly addReviewers?: readonly string[]
	readonly removeReviewers?: readonly string[]
}

export interface CreatePullRequestCommentInput {
	readonly repository: string
	readonly number: number
	readonly commitId: string
	readonly path: string
	readonly line: number
	readonly side: DiffCommentSide
	readonly startLine?: number
	readonly startSide?: DiffCommentSide
	readonly body: string
}

export interface SubmitPullRequestReviewInput {
	readonly repository: string
	readonly number: number
	readonly event: PullRequestReviewEvent
	readonly body: string
}

export interface PendingReview {
	readonly id: string
	readonly repository: string
	readonly number: number
	readonly commitId: string
	readonly comments: readonly PullRequestReviewComment[]
}

export interface PullRequestReviewComment {
	readonly id: string
	readonly path: string
	readonly line: number
	readonly side: DiffCommentSide
	readonly author: string
	readonly body: string
	readonly createdAt: Date | null
	readonly url: string | null
	readonly inReplyTo: string | null
}

export type PullRequestComment =
	| {
			readonly _tag: "comment"
			readonly id: string
			readonly author: string
			readonly body: string
			readonly createdAt: Date | null
			readonly url: string | null
	  }
	| ({ readonly _tag: "review-comment" } & PullRequestReviewComment)

export const isReviewComment = (comment: PullRequestComment): comment is PullRequestComment & { readonly _tag: "review-comment" } => comment._tag === "review-comment"
export const isIssueComment = (comment: PullRequestComment): comment is PullRequestComment & { readonly _tag: "comment" } => comment._tag === "comment"

export interface PullRequestItem {
	readonly repository: string
	readonly author: string
	readonly headRefOid: string
	readonly headRefName: string
	readonly baseRefName: string
	readonly defaultBranchName: string
	readonly number: number
	readonly title: string
	readonly body: string
	readonly labels: readonly PullRequestLabel[]
	readonly additions: number
	readonly deletions: number
	readonly changedFiles: number
	readonly state: PullRequestState
	readonly reviewStatus: ReviewStatus
	readonly checkStatus: CheckRollupStatus
	readonly checkSummary: string | null
	readonly checks: readonly CheckItem[]
	readonly autoMergeEnabled: boolean
	readonly detailLoaded: boolean
	readonly createdAt: Date
	readonly updatedAt: Date
	readonly closedAt: Date | null
	readonly url: string
}

// === Workflow runs (GitHub Actions) ===
//
// Modeled after `gh run list` / `gh run view --json jobs`. A WorkflowRun is one
// run of a workflow on a commit; jobs carry steps. Scoped per-PR by head SHA in
// the runs view.

export const runStatuses = ["queued", "in_progress", "completed"] as const
export type RunStatus = (typeof runStatuses)[number]

export const runConclusions = ["success", "failure", "cancelled", "skipped", "neutral", "timed_out", "action_required", "stale"] as const
export type RunConclusion = (typeof runConclusions)[number] | null

export interface RunStep {
	readonly number: number
	readonly name: string
	readonly status: RunStatus
	readonly conclusion: RunConclusion
	readonly startedAt: Date | null
	readonly completedAt: Date | null
}

export interface RunJob {
	readonly id: number
	readonly name: string
	readonly status: RunStatus
	readonly conclusion: RunConclusion
	readonly startedAt: Date | null
	readonly completedAt: Date | null
	readonly url: string
	readonly steps: readonly RunStep[]
}

export interface WorkflowRun {
	readonly id: number
	readonly number: number
	readonly attempt: number
	readonly workflowName: string
	readonly displayTitle: string
	readonly event: string
	readonly headBranch: string
	readonly headSha: string
	readonly status: RunStatus
	readonly conclusion: RunConclusion
	readonly url: string
	readonly createdAt: Date
	readonly startedAt: Date | null
	readonly updatedAt: Date | null
}

export interface WorkflowRunDetails extends WorkflowRun {
	readonly jobs: readonly RunJob[]
}

export interface Workflow {
	readonly id: number
	readonly name: string
	readonly state: "active" | "disabled_manually" | "disabled_inactivity" | "disabled_fork"
	readonly path: string
}

export type WorkflowInputType = "string" | "boolean" | "choice" | "environment"

export interface WorkflowInput {
	readonly name: string
	readonly description: string
	readonly required: boolean
	readonly type: WorkflowInputType
	readonly defaultValue: string | boolean | null
	readonly options: readonly string[]
}

export interface WorkflowDispatchInput {
	readonly repository: string
	readonly workflow: string
	readonly ref: string
	readonly values: Readonly<Record<string, string | boolean>>
}

export interface ActionArtifact {
	readonly id: number
	readonly name: string
	readonly sizeInBytes: number
	readonly expired: boolean
	readonly createdAt: Date
	readonly expiresAt: Date | null
}

export interface ActionJobLog {
	readonly repository: string
	readonly jobId: number
	readonly text: string
}

export interface RepositoryDetails {
	readonly repository: string
	readonly description: string | null
	readonly url: string
	readonly stargazerCount: number
	readonly forkCount: number
	readonly openIssueCount: number
	readonly openPullRequestCount: number
	readonly defaultBranch: string | null
	readonly pushedAt: Date | null
	readonly isArchived: boolean
	readonly isPrivate: boolean
}

export interface ReleaseItem {
	readonly repository: string
	readonly tagName: string
	readonly name: string
	readonly body: string
	readonly isDraft: boolean
	readonly isPrerelease: boolean
	readonly author: string | null
	readonly targetCommitish: string
	readonly createdAt: Date
	readonly publishedAt: Date | null
	readonly url: string
}

export interface CreateReleaseInput {
	readonly repository: string
	readonly tagName: string
	readonly name: string
	readonly body: string
	readonly isDraft: boolean
	readonly isPrerelease: boolean
	readonly targetCommitish: string | null
}

export interface EditReleaseInput extends CreateReleaseInput {}

export type IssueState = "open" | "closed"

export interface IssueItem {
	readonly repository: string
	readonly number: number
	readonly state: IssueState
	readonly title: string
	readonly body: string
	readonly author: string
	readonly labels: readonly PullRequestLabel[]
	readonly commentCount: number
	readonly createdAt: Date
	readonly updatedAt: Date
	readonly url: string
}

export interface PullRequestMergeInfo {
	readonly repository: string
	readonly number: number
	readonly title: string
	readonly state: PullRequestState
	readonly isDraft: boolean
	readonly mergeable: Mergeable
	readonly reviewStatus: ReviewStatus
	readonly checkStatus: CheckRollupStatus
	readonly checkSummary: string | null
	readonly autoMergeEnabled: boolean
	readonly viewerCanMergeAsAdmin: boolean
}
