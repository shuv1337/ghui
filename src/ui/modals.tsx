// Barrel re-export for modal components, types, initial states, and shared
// helpers. Per-modal files live under ./modals/. Existing consumers import
// from "./modals" — this barrel preserves that surface.

export { ChangedFilesModal } from "./modals/ChangedFilesModal.js"
export { BulkEditorModal } from "./modals/BulkEditorModal.js"
export { CloseModal } from "./modals/CloseModal.js"
export { ItemEditorModal } from "./modals/ItemEditorModal.js"
export { CommentModal } from "./modals/CommentModal.js"
export { CommentThreadModal } from "./modals/CommentThreadModal.js"
export { DeleteCommentModal } from "./modals/DeleteCommentModal.js"
export { FilterModal, filterOptions } from "./modals/FilterModal.js"
export { LabelModal } from "./modals/LabelModal.js"
export { MergeModal } from "./modals/MergeModal.js"
export { filteredMetadataOptions, MetadataSelectorModal } from "./modals/MetadataSelectorModal.js"
export { OpenRepositoryModal } from "./modals/OpenRepositoryModal.js"
export { PullRequestStateModal } from "./modals/PullRequestStateModal.js"
export { ReleaseEditorModal } from "./modals/ReleaseEditorModal.js"
export { DeleteReleaseModal } from "./modals/DeleteReleaseModal.js"
export { ResourceEditorModal } from "./modals/ResourceEditorModal.js"
export { DeleteResourceModal } from "./modals/DeleteResourceModal.js"
export { ChangePlanModal } from "./modals/ChangePlanModal.js"
export { SubmitReviewModal } from "./modals/SubmitReviewModal.js"
export { PendingReviewModal } from "./modals/PendingReviewModal.js"
export { RunActionModal } from "./modals/RunActionModal.js"
export { WorkflowDispatchModal } from "./modals/WorkflowDispatchModal.js"
export { ArtifactDownloadModal } from "./modals/ArtifactDownloadModal.js"
export { ThemeModal } from "./modals/ThemeModal.js"

export type { ChangedFileSearchResult, SubmitReviewOption } from "./modals/shared.js"
export { filterChangedFiles, filterLabels, submitReviewOptions } from "./modals/shared.js"

export type {
	ChangedFilesModalState,
	BulkEditorModalState,
	BulkItemAction,
	BulkItemTarget,
	CloseModalState,
	ItemEditorField,
	ItemEditorModalState,
	MetadataSelectorModalState,
	MetadataSelectorOption,
	CommandPaletteState,
	CommentModalState,
	CommentModalTarget,
	CommentThreadModalState,
	DeleteCommentModalState,
	FilterModalState,
	FrozenCommentSubject,
	LabelModalState,
	MergeModalState,
	ModalState,
	ModalTag,
	OpenRepositoryModalState,
	ReleaseEditorField,
	ReleaseEditorModalState,
	DeleteReleaseModalState,
	ResourceEditorField,
	ResourceEditorModalState,
	DeleteResourceModalState,
	ChangePlanModalState,
	PullRequestStateModalState,
	SubmitReviewModalState,
	PendingReviewModalState,
	RunActionModalState,
	WorkflowDispatchModalState,
	ArtifactDownloadModalState,
	ThemeModalState,
} from "./modals/types.js"
export {
	initialChangedFilesModalState,
	initialBulkEditorModalState,
	initialCloseModalState,
	initialItemEditorModalState,
	initialMetadataSelectorModalState,
	initialCommandPaletteState,
	initialCommentModalState,
	initialCommentThreadModalState,
	initialDeleteCommentModalState,
	initialFilterModalState,
	initialLabelModalState,
	initialMergeModalState,
	initialModal,
	initialOpenRepositoryModalState,
	initialReleaseEditorModalState,
	initialDeleteReleaseModalState,
	initialResourceEditorModalState,
	initialDeleteResourceModalState,
	initialPullRequestStateModalState,
	initialSubmitReviewModalState,
	initialPendingReviewModalState,
	initialRunActionModalState,
	initialWorkflowDispatchModalState,
	initialArtifactDownloadModalState,
	initialThemeModalState,
	Modal,
	modalInitialStates,
} from "./modals/types.js"
