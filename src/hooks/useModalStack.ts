import { useAtom } from "@effect/atom-react"
import { activeModalAtom } from "../ui/modals/atoms.js"
import { Modal, type ModalState, type ModalTag } from "../ui/modals/types.js"
import {
	initialChangedFilesModalState,
	initialBulkEditorModalState,
	initialCloseModalState,
	initialCommandPaletteState,
	initialCommentModalState,
	initialDeleteCommentModalState,
	initialFilterModalState,
	initialItemEditorModalState,
	initialMetadataSelectorModalState,
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
	type ChangedFilesModalState,
	type BulkEditorModalState,
	type CloseModalState,
	type CommandPaletteState,
	type CommentModalState,
	type DeleteCommentModalState,
	type FilterModalState,
	type ItemEditorModalState,
	type MetadataSelectorModalState,
	type LabelModalState,
	type MergeModalState,
	type OpenRepositoryModalState,
	type ReleaseEditorModalState,
	type DeleteReleaseModalState,
	type ResourceEditorModalState,
	type DeleteResourceModalState,
	type PullRequestStateModalState,
	type SubmitReviewModalState,
	type PendingReviewModalState,
	type RunActionModalState,
	type WorkflowDispatchModalState,
	type ArtifactDownloadModalState,
	type ThemeModalState,
} from "../ui/modals/types.js"

export interface ModalStack {
	readonly activeModal: Modal
	readonly closeActiveModal: () => void
	readonly labelModalActive: boolean
	readonly closeModalActive: boolean
	readonly itemEditorModalActive: boolean
	readonly metadataSelectorModalActive: boolean
	readonly pullRequestStateModalActive: boolean
	readonly mergeModalActive: boolean
	readonly commentModalActive: boolean
	readonly deleteCommentModalActive: boolean
	readonly commentThreadModalActive: boolean
	readonly changedFilesModalActive: boolean
	readonly bulkEditorModalActive: boolean
	readonly filterModalActive: boolean
	readonly submitReviewModalActive: boolean
	readonly pendingReviewModalActive: boolean
	readonly runActionModalActive: boolean
	readonly workflowDispatchModalActive: boolean
	readonly artifactDownloadModalActive: boolean
	readonly themeModalActive: boolean
	readonly commandPaletteActive: boolean
	readonly openRepositoryModalActive: boolean
	readonly releaseEditorModalActive: boolean
	readonly deleteReleaseModalActive: boolean
	readonly resourceEditorModalActive: boolean
	readonly deleteResourceModalActive: boolean
	readonly labelModal: LabelModalState
	readonly closeModal: CloseModalState
	readonly itemEditorModal: ItemEditorModalState
	readonly metadataSelectorModal: MetadataSelectorModalState
	readonly pullRequestStateModal: PullRequestStateModalState
	readonly mergeModal: MergeModalState
	readonly commentModal: CommentModalState
	readonly deleteCommentModal: DeleteCommentModalState
	readonly changedFilesModal: ChangedFilesModalState
	readonly bulkEditorModal: BulkEditorModalState
	readonly filterModal: FilterModalState
	readonly submitReviewModal: SubmitReviewModalState
	readonly pendingReviewModal: PendingReviewModalState
	readonly runActionModal: RunActionModalState
	readonly workflowDispatchModal: WorkflowDispatchModalState
	readonly artifactDownloadModal: ArtifactDownloadModalState
	readonly themeModal: ThemeModalState
	readonly commandPalette: CommandPaletteState
	readonly openRepositoryModal: OpenRepositoryModalState
	readonly releaseEditorModal: ReleaseEditorModalState
	readonly deleteReleaseModal: DeleteReleaseModalState
	readonly resourceEditorModal: ResourceEditorModalState
	readonly deleteResourceModal: DeleteResourceModalState
	readonly setLabelModal: ReturnType<typeof makeModalSetter<"Label">>
	readonly setItemEditorModal: ReturnType<typeof makeModalSetter<"ItemEditor">>
	readonly setMetadataSelectorModal: ReturnType<typeof makeModalSetter<"MetadataSelector">>
	readonly setPullRequestStateModal: ReturnType<typeof makeModalSetter<"PullRequestState">>
	readonly setMergeModal: ReturnType<typeof makeModalSetter<"Merge">>
	readonly setCommentModal: ReturnType<typeof makeModalSetter<"Comment">>
	readonly setDeleteCommentModal: ReturnType<typeof makeModalSetter<"DeleteComment">>
	readonly setCommentThreadModal: ReturnType<typeof makeModalSetter<"CommentThread">>
	readonly setChangedFilesModal: ReturnType<typeof makeModalSetter<"ChangedFiles">>
	readonly setBulkEditorModal: ReturnType<typeof makeModalSetter<"BulkEditor">>
	readonly setFilterModal: ReturnType<typeof makeModalSetter<"Filter">>
	readonly setSubmitReviewModal: ReturnType<typeof makeModalSetter<"SubmitReview">>
	readonly setPendingReviewModal: ReturnType<typeof makeModalSetter<"PendingReview">>
	readonly setRunActionModal: ReturnType<typeof makeModalSetter<"RunAction">>
	readonly setWorkflowDispatchModal: ReturnType<typeof makeModalSetter<"WorkflowDispatch">>
	readonly setArtifactDownloadModal: ReturnType<typeof makeModalSetter<"ArtifactDownload">>
	readonly setThemeModal: ReturnType<typeof makeModalSetter<"Theme">>
	readonly setCommandPalette: ReturnType<typeof makeModalSetter<"CommandPalette">>
	readonly setOpenRepositoryModal: ReturnType<typeof makeModalSetter<"OpenRepository">>
	readonly setReleaseEditorModal: ReturnType<typeof makeModalSetter<"ReleaseEditor">>
	readonly setDeleteReleaseModal: ReturnType<typeof makeModalSetter<"DeleteRelease">>
	readonly setResourceEditorModal: ReturnType<typeof makeModalSetter<"ResourceEditor">>
	readonly setDeleteResourceModal: ReturnType<typeof makeModalSetter<"DeleteResource">>
}

type ModalSetter = (current: Modal) => Modal

const makeModalSetter =
	<Tag extends Exclude<ModalTag, "None">>(setActiveModal: (next: Modal | ModalSetter) => void, tag: Tag) =>
	(next: ModalState<Tag> | ((prev: ModalState<Tag>) => ModalState<Tag>)) =>
		setActiveModal((current) => {
			const ctor = Modal[tag] as unknown as (args: ModalState<Tag>) => Modal
			if (typeof next === "function") {
				const updater = next as (prev: ModalState<Tag>) => ModalState<Tag>
				if (current._tag !== tag) return current
				return ctor(updater(current as unknown as ModalState<Tag>))
			}
			return ctor(next)
		})

/**
 * Subscribes to `activeModalAtom` and derives the cross-cutting state
 * each modal needs: an active boolean, a typed snapshot (or its initial
 * default), and a tag-narrowed setter. Centralising the boilerplate
 * here keeps App.tsx free of ~48 lines of mechanical destructuring.
 */
export const useModalStack = (): ModalStack => {
	const [activeModal, setActiveModal] = useAtom(activeModalAtom)
	const closeActiveModal = () => setActiveModal(initialModal)
	const labelModalActive = Modal.$is("Label")(activeModal)
	const closeModalActive = Modal.$is("Close")(activeModal)
	const itemEditorModalActive = Modal.$is("ItemEditor")(activeModal)
	const metadataSelectorModalActive = Modal.$is("MetadataSelector")(activeModal)
	const pullRequestStateModalActive = Modal.$is("PullRequestState")(activeModal)
	const mergeModalActive = Modal.$is("Merge")(activeModal)
	const commentModalActive = Modal.$is("Comment")(activeModal)
	const deleteCommentModalActive = Modal.$is("DeleteComment")(activeModal)
	const commentThreadModalActive = Modal.$is("CommentThread")(activeModal)
	const changedFilesModalActive = Modal.$is("ChangedFiles")(activeModal)
	const bulkEditorModalActive = Modal.$is("BulkEditor")(activeModal)
	const filterModalActive = Modal.$is("Filter")(activeModal)
	const submitReviewModalActive = Modal.$is("SubmitReview")(activeModal)
	const pendingReviewModalActive = Modal.$is("PendingReview")(activeModal)
	const runActionModalActive = Modal.$is("RunAction")(activeModal)
	const workflowDispatchModalActive = Modal.$is("WorkflowDispatch")(activeModal)
	const artifactDownloadModalActive = Modal.$is("ArtifactDownload")(activeModal)
	const themeModalActive = Modal.$is("Theme")(activeModal)
	const commandPaletteActive = Modal.$is("CommandPalette")(activeModal)
	const openRepositoryModalActive = Modal.$is("OpenRepository")(activeModal)
	const releaseEditorModalActive = Modal.$is("ReleaseEditor")(activeModal)
	const deleteReleaseModalActive = Modal.$is("DeleteRelease")(activeModal)
	const resourceEditorModalActive = Modal.$is("ResourceEditor")(activeModal)
	const deleteResourceModalActive = Modal.$is("DeleteResource")(activeModal)
	return {
		activeModal,
		closeActiveModal,
		labelModalActive,
		closeModalActive,
		itemEditorModalActive,
		metadataSelectorModalActive,
		pullRequestStateModalActive,
		mergeModalActive,
		commentModalActive,
		deleteCommentModalActive,
		commentThreadModalActive,
		changedFilesModalActive,
		bulkEditorModalActive,
		filterModalActive,
		submitReviewModalActive,
		pendingReviewModalActive,
		runActionModalActive,
		workflowDispatchModalActive,
		artifactDownloadModalActive,
		themeModalActive,
		commandPaletteActive,
		openRepositoryModalActive,
		releaseEditorModalActive,
		deleteReleaseModalActive,
		resourceEditorModalActive,
		deleteResourceModalActive,
		labelModal: labelModalActive ? activeModal : initialLabelModalState,
		closeModal: closeModalActive ? activeModal : initialCloseModalState,
		itemEditorModal: itemEditorModalActive ? activeModal : initialItemEditorModalState,
		metadataSelectorModal: metadataSelectorModalActive ? activeModal : initialMetadataSelectorModalState,
		pullRequestStateModal: pullRequestStateModalActive ? activeModal : initialPullRequestStateModalState,
		mergeModal: mergeModalActive ? activeModal : initialMergeModalState,
		commentModal: commentModalActive ? activeModal : initialCommentModalState,
		deleteCommentModal: deleteCommentModalActive ? activeModal : initialDeleteCommentModalState,
		changedFilesModal: changedFilesModalActive ? activeModal : initialChangedFilesModalState,
		bulkEditorModal: bulkEditorModalActive ? activeModal : initialBulkEditorModalState,
		filterModal: filterModalActive ? activeModal : initialFilterModalState,
		submitReviewModal: submitReviewModalActive ? activeModal : initialSubmitReviewModalState,
		pendingReviewModal: pendingReviewModalActive ? activeModal : initialPendingReviewModalState,
		runActionModal: runActionModalActive ? activeModal : initialRunActionModalState,
		workflowDispatchModal: workflowDispatchModalActive ? activeModal : initialWorkflowDispatchModalState,
		artifactDownloadModal: artifactDownloadModalActive ? activeModal : initialArtifactDownloadModalState,
		themeModal: themeModalActive ? activeModal : initialThemeModalState,
		commandPalette: commandPaletteActive ? activeModal : initialCommandPaletteState,
		openRepositoryModal: openRepositoryModalActive ? activeModal : initialOpenRepositoryModalState,
		releaseEditorModal: releaseEditorModalActive ? activeModal : initialReleaseEditorModalState,
		deleteReleaseModal: deleteReleaseModalActive ? activeModal : initialDeleteReleaseModalState,
		resourceEditorModal: resourceEditorModalActive ? (activeModal as unknown as ResourceEditorModalState) : initialResourceEditorModalState,
		deleteResourceModal: deleteResourceModalActive ? activeModal : initialDeleteResourceModalState,
		setLabelModal: makeModalSetter(setActiveModal, "Label"),
		setItemEditorModal: makeModalSetter(setActiveModal, "ItemEditor"),
		setMetadataSelectorModal: makeModalSetter(setActiveModal, "MetadataSelector"),
		setPullRequestStateModal: makeModalSetter(setActiveModal, "PullRequestState"),
		setMergeModal: makeModalSetter(setActiveModal, "Merge"),
		setCommentModal: makeModalSetter(setActiveModal, "Comment"),
		setDeleteCommentModal: makeModalSetter(setActiveModal, "DeleteComment"),
		setCommentThreadModal: makeModalSetter(setActiveModal, "CommentThread"),
		setChangedFilesModal: makeModalSetter(setActiveModal, "ChangedFiles"),
		setBulkEditorModal: makeModalSetter(setActiveModal, "BulkEditor"),
		setFilterModal: makeModalSetter(setActiveModal, "Filter"),
		setSubmitReviewModal: makeModalSetter(setActiveModal, "SubmitReview"),
		setPendingReviewModal: makeModalSetter(setActiveModal, "PendingReview"),
		setRunActionModal: makeModalSetter(setActiveModal, "RunAction"),
		setWorkflowDispatchModal: makeModalSetter(setActiveModal, "WorkflowDispatch"),
		setArtifactDownloadModal: makeModalSetter(setActiveModal, "ArtifactDownload"),
		setThemeModal: makeModalSetter(setActiveModal, "Theme"),
		setCommandPalette: makeModalSetter(setActiveModal, "CommandPalette"),
		setOpenRepositoryModal: makeModalSetter(setActiveModal, "OpenRepository"),
		setReleaseEditorModal: makeModalSetter(setActiveModal, "ReleaseEditor"),
		setDeleteReleaseModal: makeModalSetter(setActiveModal, "DeleteRelease"),
		setResourceEditorModal: makeModalSetter(setActiveModal, "ResourceEditor"),
		setDeleteResourceModal: makeModalSetter(setActiveModal, "DeleteResource"),
	}
}
