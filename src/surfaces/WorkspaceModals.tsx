import type { AppCommand } from "../commands.js"
import type { PendingReview, PullRequestLabel, PullRequestReviewComment } from "../domain.js"
import { CommandPalette } from "../ui/CommandPalette.js"
import {
	ChangedFilesModal,
	BulkEditorModal,
	type ChangedFileSearchResult,
	CloseModal,
	ItemEditorModal,
	MetadataSelectorModal,
	CommentModal,
	CommentThreadModal,
	DeleteCommentModal,
	FilterModal,
	LabelModal,
	MergeModal,
	OpenRepositoryModal,
	PullRequestStateModal,
	ReleaseEditorModal,
	DeleteReleaseModal,
	ResourceEditorModal,
	DeleteResourceModal,
	SubmitReviewModal,
	PendingReviewModal,
	RunActionModal,
	WorkflowDispatchModal,
	ArtifactDownloadModal,
	ThemeModal,
} from "../ui/modals.js"
import { Modal, type ModalTag, type ResourceEditorModalState } from "../ui/modals/types.js"

export interface ModalLayout {
	readonly width: number
	readonly height: number
	readonly left: number
	readonly top: number
}

// Tag-keyed layout map. WorkspaceModals only renders the active modal, but App
// computes layouts up-front so they stay stable across renders.
export type ModalLayouts = { readonly [Tag in Exclude<ModalTag, "None">]: ModalLayout }

export interface WorkspaceModalsProps {
	readonly activeModal: Modal
	readonly layouts: ModalLayouts
	readonly loadingIndicator: string
	readonly selectedItemLabels: readonly PullRequestLabel[]
	readonly commentAnchorLabel: string
	readonly selectedDiffCommentThread: readonly PullRequestReviewComment[]
	readonly pendingReviewCount: number
	readonly pendingReview: PendingReview | null
	readonly changedFileResults: readonly ChangedFileSearchResult[]
	readonly readyDiffFileCount: number
	readonly commandPaletteCommands: readonly AppCommand[]
	readonly selectedCommandIndex: number
	readonly onSelectCommandIndex: (index: number) => void
	readonly onRunCommand: (command: AppCommand) => void
	readonly onCommentChange: (body: string, cursor: number) => void
	readonly onCommentSubmit: () => void
	readonly onSelectMetadataOption: (index: number) => void
	readonly onToggleMetadataOption: (index?: number) => void
	// When the docked diff-file panel is rendering the picker inline, the
	// modal must stand down so both presentations don't fight for the screen.
	readonly suppressChangedFilesModal: boolean
}

const layoutToProps = (layout: ModalLayout) => ({
	modalWidth: layout.width,
	modalHeight: layout.height,
	offsetLeft: layout.left,
	offsetTop: layout.top,
})

export const WorkspaceModals = (props: WorkspaceModalsProps) =>
	Modal.$match(props.activeModal, {
		None: () => null,
		Label: (state) => <LabelModal state={state} currentLabels={props.selectedItemLabels} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.Label)} />,
		Close: (state) => <CloseModal state={state} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.Close)} />,
		ItemEditor: (state) => <ItemEditorModal state={state} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.ItemEditor)} />,
		MetadataSelector: (state) => (
			<MetadataSelectorModal
				state={state}
				loadingIndicator={props.loadingIndicator}
				onSelect={props.onSelectMetadataOption}
				onToggle={props.onToggleMetadataOption}
				{...layoutToProps(props.layouts.MetadataSelector)}
			/>
		),
		PullRequestState: (state) => <PullRequestStateModal state={state} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.PullRequestState)} />,
		Merge: (state) => <MergeModal state={state} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.Merge)} />,
		Comment: (state) => (
			<CommentModal
				state={state}
				anchorLabel={props.commentAnchorLabel}
				onChange={props.onCommentChange}
				onSubmit={props.onCommentSubmit}
				{...layoutToProps(props.layouts.Comment)}
			/>
		),
		DeleteComment: (state) => <DeleteCommentModal state={state} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.DeleteComment)} />,
		CommentThread: (state) => (
			<CommentThreadModal state={state} anchorLabel={props.commentAnchorLabel} comments={props.selectedDiffCommentThread} {...layoutToProps(props.layouts.CommentThread)} />
		),
		ChangedFiles: (state) =>
			props.suppressChangedFilesModal ? null : (
				<ChangedFilesModal state={state} results={props.changedFileResults} totalCount={props.readyDiffFileCount} {...layoutToProps(props.layouts.ChangedFiles)} />
			),
		BulkEditor: (state) => <BulkEditorModal state={state} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.BulkEditor)} />,
		Filter: (state) => <FilterModal state={state} {...layoutToProps(props.layouts.Filter)} />,
		SubmitReview: (state) => <SubmitReviewModal state={state} pendingReviewCount={props.pendingReviewCount} {...layoutToProps(props.layouts.SubmitReview)} />,
		PendingReview: (state) => <PendingReviewModal state={state} review={props.pendingReview} {...layoutToProps(props.layouts.PendingReview)} />,
		RunAction: (state) => <RunActionModal state={state} {...layoutToProps(props.layouts.RunAction)} />,
		WorkflowDispatch: (state) => <WorkflowDispatchModal state={state} {...layoutToProps(props.layouts.WorkflowDispatch)} />,
		ArtifactDownload: (state) => <ArtifactDownloadModal state={state} {...layoutToProps(props.layouts.ArtifactDownload)} />,
		Theme: (state) => <ThemeModal state={state} {...layoutToProps(props.layouts.Theme)} />,
		OpenRepository: (state) => <OpenRepositoryModal state={state} {...layoutToProps(props.layouts.OpenRepository)} />,
		ReleaseEditor: (state) => <ReleaseEditorModal state={state} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.ReleaseEditor)} />,
		DeleteRelease: (state) => <DeleteReleaseModal state={state} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.DeleteRelease)} />,
		ResourceEditor: (state) => (
			<ResourceEditorModal state={state as unknown as ResourceEditorModalState} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.ResourceEditor)} />
		),
		DeleteResource: (state) => <DeleteResourceModal state={state} loadingIndicator={props.loadingIndicator} {...layoutToProps(props.layouts.DeleteResource)} />,
		CommandPalette: (state) => (
			<CommandPalette
				commands={props.commandPaletteCommands}
				query={state.query}
				selectedIndex={props.selectedCommandIndex}
				onSelectCommandIndex={props.onSelectCommandIndex}
				onRunCommand={props.onRunCommand}
				{...layoutToProps(props.layouts.CommandPalette)}
			/>
		),
	})
