import { context } from "@ghui/keymap"
import { actionsModalKeymap, type ActionsModalCtx } from "./actionsModal.ts"
import { changedFilesModalKeymap, type ChangedFilesModalCtx } from "./changedFilesModal.ts"
import { bulkEditorModalKeymap, type BulkEditorModalCtx } from "./bulkEditorModal.ts"
import { closeModalKeymap, type CloseModalCtx } from "./closeModal.ts"
import { commandPaletteKeymap, type CommandPaletteCtx } from "./commandPalette.ts"
import { commentModalKeymap, type CommentModalCtx } from "./commentModal.ts"
import { commentsViewKeymap, type CommentsViewCtx } from "./commentsView.ts"
import { commentThreadModalKeymap, type CommentThreadModalCtx } from "./commentThreadModal.ts"
import { deleteCommentModalKeymap, type DeleteCommentModalCtx } from "./deleteCommentModal.ts"
import { detailViewKeymap, type DetailViewCtx } from "./detailView.ts"
import { deleteReleaseModalKeymap, type DeleteReleaseModalCtx } from "./deleteReleaseModal.ts"
import { diffViewKeymap, type DiffViewCtx } from "./diffView.ts"
import { filterModalKeymap, type FilterModalCtx } from "./filterModal.ts"
import { filterModeKeymap, type FilterModeCtx } from "./filterMode.ts"
import { itemEditorModalKeymap, type ItemEditorModalCtx } from "./itemEditorModal.ts"
import { labelModalKeymap, type LabelModalCtx } from "./labelModal.ts"
import { listNavKeymap, type ListNavCtx } from "./listNav.ts"
import { mergeModalKeymap, type MergeModalCtx } from "./mergeModal.ts"
import { metadataSelectorModalKeymap, type MetadataSelectorModalCtx } from "./metadataSelectorModal.ts"
import { openRepositoryModalKeymap, type OpenRepositoryModalCtx } from "./openRepositoryModal.ts"
import { pullRequestStateModalKeymap, type PullRequestStateModalCtx } from "./pullRequestStateModal.ts"
import { releaseEditorModalKeymap, type ReleaseEditorModalCtx } from "./releaseEditorModal.ts"
import { runsViewKeymap, type RunsViewCtx } from "./runsView.ts"
import { submitReviewModalKeymap, type SubmitReviewModalCtx } from "./submitReviewModal.ts"
import { pendingReviewModalKeymap, type PendingReviewModalCtx } from "./pendingReviewModal.ts"
import { themeModalKeymap, type ThemeModalCtx } from "./themeModal.ts"

export interface AppCtx {
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
	readonly actionsModalActive: boolean
	readonly filterMode: boolean
	readonly diffFullView: boolean
	readonly runsFullView: boolean
	readonly detailFullView: boolean
	readonly commentsViewActive: boolean

	// True whenever a modal/mode swallows raw text input (so q-quit, etc. are
	// disabled inside text-editing contexts).
	readonly textInputActive: boolean

	// Per-layer narrow contexts
	readonly closeModal: CloseModalCtx
	readonly itemEditorModal: ItemEditorModalCtx
	readonly metadataSelectorModal: MetadataSelectorModalCtx
	readonly pullRequestStateModal: PullRequestStateModalCtx
	readonly mergeModal: MergeModalCtx
	readonly commentThreadModal: CommentThreadModalCtx
	readonly changedFilesModal: ChangedFilesModalCtx
	readonly bulkEditorModal: BulkEditorModalCtx
	readonly filterModal: FilterModalCtx
	readonly submitReviewModal: SubmitReviewModalCtx
	readonly pendingReviewModal: PendingReviewModalCtx
	readonly labelModal: LabelModalCtx
	readonly themeModal: ThemeModalCtx
	readonly openRepositoryModal: OpenRepositoryModalCtx
	readonly commentModal: CommentModalCtx
	readonly deleteCommentModal: DeleteCommentModalCtx
	readonly commandPalette: CommandPaletteCtx
	readonly releaseEditorModal: ReleaseEditorModalCtx
	readonly deleteReleaseModal: DeleteReleaseModalCtx
	readonly actionsModal: ActionsModalCtx
	readonly filterModeCtx: FilterModeCtx
	readonly diff: DiffViewCtx
	readonly runs: RunsViewCtx
	readonly detail: DetailViewCtx
	readonly commentsView: CommentsViewCtx
	readonly listNav: ListNavCtx

	// Always-on / app-level
	readonly openCommandPalette: () => void
	readonly handleQuitOrClose: () => void
}

const App = context<AppCtx>()

const modalActive = (a: AppCtx): boolean =>
	a.closeModalActive ||
	a.itemEditorModalActive ||
	a.metadataSelectorModalActive ||
	a.pullRequestStateModalActive ||
	a.mergeModalActive ||
	a.commentThreadModalActive ||
	a.changedFilesModalActive ||
	a.bulkEditorModalActive ||
	a.filterModalActive ||
	a.submitReviewModalActive ||
	a.pendingReviewModalActive ||
	a.labelModalActive ||
	a.themeModalActive ||
	a.openRepositoryModalActive ||
	a.commentModalActive ||
	a.deleteCommentModalActive ||
	a.commandPaletteActive ||
	a.releaseEditorModalActive ||
	a.deleteReleaseModalActive ||
	a.actionsModalActive

const inListMode = (a: AppCtx): boolean => !modalActive(a) && !a.filterMode && !a.diffFullView && !a.runsFullView && !a.detailFullView && !a.commentsViewActive

export const appKeymap = App(
	// Always-on: command palette opener
	{ id: "command.open", title: "Open command palette", keys: ["ctrl+p", "meta+k"], run: (s) => s.openCommandPalette() },
	{ id: "command.open-help", title: "Open command palette", keys: ["?"], when: (s) => !s.textInputActive, run: (s) => s.openCommandPalette() },

	// Quit / close-active-modal — gated to "not editing text"
	{
		id: "app.quit-or-close",
		title: "Quit / close modal",
		keys: ["ctrl+c"],
		run: (s) => s.handleQuitOrClose(),
	},
	{
		id: "app.quit-or-close-q",
		title: "Quit / close modal",
		keys: ["q"],
		when: (s) => !s.textInputActive,
		run: (s) => s.handleQuitOrClose(),
	},
	// Modal layers
	closeModalKeymap.scope((a) => a.closeModalActive && a.closeModal),
	itemEditorModalKeymap.scope((a) => a.itemEditorModalActive && a.itemEditorModal),
	metadataSelectorModalKeymap.scope((a) => a.metadataSelectorModalActive && a.metadataSelectorModal),
	pullRequestStateModalKeymap.scope((a) => a.pullRequestStateModalActive && a.pullRequestStateModal),
	mergeModalKeymap.scope((a) => a.mergeModalActive && a.mergeModal),
	commentThreadModalKeymap.scope((a) => a.commentThreadModalActive && a.commentThreadModal),
	changedFilesModalKeymap.scope((a) => a.changedFilesModalActive && a.changedFilesModal),
	bulkEditorModalKeymap.scope((a) => a.bulkEditorModalActive && a.bulkEditorModal),
	filterModalKeymap.scope((a) => a.filterModalActive && a.filterModal),
	submitReviewModalKeymap.scope((a) => a.submitReviewModalActive && a.submitReviewModal),
	pendingReviewModalKeymap.scope((a) => a.pendingReviewModalActive && a.pendingReviewModal),
	labelModalKeymap.scope((a) => a.labelModalActive && a.labelModal),
	themeModalKeymap.scope((a) => a.themeModalActive && a.themeModal),
	openRepositoryModalKeymap.scope((a) => a.openRepositoryModalActive && a.openRepositoryModal),
	commentModalKeymap.scope((a) => a.commentModalActive && a.commentModal),
	deleteCommentModalKeymap.scope((a) => a.deleteCommentModalActive && a.deleteCommentModal),
	commandPaletteKeymap.scope((a) => a.commandPaletteActive && a.commandPalette),
	releaseEditorModalKeymap.scope((a) => a.releaseEditorModalActive && a.releaseEditorModal),
	deleteReleaseModalKeymap.scope((a) => a.deleteReleaseModalActive && a.deleteReleaseModal),
	actionsModalKeymap.scope((a) => a.actionsModalActive && a.actionsModal),
	filterModeKeymap.scope((a) => a.filterMode && a.filterModeCtx),

	// Full-view layers (only when no modal is on top)
	diffViewKeymap.scope((a) => a.diffFullView && !modalActive(a) && a.diff),
	runsViewKeymap.scope((a) => a.runsFullView && !modalActive(a) && !a.filterMode && a.runs),
	detailViewKeymap.scope((a) => a.detailFullView && !modalActive(a) && a.detail),
	commentsViewKeymap.scope((a) => a.commentsViewActive && !modalActive(a) && a.commentsView),

	// PR list nav
	listNavKeymap.scope((a) => inListMode(a) && a.listNav),
)
