// Pure modal sizing math. Each modal gets a rectangle centered in the
// terminal, sized between min/max bounds and clamped to fit the
// terminal. Splitting this out keeps App.tsx free of layout numbers
// and lets the rendering be tested without OpenTUI.

export interface ModalRect {
	readonly width: number
	readonly height: number
	readonly left: number
	readonly top: number
}

const centeredOffset = (outer: number, inner: number) => Math.floor((outer - inner) / 2)

const sizedRect =
	(contentWidth: number, terminalHeight: number) =>
	(minW: number, maxW: number, padX: number, maxH: number): ModalRect => {
		const width = Math.max(1, Math.min(contentWidth, maxW, Math.max(minW, contentWidth - padX)))
		const height = Math.max(1, Math.min(maxH, terminalHeight))
		return { width, height, left: centeredOffset(contentWidth, width), top: centeredOffset(terminalHeight, height) }
	}

export interface ModalLayoutInput {
	readonly contentWidth: number
	readonly terminalHeight: number
	readonly longestLabelName: number
	readonly longestDiffFileName: number
	readonly changedFilesModalActive: boolean
}

export interface ModalLayouts {
	readonly Label: ModalRect
	readonly ChangedFiles: ModalRect
	readonly BulkEditor: ModalRect
	readonly Close: ModalRect
	readonly ItemEditor: ModalRect
	readonly MetadataSelector: ModalRect
	readonly DeleteComment: ModalRect
	readonly PullRequestState: ModalRect
	readonly Comment: ModalRect
	readonly CommentThread: ModalRect
	readonly Filter: ModalRect
	readonly SubmitReview: ModalRect
	readonly PendingReview: ModalRect
	readonly RunAction: ModalRect
	readonly WorkflowDispatch: ModalRect
	readonly ArtifactDownload: ModalRect
	readonly Merge: ModalRect
	readonly Theme: ModalRect
	readonly OpenRepository: ModalRect
	readonly CommandPalette: ModalRect
	readonly ReleaseEditor: ModalRect
	readonly DeleteRelease: ModalRect
	readonly ResourceEditor: ModalRect
	readonly DeleteResource: ModalRect
}

export const computeModalLayouts = ({ contentWidth, terminalHeight, longestLabelName, longestDiffFileName, changedFilesModalActive }: ModalLayoutInput): ModalLayouts => {
	const sized = sizedRect(contentWidth, terminalHeight)
	const labelWidth = Math.max(1, Math.min(Math.max(42, longestLabelName + 16), 56, contentWidth))
	const labelHeight = Math.max(1, Math.min(20, terminalHeight))
	const label: ModalRect = {
		width: labelWidth,
		height: labelHeight,
		left: centeredOffset(contentWidth, labelWidth),
		top: centeredOffset(terminalHeight, labelHeight),
	}
	const changedFilesWidth = Math.max(1, Math.min(changedFilesModalActive ? Math.min(Math.max(46, longestDiffFileName + 16), 88) : 46, contentWidth))
	const changedFilesHeight = Math.max(1, Math.min(22, terminalHeight))
	const changedFiles: ModalRect = {
		width: changedFilesWidth,
		height: changedFilesHeight,
		left: centeredOffset(contentWidth, changedFilesWidth),
		top: centeredOffset(terminalHeight, changedFilesHeight),
	}
	return {
		Label: label,
		ChangedFiles: changedFiles,
		BulkEditor: sized(54, 82, 8, 20),
		Close: sized(46, 68, 12, 12),
		ItemEditor: sized(56, 86, 8, 18),
		MetadataSelector: sized(48, 72, 10, 20),
		DeleteComment: sized(46, 68, 12, 12),
		PullRequestState: sized(46, 68, 12, 9),
		Comment: sized(46, 76, 8, 16),
		CommentThread: sized(50, 86, 8, 22),
		Filter: sized(58, 76, 10, 12),
		SubmitReview: sized(54, 84, 8, 18),
		PendingReview: sized(58, 92, 6, 22),
		RunAction: sized(48, 72, 10, 12),
		WorkflowDispatch: sized(58, 88, 8, 22),
		ArtifactDownload: sized(58, 88, 8, 20),
		Merge: sized(46, 68, 14, 20),
		Theme: sized(38, 58, 12, 16),
		OpenRepository: sized(46, 76, 8, 8),
		CommandPalette: sized(50, 88, 8, 24),
		ReleaseEditor: sized(54, 82, 8, 15),
		DeleteRelease: sized(46, 68, 12, 12),
		ResourceEditor: sized(54, 82, 8, 15),
		DeleteResource: sized(46, 68, 12, 12),
	}
}
