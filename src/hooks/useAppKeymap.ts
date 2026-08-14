import type { AppCommand } from "../commands.js"
import type { DiffCommentSide } from "../domain.js"
import type { PullRequestComment } from "../domain.js"
import type {
	ChangedFilesModalState,
	ArtifactDownloadModalState,
	BulkEditorModalState,
	CommandPaletteState,
	ItemEditorModalState,
	MetadataSelectorModalState,
	LabelModalState,
	MergeModalState,
	OpenRepositoryModalState,
	ReleaseEditorModalState,
	RunActionModalState,
	SubmitReviewModalState,
	ThemeModalState,
	WorkflowDispatchModalState,
	ResourceEditorModalState,
} from "../ui/modals/types.js"
import { canEditComment } from "../ui/comments/useCommentMutations.js"
import type { RunsViewCtx } from "../keymap/runsView.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import { useKeymapWiring } from "./useKeymapWiring.js"
import type { CommentEditorValue } from "../ui/commentEditor.js"

export interface UseAppKeymapInput {
	readonly disabled: boolean

	// Active flags
	readonly closeModalActive: boolean
	readonly itemEditorModalActive: boolean
	readonly metadataSelectorModalActive: boolean
	readonly pullRequestStateModalActive: boolean
	readonly mergeModalActive: boolean
	readonly commentThreadModalActive: boolean
	readonly changedFilesModalActive: boolean
	readonly bulkEditorModalActive: boolean
	readonly filterModalActive: boolean
	readonly submitReviewModalActive: boolean
	readonly pendingReviewModalActive: boolean
	readonly labelModalActive: boolean
	readonly themeModalActive: boolean
	readonly openRepositoryModalActive: boolean
	readonly commentModalActive: boolean
	readonly deleteCommentModalActive: boolean
	readonly commandPaletteActive: boolean
	readonly releaseEditorModalActive: boolean
	readonly deleteReleaseModalActive: boolean
	readonly runActionModalActive: boolean
	readonly workflowDispatchModalActive: boolean
	readonly artifactDownloadModalActive: boolean
	readonly resourceEditorModalActive: boolean
	readonly deleteResourceModalActive: boolean
	readonly filterMode: boolean
	readonly diffFullView: boolean
	readonly runsFullView: boolean
	readonly detailFullView: boolean
	readonly commentsViewActive: boolean

	// Modal state needed for derived flags
	readonly themeModal: ThemeModalState
	readonly submitReviewModal: SubmitReviewModalState
	readonly mergeModal: MergeModalState
	readonly commandPaletteSelectedCommand: AppCommand | null
	readonly releaseEditorModal: ReleaseEditorModalState
	readonly itemEditorModal: ItemEditorModalState
	readonly metadataSelectorModal: MetadataSelectorModalState
	readonly bulkEditorModal: BulkEditorModalState
	readonly deleteReleaseModalRunning: boolean
	readonly runActionModal: RunActionModalState
	readonly workflowDispatchModal: WorkflowDispatchModalState
	readonly artifactDownloadModal: ArtifactDownloadModalState
	readonly resourceEditorModal: ResourceEditorModalState
	readonly deleteResourceModalRunning: boolean

	// Surfaces
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly workspaceTabSurfaces: readonly WorkspaceSurface[]

	// Modal action handlers
	readonly closeActiveModal: () => void
	readonly confirmCloseModal: () => void
	readonly confirmPullRequestStateChange: () => void
	readonly movePullRequestStateSelection: () => void
	readonly cancelOrCloseMergeModal: () => void
	readonly confirmMergeAction: () => void
	readonly cycleMergeMethod: (delta: -1 | 1) => void
	readonly moveMergeSelection: (delta: -1 | 1) => void
	readonly openDiffCommentModal: () => void
	readonly scrollCommentThread: (delta: number) => void
	readonly changedFileResultsLength: number
	readonly selectChangedFile: () => void
	readonly moveChangedFileSelection: (delta: -1 | 1) => void
	readonly applySelectedFilter: () => void
	readonly moveFilterSelection: (delta: -1 | 1) => void
	readonly setSubmitReviewModal: (next: SubmitReviewModalState | ((prev: SubmitReviewModalState) => SubmitReviewModalState)) => void
	readonly confirmSubmitReview: () => void
	readonly movePendingReviewSelection: (delta: -1 | 1) => void
	readonly jumpPendingReviewComment: () => void
	readonly editPendingReviewComment: () => void
	readonly deletePendingReviewComment: () => void
	readonly submitPendingReviewFromPane: () => void
	readonly discardPendingReviewFromPane: () => void
	readonly editSubmitReview: (transform: (value: CommentEditorValue) => CommentEditorValue) => void
	readonly moveSubmitReviewActionSelection: (delta: -1 | 1) => void
	readonly toggleLabelAtIndex: () => void
	readonly moveLabelSelection: (delta: -1 | 1) => void
	readonly closeThemeModal: (apply: boolean) => void
	readonly updateThemeQuery: (query: string, options?: { readonly previewFirst?: boolean; readonly filterMode?: boolean }) => void
	readonly toggleThemeMode: () => void
	readonly toggleThemeTone: () => void
	readonly moveThemeSelection: (delta: -1 | 1) => void
	readonly openRepositoryFromInput: () => void
	readonly confirmDeleteComment: () => void
	readonly toggleCommentSubmitMode: () => void
	readonly toggleCommentContentKind: () => void
	readonly runCommandPaletteCommand: (command: AppCommand) => void
	readonly moveCommandPaletteSelection: (delta: -1 | 1) => void
	readonly moveReleaseEditorFocus: (delta: -1 | 1) => void
	readonly toggleReleaseEditorFocused: () => void
	readonly submitReleaseEditor: () => void
	readonly confirmDeleteRelease: () => void
	readonly confirmRunAction: () => void
	readonly moveWorkflowDispatchFocus: (delta: -1 | 1) => void
	readonly cycleWorkflowDispatchValue: (delta: -1 | 1) => void
	readonly confirmWorkflowDispatch: () => void
	readonly toggleArtifactFocus: () => void
	readonly moveArtifactSelection: (delta: -1 | 1) => void
	readonly confirmArtifactDownload: () => void
	readonly moveResourceEditorFocus: (delta: -1 | 1) => void
	readonly cycleResourceEditorChoice: (delta: -1 | 1) => void
	readonly submitResourceEditor: () => void
	readonly confirmDeleteResource: () => void
	readonly moveItemEditorFocus: (delta: -1 | 1) => void
	readonly toggleItemEditorDraft: () => void
	readonly submitItemEditor: () => void
	readonly moveMetadataSelector: (delta: -1 | 1) => void
	readonly toggleMetadataSelector: (index?: number) => void
	readonly closeOrCancelBulkEditor: () => void
	readonly moveBulkAction: (delta: -1 | 1) => void
	readonly toggleBulkEditorFocus: () => void
	readonly submitBulkEditor: () => void

	// Filter-mode actions
	readonly setFilterDraft: (next: string | ((prev: string) => string)) => void
	readonly setFilterMode: (next: boolean) => void
	readonly setFilterQuery: (next: string) => void
	readonly filterQuery: string
	readonly filterDraft: string

	// Runs view (pre-built ctx; the runs feature owns its own atom logic)
	readonly runsViewCtx: RunsViewCtx

	// Diff actions
	readonly halfPage: number
	readonly diffCommentRangeActive: boolean
	readonly setDiffCommentRangeStartIndex: (next: number | null) => void
	readonly runCommandById: (id: string, options?: { readonly notifyDisabled?: boolean }) => boolean
	readonly openSelectedDiffComment: () => void
	readonly moveDiffCommentAnchor: (delta: number, options?: { readonly preserveViewportRow?: boolean }) => void
	readonly moveDiffCommentToBoundary: (boundary: "first" | "last") => void
	readonly alignSelectedDiffCommentAnchor: (position: "top" | "center" | "bottom") => void
	readonly selectDiffCommentSide: (side: DiffCommentSide) => void

	// Detail actions
	readonly scrollDetailFullViewBy: (delta: number) => void
	readonly scrollDetailFullViewTo: (y: number) => void

	// Comments view
	readonly commentsRowCount: number
	readonly selectedOrderedComment: PullRequestComment | null
	readonly username: string | null
	readonly moveCommentsSelection: (delta: number) => void
	readonly setCommentsSelection: (index: number) => void
	readonly closeCommentsView: () => void
	readonly openSelectedCommentInBrowser: () => void
	readonly refreshSelectedComments: () => void
	readonly confirmCommentSelection: () => void

	// List nav
	readonly visiblePullRequestsLength: number
	readonly issuesLength: number
	readonly repositoryItemsLength: number
	readonly releasesLength: number
	readonly resourceItemsLength: number
	readonly changeItemsLength: number
	readonly notificationItemsLength: number
	readonly selectedRepository: string | null
	readonly selectedPullRequest: { readonly url: string } | null
	readonly selectedIssue: unknown | null
	readonly selectedRepositoryItem: unknown | null
	readonly selectedRelease: unknown | null
	readonly selectedResourceItem: unknown | null
	readonly selectedNotification: unknown | null
	readonly isWideLayout: boolean
	readonly loadMoreRowSelected: boolean
	readonly loadMoreIssueRowSelected: boolean
	readonly loadMorePullRequests: () => boolean | Promise<void> | void
	readonly loadMoreIssues: () => boolean | Promise<void> | void
	readonly openSelectedRepository: () => void
	readonly openRepositoryPicker: () => void
	readonly toggleFavoriteRepository: () => void
	readonly removeSelectedRepository: () => void
	readonly openFilterModal: () => void
	readonly goUpWorkspaceScope: () => boolean
	readonly switchQueueMode: (delta: 1 | -1) => void
	readonly switchWorkspaceSurface: (next: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
	readonly scrollDetailPreviewBy: (y: number) => void
	readonly scrollDetailPreviewTo: (y: number) => void
	readonly stepSelected: (delta: number) => void
	readonly stepSelectedUp: (count?: number) => void
	readonly stepSelectedDown: (count?: number) => void
	readonly stepSelectedUpWrap: () => void
	readonly stepSelectedDownWithLoadMore: () => void
	readonly moveSelectedToPreviousGroup: () => void
	readonly moveSelectedToNextGroup: () => void
	readonly setSelectedIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedIssueIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedRepositoryIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedReleaseIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedResourceIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedChangeIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedNotificationIndex: (next: number | ((current: number) => number)) => void

	// Shell
	readonly handleQuitOrClose: () => void

	// Text-input dispatch
	readonly setCommandPalette: (next: CommandPaletteState | ((prev: CommandPaletteState) => CommandPaletteState)) => void
	readonly setOpenRepositoryModal: (next: OpenRepositoryModalState | ((prev: OpenRepositoryModalState) => OpenRepositoryModalState)) => void
	readonly setChangedFilesModal: (next: ChangedFilesModalState | ((prev: ChangedFilesModalState) => ChangedFilesModalState)) => void
	readonly setLabelModal: (next: LabelModalState | ((prev: LabelModalState) => LabelModalState)) => void
	readonly setReleaseEditorModal: (next: ReleaseEditorModalState | ((prev: ReleaseEditorModalState) => ReleaseEditorModalState)) => void
	readonly setItemEditorModal: (next: ItemEditorModalState | ((prev: ItemEditorModalState) => ItemEditorModalState)) => void
	readonly setMetadataSelectorModal: (next: MetadataSelectorModalState | ((prev: MetadataSelectorModalState) => MetadataSelectorModalState)) => void
	readonly setBulkEditorModal: (next: BulkEditorModalState | ((prev: BulkEditorModalState) => BulkEditorModalState)) => void
	readonly setWorkflowDispatchModal: (next: WorkflowDispatchModalState | ((prev: WorkflowDispatchModalState) => WorkflowDispatchModalState)) => void
	readonly setArtifactDownloadModal: (next: ArtifactDownloadModalState | ((prev: ArtifactDownloadModalState) => ArtifactDownloadModalState)) => void
	readonly setResourceEditorModal: (next: ResourceEditorModalState | ((prev: ResourceEditorModalState) => ResourceEditorModalState)) => void
	readonly editThemeQuery: (transform: (query: string) => string) => void
}

/**
 * Single seam for keymap wiring. Takes a flat record of every input the
 * keymap context needs and constructs the structured BuildAppCtxInput +
 * UseTextInputDispatcherInput internally, then binds them via
 * useKeymapWiring.
 *
 * Lifts ~140 LOC of object-shaping out of App.tsx; App.tsx now hands
 * over a flat bundle and lets this hook produce the right shape.
 */
export const useAppKeymap = (i: UseAppKeymapInput): void => {
	useKeymapWiring({
		disabled: i.disabled,
		ctxInput: {
			flags: {
				closeModalActive: i.closeModalActive,
				itemEditorModalActive: i.itemEditorModalActive,
				metadataSelectorModalActive: i.metadataSelectorModalActive,
				pullRequestStateModalActive: i.pullRequestStateModalActive,
				mergeModalActive: i.mergeModalActive,
				commentThreadModalActive: i.commentThreadModalActive,
				changedFilesModalActive: i.changedFilesModalActive,
				bulkEditorModalActive: i.bulkEditorModalActive,
				filterModalActive: i.filterModalActive,
				submitReviewModalActive: i.submitReviewModalActive,
				pendingReviewModalActive: i.pendingReviewModalActive,
				labelModalActive: i.labelModalActive,
				themeModalActive: i.themeModalActive,
				openRepositoryModalActive: i.openRepositoryModalActive,
				commentModalActive: i.commentModalActive,
				deleteCommentModalActive: i.deleteCommentModalActive,
				commandPaletteActive: i.commandPaletteActive,
				releaseEditorModalActive: i.releaseEditorModalActive || i.resourceEditorModalActive,
				deleteReleaseModalActive: i.deleteReleaseModalActive || i.deleteResourceModalActive,
				actionsModalActive: i.runActionModalActive || i.workflowDispatchModalActive || i.artifactDownloadModalActive,
				filterMode: i.filterMode,
				diffFullView: i.diffFullView,
				runsFullView: i.runsFullView,
				detailFullView: i.detailFullView,
				commentsViewActive: i.commentsViewActive,
				textInputActive:
					i.commentModalActive ||
					i.itemEditorModalActive ||
					i.metadataSelectorModalActive ||
					i.commandPaletteActive ||
					i.openRepositoryModalActive ||
					i.changedFilesModalActive ||
					i.bulkEditorModalActive ||
					i.submitReviewModalActive ||
					i.pendingReviewModalActive ||
					i.labelModalActive ||
					i.releaseEditorModalActive ||
					i.workflowDispatchModalActive ||
					i.artifactDownloadModalActive ||
					i.resourceEditorModalActive ||
					i.filterMode ||
					(i.themeModalActive && i.themeModal.filterMode),
			},
			closeModal: { closeActiveModal: i.closeActiveModal, confirmCloseModal: i.confirmCloseModal },
			itemEditorModal: {
				state: i.itemEditorModal,
				close: i.closeActiveModal,
				moveFocus: i.moveItemEditorFocus,
				toggleDraft: i.toggleItemEditorDraft,
				submit: i.submitItemEditor,
			},
			metadataSelectorModal: {
				close: i.closeActiveModal,
				move: i.moveMetadataSelector,
				toggle: i.toggleMetadataSelector,
			},
			bulkEditorModal: {
				state: i.bulkEditorModal,
				closeOrCancel: i.closeOrCancelBulkEditor,
				moveAction: i.moveBulkAction,
				toggleFocus: i.toggleBulkEditorFocus,
				submit: i.submitBulkEditor,
			},
			pullRequestStateModal: {
				closeActiveModal: i.closeActiveModal,
				confirmPullRequestStateChange: i.confirmPullRequestStateChange,
				movePullRequestStateSelection: i.movePullRequestStateSelection,
			},
			mergeModal: {
				mergeModal: i.mergeModal,
				cancelOrCloseMergeModal: i.cancelOrCloseMergeModal,
				confirmMergeAction: i.confirmMergeAction,
				cycleMergeMethod: i.cycleMergeMethod,
				moveMergeSelection: i.moveMergeSelection,
			},
			commentThreadModal: { halfPage: i.halfPage, closeActiveModal: i.closeActiveModal, openDiffCommentModal: i.openDiffCommentModal, scrollCommentThread: i.scrollCommentThread },
			changedFilesModal: {
				hasResults: i.changedFileResultsLength > 0,
				closeActiveModal: i.closeActiveModal,
				selectChangedFile: i.selectChangedFile,
				moveChangedFileSelection: i.moveChangedFileSelection,
			},
			filterModal: { closeActiveModal: i.closeActiveModal, applySelected: i.applySelectedFilter, moveSelection: i.moveFilterSelection },
			submitReviewModal: {
				submitReviewModal: i.submitReviewModal,
				closeActiveModal: i.closeActiveModal,
				setSubmitReviewModal: i.setSubmitReviewModal,
				confirmSubmitReview: i.confirmSubmitReview,
				editSubmitReview: i.editSubmitReview,
				moveSubmitReviewActionSelection: i.moveSubmitReviewActionSelection,
			},
			pendingReviewModal: {
				close: i.closeActiveModal,
				move: i.movePendingReviewSelection,
				jump: i.jumpPendingReviewComment,
				edit: i.editPendingReviewComment,
				deleteComment: i.deletePendingReviewComment,
				submit: i.submitPendingReviewFromPane,
				discard: i.discardPendingReviewFromPane,
			},
			labelModal: { closeActiveModal: i.closeActiveModal, toggleLabelAtIndex: i.toggleLabelAtIndex, moveLabelSelection: i.moveLabelSelection },
			themeModal: {
				themeModal: i.themeModal,
				closeThemeModal: i.closeThemeModal,
				updateThemeQuery: i.updateThemeQuery,
				toggleThemeMode: i.toggleThemeMode,
				toggleThemeTone: i.toggleThemeTone,
				moveThemeSelection: i.moveThemeSelection,
			},
			openRepositoryModal: { closeActiveModal: i.closeActiveModal, openRepositoryFromInput: i.openRepositoryFromInput },
			commentModal: {
				closeActiveModal: i.closeActiveModal,
				toggleCommentSubmitMode: i.toggleCommentSubmitMode,
				toggleCommentContentKind: i.toggleCommentContentKind,
			},
			deleteCommentModal: { closeActiveModal: i.closeActiveModal, confirmDeleteComment: i.confirmDeleteComment },
			commandPalette: {
				closeActiveModal: i.closeActiveModal,
				selectedCommand: i.commandPaletteSelectedCommand,
				runCommandPaletteCommand: i.runCommandPaletteCommand,
				moveCommandPaletteSelection: i.moveCommandPaletteSelection,
			},
			releaseEditorModal: {
				state: i.resourceEditorModalActive
					? {
							mode: "create",
							repository: i.resourceEditorModal.repository,
							originalTagName: null,
							tagName: "",
							name: "",
							body: "",
							targetCommitish: "",
							isDraft: false,
							isPrerelease: false,
							focus: "name",
							running: i.resourceEditorModal.running,
							error: i.resourceEditorModal.error,
						}
					: i.releaseEditorModal,
				close: i.closeActiveModal,
				moveFocus: i.resourceEditorModalActive ? i.moveResourceEditorFocus : i.moveReleaseEditorFocus,
				toggleFocused: i.resourceEditorModalActive ? () => i.cycleResourceEditorChoice(1) : i.toggleReleaseEditorFocused,
				submit: i.resourceEditorModalActive ? i.submitResourceEditor : i.submitReleaseEditor,
			},
			deleteReleaseModal: {
				running: i.deleteResourceModalActive ? i.deleteResourceModalRunning : i.deleteReleaseModalRunning,
				close: i.closeActiveModal,
				confirm: i.deleteResourceModalActive ? i.confirmDeleteResource : i.confirmDeleteRelease,
			},
			actionsModal: {
				mode: i.runActionModalActive ? "runAction" : i.workflowDispatchModalActive ? "dispatch" : "artifact",
				running: i.runActionModalActive ? i.runActionModal.running : i.workflowDispatchModalActive ? i.workflowDispatchModal.running : i.artifactDownloadModal.running,
				close: i.closeActiveModal,
				confirm: i.runActionModalActive ? i.confirmRunAction : i.workflowDispatchModalActive ? i.confirmWorkflowDispatch : i.confirmArtifactDownload,
				moveDispatchFocus: i.moveWorkflowDispatchFocus,
				cycleDispatchValue: i.cycleWorkflowDispatchValue,
				toggleArtifactFocus: i.toggleArtifactFocus,
				moveArtifactSelection: i.moveArtifactSelection,
			},
			filterModeCtx: {
				cancelFilter: () => {
					i.setFilterDraft(i.filterQuery)
					i.setFilterMode(false)
				},
				commitFilter: () => {
					i.setFilterQuery(i.filterDraft)
					i.setFilterMode(false)
				},
			},
			diff: {
				halfPage: i.halfPage,
				diffCommentRangeActive: i.diffCommentRangeActive,
				setDiffCommentRangeStartIndex: i.setDiffCommentRangeStartIndex,
				runCommandById: i.runCommandById,
				openSelectedDiffComment: i.openSelectedDiffComment,
				moveDiffCommentAnchor: i.moveDiffCommentAnchor,
				moveDiffCommentToBoundary: i.moveDiffCommentToBoundary,
				alignSelectedDiffCommentAnchor: i.alignSelectedDiffCommentAnchor,
				selectDiffCommentSide: i.selectDiffCommentSide,
			},
			runs: i.runsViewCtx,
			detail: {
				halfPage: i.halfPage,
				activeSurface: i.activeWorkspaceSurface,
				scrollDetailFullViewBy: i.scrollDetailFullViewBy,
				scrollDetailFullViewTo: i.scrollDetailFullViewTo,
				runCommandById: i.runCommandById,
			},
			commentsView: {
				halfPage: i.halfPage,
				visibleCount: i.commentsRowCount,
				canEditSelected: canEditComment(i.selectedOrderedComment, i.username),
				moveCommentsSelection: i.moveCommentsSelection,
				setCommentsSelection: i.setCommentsSelection,
				closeCommentsView: i.closeCommentsView,
				openSelectedCommentInBrowser: i.openSelectedCommentInBrowser,
				refreshSelectedComments: i.refreshSelectedComments,
				confirmCommentSelection: i.confirmCommentSelection,
				runCommandById: i.runCommandById,
			},
			listNav: {
				halfPage: i.halfPage,
				visibleCount:
					i.activeWorkspaceSurface === "repos"
						? i.repositoryItemsLength
						: i.activeWorkspaceSurface === "pullRequests"
							? i.visiblePullRequestsLength
							: i.activeWorkspaceSurface === "releases"
								? i.releasesLength
								: i.activeWorkspaceSurface === "branches" ||
									  i.activeWorkspaceSurface === "milestones" ||
									  i.activeWorkspaceSurface === "environments" ||
									  i.activeWorkspaceSurface === "runners"
									? i.resourceItemsLength
									: i.activeWorkspaceSurface === "changes"
										? i.changeItemsLength
										: i.activeWorkspaceSurface === "notifications"
											? i.notificationItemsLength
											: i.issuesLength,
				hasFilter: i.filterQuery.length > 0,
				activeSurface: i.activeWorkspaceSurface,
				surfaces: i.workspaceTabSurfaces,
				canGoUpWorkspace: i.selectedRepository !== null,
				canScrollDetailPreview:
					(i.activeWorkspaceSurface === "pullRequests" && i.selectedPullRequest !== null) ||
					(i.activeWorkspaceSurface === "issues" && i.selectedIssue !== null) ||
					(i.activeWorkspaceSurface === "releases" && i.selectedRelease !== null) ||
					((i.activeWorkspaceSurface === "branches" ||
						i.activeWorkspaceSurface === "milestones" ||
						i.activeWorkspaceSurface === "environments" ||
						i.activeWorkspaceSurface === "runners") &&
						i.selectedResourceItem !== null) ||
					(i.activeWorkspaceSurface === "notifications" && i.selectedNotification !== null) ||
					(i.activeWorkspaceSurface === "repos" && !i.isWideLayout && i.selectedRepositoryItem !== null),
				runCommandById: i.runCommandById,
				openSelection: () => {
					if (i.activeWorkspaceSurface === "repos") i.openSelectedRepository()
					else if (i.activeWorkspaceSurface === "pullRequests" && i.loadMoreRowSelected) i.loadMorePullRequests()
					else if (i.activeWorkspaceSurface === "issues" && i.loadMoreIssueRowSelected) i.loadMoreIssues()
					else i.runCommandById("detail.open")
				},
				openRepositoryPicker: i.openRepositoryPicker,
				toggleFavoriteRepository: i.toggleFavoriteRepository,
				removeSelectedRepository: i.removeSelectedRepository,
				openFilterModal: i.openFilterModal,
				goUpWorkspace: () => {
					i.goUpWorkspaceScope()
				},
				switchQueueMode: i.switchQueueMode,
				switchWorkspaceSurface: i.switchWorkspaceSurface,
				cycleWorkspaceSurface: i.cycleWorkspaceSurface,
				scrollDetailPreviewBy: i.scrollDetailPreviewBy,
				scrollDetailPreviewTo: i.scrollDetailPreviewTo,
				stepSelected: i.stepSelected,
				stepSelectedUp: i.stepSelectedUp,
				stepSelectedDown: i.stepSelectedDown,
				stepSelectedUpWrap: i.stepSelectedUpWrap,
				stepSelectedDownWithLoadMore: i.stepSelectedDownWithLoadMore,
				moveSelectedToPreviousGroup: i.moveSelectedToPreviousGroup,
				moveSelectedToNextGroup: i.moveSelectedToNextGroup,
				setSelected: (index) =>
					i.activeWorkspaceSurface === "repos"
						? i.setSelectedRepositoryIndex(index)
						: i.activeWorkspaceSurface === "issues"
							? i.setSelectedIssueIndex(index)
							: i.activeWorkspaceSurface === "releases"
								? i.setSelectedReleaseIndex(index)
								: i.activeWorkspaceSurface === "notifications"
									? i.setSelectedNotificationIndex(index)
									: i.activeWorkspaceSurface === "branches" ||
										  i.activeWorkspaceSurface === "milestones" ||
										  i.activeWorkspaceSurface === "environments" ||
										  i.activeWorkspaceSurface === "runners"
										? i.setSelectedResourceIndex(index)
										: i.activeWorkspaceSurface === "changes"
											? i.setSelectedChangeIndex(index)
											: i.setSelectedIndex(index),
			},
			openCommandPalette: () => i.runCommandById("command.open"),
			handleQuitOrClose: i.handleQuitOrClose,
		},
		textInput: {
			commandPaletteActive: i.commandPaletteActive,
			openRepositoryModalActive: i.openRepositoryModalActive,
			themeModalActive: i.themeModalActive,
			commentModalActive: i.commentModalActive,
			submitReviewModalActive: i.submitReviewModalActive,
			changedFilesModalActive: i.changedFilesModalActive,
			bulkEditorModalActive: i.bulkEditorModalActive,
			workflowDispatchModalActive: i.workflowDispatchModalActive,
			artifactDownloadModalActive: i.artifactDownloadModalActive,
			resourceEditorModalActive: i.resourceEditorModalActive,
			deleteResourceModalActive: i.deleteResourceModalActive,
			labelModalActive: i.labelModalActive,
			filterMode: i.filterMode,
			detailFullView: i.detailFullView,
			diffFullView: i.diffFullView,
			commentsViewActive: i.commentsViewActive,
			releaseEditorModalActive: i.releaseEditorModalActive,
			itemEditorModalActive: i.itemEditorModalActive,
			metadataSelectorModalActive: i.metadataSelectorModalActive,
			themeModal: i.themeModal,
			submitReviewModal: i.submitReviewModal,
			releaseEditorModal: i.releaseEditorModal,
			itemEditorModal: i.itemEditorModal,
			metadataSelectorModal: i.metadataSelectorModal,
			bulkEditorModal: i.bulkEditorModal,
			workflowDispatchModal: i.workflowDispatchModal,
			artifactDownloadModal: i.artifactDownloadModal,
			resourceEditorModal: i.resourceEditorModal,
			workspaceTabSurfaces: i.workspaceTabSurfaces,
			activeWorkspaceSurface: i.activeWorkspaceSurface,
			switchWorkspaceSurface: i.switchWorkspaceSurface,
			setCommandPalette: i.setCommandPalette,
			setOpenRepositoryModal: i.setOpenRepositoryModal,
			setChangedFilesModal: i.setChangedFilesModal,
			setLabelModal: i.setLabelModal,
			setReleaseEditorModal: i.setReleaseEditorModal,
			setItemEditorModal: i.setItemEditorModal,
			setMetadataSelectorModal: i.setMetadataSelectorModal,
			setBulkEditorModal: i.setBulkEditorModal,
			setWorkflowDispatchModal: i.setWorkflowDispatchModal,
			setArtifactDownloadModal: i.setArtifactDownloadModal,
			setResourceEditorModal: i.setResourceEditorModal,
			closeResourceModal: i.closeActiveModal,
			setFilterDraft: i.setFilterDraft,
			editThemeQuery: i.editThemeQuery,
			editSubmitReview: i.editSubmitReview,
		},
	})
}
