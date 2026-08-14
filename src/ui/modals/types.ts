import { Data } from "effect"
import type {
	ActionArtifact,
	BranchItem,
	DiffCommentSide,
	PullRequestLabel,
	PullRequestMergeInfo,
	PullRequestMergeKind,
	PullRequestMergeMethod,
	RepositoryMergeMethods,
	Workflow,
	WorkflowInput,
} from "../../domain.js"
import type { ThemeConfig, ThemeMode } from "../../themeConfig.js"
import type { ThemeId, ThemeTone } from "../colors.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"

export interface LabelModalState {
	readonly repository: string | null
	readonly target: {
		readonly kind: "pullRequest" | "issue"
		readonly repository: string
		readonly number: number
		readonly url: string
		readonly labels: readonly PullRequestLabel[]
	} | null
	readonly query: string
	readonly selectedIndex: number
	readonly availableLabels: readonly PullRequestLabel[]
	readonly loading: boolean
}

export interface MergeModalState {
	readonly repository: string | null
	readonly number: number | null
	readonly selectedIndex: number
	readonly loading: boolean
	readonly running: boolean
	readonly info: PullRequestMergeInfo | null
	readonly error: string | null
	readonly selectedMethod: PullRequestMergeMethod
	readonly allowedMethods: RepositoryMergeMethods | null
	readonly pendingConfirm: { readonly kind: PullRequestMergeKind; readonly method: PullRequestMergeMethod } | null
}

export interface CloseModalState {
	readonly kind: "pullRequest" | "issue"
	readonly action: "close" | "delete"
	readonly repository: string | null
	readonly number: number | null
	readonly title: string
	readonly url: string | null
	readonly running: boolean
	readonly error: string | null
}

export type ItemEditorField = "title" | "body" | "base" | "head" | "draft" | "labels" | "assignees" | "reviewers" | "milestone"

export interface ItemEditorModalState {
	readonly kind: "pullRequest" | "issue"
	readonly mode: "create" | "edit"
	readonly repository: string
	readonly number: number | null
	readonly url: string | null
	readonly title: string
	readonly body: string
	readonly base: string
	readonly head: string
	readonly draft: boolean
	readonly labels: string
	readonly assignees: string
	readonly reviewers: string
	readonly milestone: string
	readonly focus: ItemEditorField
	readonly running: boolean
	readonly error: string | null
}

export interface MetadataSelectorOption {
	readonly id: string
	readonly label: string
	readonly description: string
}

export interface MetadataSelectorModalState {
	readonly kind: "assignees" | "reviewers" | "milestone" | "base"
	readonly target: {
		readonly kind: "issue" | "pullRequest"
		readonly repository: string
		readonly number: number
		readonly url: string
	}
	readonly query: string
	readonly selectedIndex: number
	readonly selectedIds: readonly string[]
	readonly options: readonly MetadataSelectorOption[]
	readonly loading: boolean
	readonly running: boolean
	readonly error: string | null
}

export const bulkItemActions = ["addLabel", "removeLabel", "addAssignee", "removeAssignee", "milestone", "close", "reopen"] as const
export type BulkItemAction = (typeof bulkItemActions)[number]

export interface BulkItemTarget {
	readonly kind: "issue" | "pullRequest"
	readonly repository: string
	readonly number: number
	readonly url: string
	readonly title: string
	readonly state: "open" | "closed" | "merged"
}

export interface BulkEditorModalState {
	readonly targets: readonly BulkItemTarget[]
	readonly action: BulkItemAction
	readonly value: string
	readonly focus: "action" | "value"
	readonly running: boolean
	readonly confirming: boolean
	readonly cancelRequested: boolean
	readonly summary: string | null
	readonly resultLines: readonly string[]
	readonly error: string | null
}

export interface PullRequestStateModalState {
	readonly repository: string | null
	readonly number: number | null
	readonly title: string
	readonly url: string | null
	readonly isDraft: boolean
	readonly selectedIsDraft: boolean
	readonly running: boolean
	readonly error: string | null
}

export interface FrozenCommentSubject {
	readonly repository: string
	readonly number: number
	readonly key: string
	readonly issueUrl: string | null
}

export type CommentModalTarget =
	| {
			readonly kind: "diff"
			readonly target?: {
				readonly repository: string
				readonly number: number
				readonly commitId: string
				readonly diffKey: string
				readonly anchor: { readonly path: string; readonly line: number; readonly side: DiffCommentSide }
				readonly range: {
					readonly start: { readonly line: number; readonly side: DiffCommentSide }
					readonly end: { readonly line: number; readonly side: DiffCommentSide }
				} | null
			}
	  }
	| { readonly kind: "issue"; readonly subject?: FrozenCommentSubject }
	| { readonly kind: "reply"; readonly subject: FrozenCommentSubject; readonly inReplyTo: string; readonly anchorLabel: string }
	| { readonly kind: "edit"; readonly subject: FrozenCommentSubject; readonly commentId: string; readonly commentTag: "comment" | "review-comment"; readonly anchorLabel: string }

export interface CommentModalState {
	readonly body: string
	readonly cursor: number
	readonly error: string | null
	readonly submitMode: "post" | "queue"
	readonly contentKind: "comment" | "suggestion"
	readonly target: CommentModalTarget
}

export interface DeleteCommentModalState {
	readonly subject: FrozenCommentSubject | null
	readonly commentId: string
	readonly commentTag: "comment" | "review-comment"
	readonly author: string
	readonly preview: string
	readonly running: boolean
	readonly error: string | null
}

export interface CommentThreadModalState {
	readonly scrollOffset: number
}

export interface ChangedFilesModalState {
	readonly query: string
	readonly selectedIndex: number
}

export interface FilterModalState {
	readonly surface: Extract<WorkspaceSurface, "pullRequests" | "issues">
	readonly selectedIndex: number
}

export interface SubmitReviewModalState {
	readonly repository: string | null
	readonly number: number | null
	readonly focus: "action" | "body"
	readonly selectedIndex: number
	readonly body: string
	readonly cursor: number
	readonly running: boolean
	readonly error: string | null
}

export interface PendingReviewModalState {
	readonly selectedIndex: number
	readonly confirmingDiscard: boolean
	readonly running: boolean
	readonly error: string | null
}

export interface RunActionModalState {
	readonly action: "retry" | "cancel"
	readonly repository: string
	readonly runId: number
	readonly title: string
	readonly failedOnly: boolean
	readonly running: boolean
	readonly error: string | null
}

export interface WorkflowDispatchModalState {
	readonly repository: string
	readonly workflows: readonly Workflow[]
	readonly workflowIndex: number
	readonly inputs: readonly WorkflowInput[]
	readonly values: Readonly<Record<string, string | boolean>>
	readonly ref: string
	readonly focusIndex: number
	readonly loadingInputs: boolean
	readonly running: boolean
	readonly error: string | null
}

export interface ArtifactDownloadModalState {
	readonly repository: string
	readonly runId: number
	readonly artifacts: readonly ActionArtifact[]
	readonly selectedIndex: number
	readonly destination: string
	readonly focus: "artifact" | "destination"
	readonly loading: boolean
	readonly running: boolean
	readonly error: string | null
}

export interface ThemeModalState {
	readonly query: string
	readonly filterMode: boolean
	readonly mode: ThemeMode
	readonly tone: ThemeTone
	readonly fixedTheme: ThemeId
	readonly darkTheme: ThemeId
	readonly lightTheme: ThemeId
	readonly initialThemeConfig: ThemeConfig
}

export interface CommandPaletteState {
	readonly query: string
	readonly selectedIndex: number
}

export interface OpenRepositoryModalState {
	readonly query: string
	readonly error: string | null
}

export type ReleaseEditorField = "tagName" | "name" | "body" | "targetCommitish" | "isDraft" | "isPrerelease"

export interface ReleaseEditorModalState {
	readonly mode: "create" | "edit"
	readonly repository: string
	readonly originalTagName: string | null
	readonly tagName: string
	readonly name: string
	readonly body: string
	readonly targetCommitish: string
	readonly isDraft: boolean
	readonly isPrerelease: boolean
	readonly focus: ReleaseEditorField
	readonly running: boolean
	readonly error: string | null
}

export interface DeleteReleaseModalState {
	readonly repository: string
	readonly tagName: string
	readonly name: string
	readonly running: boolean
	readonly error: string | null
}

export type BranchResourceEditorField = "name" | "source"
export type MilestoneResourceEditorField = "title" | "description" | "dueOn" | "state"
export type ResourceEditorField = BranchResourceEditorField | MilestoneResourceEditorField

interface ResourceEditorModalBase {
	readonly mode: "create" | "edit"
	readonly repository: string
	readonly running: boolean
	readonly error: string | null
}

export interface BranchResourceEditorModalState extends ResourceEditorModalBase {
	readonly kind: "branch"
	readonly branchName: string
	readonly sourceIndex: number
	readonly sourceBranches: readonly BranchItem[]
	readonly focus: BranchResourceEditorField
}

export interface MilestoneResourceEditorModalState extends ResourceEditorModalBase {
	readonly kind: "milestone"
	readonly milestoneNumber: number | null
	readonly title: string
	readonly description: string
	readonly dueOn: string
	readonly state: "open" | "closed"
	readonly focus: MilestoneResourceEditorField
}

export type ResourceEditorModalState = BranchResourceEditorModalState | MilestoneResourceEditorModalState

export interface DeleteResourceModalState {
	readonly kind: "branch" | "milestone"
	readonly repository: string
	readonly title: string
	readonly branch: BranchItem | null
	readonly milestoneNumber: number | null
	readonly selectedBranchName: string | null
	readonly running: boolean
	readonly error: string | null
}

export const initialLabelModalState: LabelModalState = {
	repository: null,
	target: null,
	query: "",
	selectedIndex: 0,
	availableLabels: [],
	loading: false,
}

export const initialMergeModalState: MergeModalState = {
	repository: null,
	number: null,
	selectedIndex: 0,
	loading: false,
	running: false,
	info: null,
	error: null,
	selectedMethod: "squash",
	allowedMethods: null,
	pendingConfirm: null,
}

export const initialCloseModalState: CloseModalState = {
	kind: "pullRequest",
	action: "close",
	repository: null,
	number: null,
	title: "",
	url: null,
	running: false,
	error: null,
}

export const initialItemEditorModalState: ItemEditorModalState = {
	kind: "issue",
	mode: "create",
	repository: "",
	number: null,
	url: null,
	title: "",
	body: "",
	base: "main",
	head: "",
	draft: false,
	labels: "",
	assignees: "",
	reviewers: "",
	milestone: "",
	focus: "title",
	running: false,
	error: null,
}

export const initialMetadataSelectorModalState: MetadataSelectorModalState = {
	kind: "assignees",
	target: { kind: "issue", repository: "", number: 0, url: "" },
	query: "",
	selectedIndex: 0,
	selectedIds: [],
	options: [],
	loading: false,
	running: false,
	error: null,
}

export const initialBulkEditorModalState: BulkEditorModalState = {
	targets: [],
	action: "addLabel",
	value: "",
	focus: "action",
	running: false,
	confirming: false,
	cancelRequested: false,
	summary: null,
	resultLines: [],
	error: null,
}

export const initialPullRequestStateModalState: PullRequestStateModalState = {
	repository: null,
	number: null,
	title: "",
	url: null,
	isDraft: false,
	selectedIsDraft: true,
	running: false,
	error: null,
}

export const initialCommentModalState: CommentModalState = {
	body: "",
	cursor: 0,
	error: null,
	submitMode: "post",
	contentKind: "comment",
	target: { kind: "diff" },
}

export const initialDeleteCommentModalState: DeleteCommentModalState = {
	subject: null,
	commentId: "",
	commentTag: "comment",
	author: "",
	preview: "",
	running: false,
	error: null,
}

export const initialCommentThreadModalState: CommentThreadModalState = {
	scrollOffset: 0,
}

export const initialChangedFilesModalState: ChangedFilesModalState = {
	query: "",
	selectedIndex: 0,
}

export const initialFilterModalState: FilterModalState = {
	surface: "pullRequests",
	selectedIndex: 0,
}

export const initialSubmitReviewModalState: SubmitReviewModalState = {
	repository: null,
	number: null,
	focus: "action",
	selectedIndex: 0,
	body: "",
	cursor: 0,
	running: false,
	error: null,
}

export const initialPendingReviewModalState: PendingReviewModalState = {
	selectedIndex: 0,
	confirmingDiscard: false,
	running: false,
	error: null,
}

export const initialRunActionModalState: RunActionModalState = {
	action: "retry",
	repository: "",
	runId: 0,
	title: "",
	failedOnly: false,
	running: false,
	error: null,
}

export const initialWorkflowDispatchModalState: WorkflowDispatchModalState = {
	repository: "",
	workflows: [],
	workflowIndex: 0,
	inputs: [],
	values: {},
	ref: "main",
	focusIndex: 0,
	loadingInputs: false,
	running: false,
	error: null,
}

export const initialArtifactDownloadModalState: ArtifactDownloadModalState = {
	repository: "",
	runId: 0,
	artifacts: [],
	selectedIndex: 0,
	destination: "",
	focus: "artifact",
	loading: false,
	running: false,
	error: null,
}

export const initialThemeModalState: ThemeModalState = {
	query: "",
	filterMode: false,
	mode: "fixed",
	tone: "dark",
	fixedTheme: "ghui",
	darkTheme: "ghui",
	lightTheme: "catppuccin-latte",
	initialThemeConfig: { mode: "fixed", theme: "ghui" },
}

export const initialCommandPaletteState: CommandPaletteState = {
	query: "",
	selectedIndex: 0,
}

export const initialOpenRepositoryModalState: OpenRepositoryModalState = {
	query: "",
	error: null,
}

export const initialReleaseEditorModalState: ReleaseEditorModalState = {
	mode: "create",
	repository: "",
	originalTagName: null,
	tagName: "",
	name: "",
	body: "",
	targetCommitish: "",
	isDraft: false,
	isPrerelease: false,
	focus: "tagName",
	running: false,
	error: null,
}

export const initialDeleteReleaseModalState: DeleteReleaseModalState = {
	repository: "",
	tagName: "",
	name: "",
	running: false,
	error: null,
}

export const initialResourceEditorModalState: ResourceEditorModalState = {
	kind: "branch",
	mode: "create",
	repository: "",
	branchName: "",
	sourceIndex: 0,
	sourceBranches: [],
	focus: "name",
	running: false,
	error: null,
}

export interface ChangePlanModalState {
	readonly kind: "link-pr" | "detach-pr" | "workspace-handoff"
	readonly title: string
	readonly lines: readonly string[]
	readonly confirmLabel: string
	readonly running: boolean
	readonly error: string | null
	readonly repository: string
	readonly prNumber: number | null
	readonly changeId: string | null
	readonly commitId: string | null
	readonly workspaceName: string | null
	readonly destinationPath: string | null
	readonly existingWorkspace: boolean
	readonly operationId: string | null
	readonly storeRoot: string | null
	readonly currentWorkspaceName: string | null
	readonly currentWorkingCopyChangeId: string | null
}

export const initialChangePlanModalState: ChangePlanModalState = {
	kind: "link-pr",
	title: "Confirm",
	lines: [],
	confirmLabel: "confirm",
	running: false,
	error: null,
	repository: "",
	prNumber: null,
	changeId: null,
	commitId: null,
	workspaceName: null,
	destinationPath: null,
	existingWorkspace: false,
	operationId: null,
	storeRoot: null,
	currentWorkspaceName: null,
	currentWorkingCopyChangeId: null,
}

export const initialDeleteResourceModalState: DeleteResourceModalState = {
	kind: "branch",
	repository: "",
	title: "",
	branch: null,
	milestoneNumber: null,
	selectedBranchName: null,
	running: false,
	error: null,
}

export type Modal = Data.TaggedEnum<{
	None: {}
	Label: LabelModalState
	Close: CloseModalState
	ItemEditor: ItemEditorModalState
	MetadataSelector: MetadataSelectorModalState
	BulkEditor: BulkEditorModalState
	PullRequestState: PullRequestStateModalState
	Merge: MergeModalState
	Comment: CommentModalState
	DeleteComment: DeleteCommentModalState
	CommentThread: CommentThreadModalState
	ChangedFiles: ChangedFilesModalState
	Filter: FilterModalState
	SubmitReview: SubmitReviewModalState
	PendingReview: PendingReviewModalState
	RunAction: RunActionModalState
	WorkflowDispatch: WorkflowDispatchModalState
	ArtifactDownload: ArtifactDownloadModalState
	Theme: ThemeModalState
	CommandPalette: CommandPaletteState
	OpenRepository: OpenRepositoryModalState
	ReleaseEditor: ReleaseEditorModalState
	DeleteRelease: DeleteReleaseModalState
	ResourceEditor: ResourceEditorModalState
	DeleteResource: DeleteResourceModalState
	ChangePlan: ChangePlanModalState
}>

export const Modal = Data.taggedEnum<Modal>()
export const initialModal: Modal = Modal.None()

export type ModalTag = Modal["_tag"]
export type ModalState<Tag extends Exclude<ModalTag, "None">> = Tag extends "ResourceEditor" ? ResourceEditorModalState : Omit<Extract<Modal, { _tag: Tag }>, "_tag">

export const modalInitialStates = {
	Label: initialLabelModalState,
	Close: initialCloseModalState,
	ItemEditor: initialItemEditorModalState,
	MetadataSelector: initialMetadataSelectorModalState,
	BulkEditor: initialBulkEditorModalState,
	PullRequestState: initialPullRequestStateModalState,
	Merge: initialMergeModalState,
	Comment: initialCommentModalState,
	DeleteComment: initialDeleteCommentModalState,
	CommentThread: initialCommentThreadModalState,
	ChangedFiles: initialChangedFilesModalState,
	Filter: initialFilterModalState,
	SubmitReview: initialSubmitReviewModalState,
	PendingReview: initialPendingReviewModalState,
	RunAction: initialRunActionModalState,
	WorkflowDispatch: initialWorkflowDispatchModalState,
	ArtifactDownload: initialArtifactDownloadModalState,
	Theme: initialThemeModalState,
	CommandPalette: initialCommandPaletteState,
	OpenRepository: initialOpenRepositoryModalState,
	ReleaseEditor: initialReleaseEditorModalState,
	DeleteRelease: initialDeleteReleaseModalState,
	ResourceEditor: initialResourceEditorModalState,
	DeleteResource: initialDeleteResourceModalState,
	ChangePlan: initialChangePlanModalState,
} as const satisfies { [Tag in Exclude<ModalTag, "None">]: ModalState<Tag> }
