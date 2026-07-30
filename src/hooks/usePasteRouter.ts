import type {
	CommandPaletteState,
	FilterModalState,
	OpenRepositoryModalState,
	ThemeModalState,
	ChangedFilesModalState,
	ArtifactDownloadModalState,
	BulkEditorModalState,
	LabelModalState,
	SubmitReviewModalState,
	ReleaseEditorModalState,
	ItemEditorModalState,
	MetadataSelectorModalState,
	WorkflowDispatchModalState,
} from "../ui/modals/types.js"
import { insertText, type CommentEditorValue } from "../ui/commentEditor.js"
import { singleLineText } from "../ui/singleLineInput.js"
import { usePasteHandler } from "../ui/usePasteHandler.js"

export interface UsePasteRouterInput {
	readonly renderer: { readonly keyInput: unknown }
	readonly commandPaletteActive: boolean
	readonly openRepositoryModalActive: boolean
	readonly themeModalActive: boolean
	readonly themeModal: ThemeModalState
	readonly commentModalActive: boolean
	readonly submitReviewModalActive: boolean
	readonly labelModalActive: boolean
	readonly changedFilesModalActive: boolean
	readonly filterMode: boolean
	readonly releaseEditorModalActive: boolean
	readonly itemEditorModalActive: boolean
	readonly metadataSelectorModalActive: boolean
	readonly bulkEditorModalActive: boolean
	readonly workflowDispatchModalActive: boolean
	readonly artifactDownloadModalActive: boolean
	readonly releaseEditorModal: ReleaseEditorModalState
	readonly itemEditorModal: ItemEditorModalState
	readonly metadataSelectorModal: MetadataSelectorModalState
	readonly bulkEditorModal: BulkEditorModalState
	readonly workflowDispatchModal: WorkflowDispatchModalState
	readonly artifactDownloadModal: ArtifactDownloadModalState
	readonly setCommandPalette: (next: (prev: CommandPaletteState) => CommandPaletteState) => void
	readonly setOpenRepositoryModal: (next: OpenRepositoryModalState | ((prev: OpenRepositoryModalState) => OpenRepositoryModalState)) => void
	readonly editThemeQuery: (transform: (query: string) => string) => void
	readonly setSubmitReviewModal: (next: (prev: SubmitReviewModalState) => SubmitReviewModalState) => void
	readonly setLabelModal: (next: (prev: LabelModalState) => LabelModalState) => void
	readonly setChangedFilesModal: (next: (prev: ChangedFilesModalState) => ChangedFilesModalState) => void
	readonly setFilterDraft: (next: (prev: string) => string) => void
	readonly setReleaseEditorModal: (next: (prev: ReleaseEditorModalState) => ReleaseEditorModalState) => void
	readonly setItemEditorModal: (next: (prev: ItemEditorModalState) => ItemEditorModalState) => void
	readonly setMetadataSelectorModal: (next: (prev: MetadataSelectorModalState) => MetadataSelectorModalState) => void
	readonly setBulkEditorModal: (next: (prev: BulkEditorModalState) => BulkEditorModalState) => void
	readonly setWorkflowDispatchModal: (next: (prev: WorkflowDispatchModalState) => WorkflowDispatchModalState) => void
	readonly setArtifactDownloadModal: (next: (prev: ArtifactDownloadModalState) => ArtifactDownloadModalState) => void
}

/**
 * Routes the renderer's paste event to whichever input the user is
 * currently in. Each modal/input owns its own paste handler; this
 * hook is the dispatcher that picks the right one based on which
 * modal is open, returning `false` only when paste isn't relevant
 * (e.g. the in-modal comment editor handles its own paste).
 */
export const usePasteRouter = ({
	renderer,
	commandPaletteActive,
	openRepositoryModalActive,
	themeModalActive,
	themeModal,
	commentModalActive,
	submitReviewModalActive,
	labelModalActive,
	changedFilesModalActive,
	filterMode,
	releaseEditorModalActive,
	itemEditorModalActive,
	metadataSelectorModalActive,
	bulkEditorModalActive,
	workflowDispatchModalActive,
	artifactDownloadModalActive,
	releaseEditorModal,
	itemEditorModal,
	metadataSelectorModal,
	bulkEditorModal,
	workflowDispatchModal,
	artifactDownloadModal,
	setCommandPalette,
	setOpenRepositoryModal,
	editThemeQuery,
	setSubmitReviewModal,
	setLabelModal,
	setChangedFilesModal,
	setFilterDraft,
	setReleaseEditorModal,
	setItemEditorModal,
	setMetadataSelectorModal,
	setBulkEditorModal,
	setWorkflowDispatchModal,
	setArtifactDownloadModal,
}: UsePasteRouterInput): void => {
	const insertPastedText = (text: string): boolean => {
		if (text.length === 0) return false
		if (commandPaletteActive) {
			setCommandPalette((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (openRepositoryModalActive) {
			setOpenRepositoryModal((current) => ({ ...current, query: current.query + singleLineText(text), error: null }))
			return true
		}
		if (workflowDispatchModalActive && !workflowDispatchModal.running && !workflowDispatchModal.loadingInputs) {
			const pasted = singleLineText(text)
			if (workflowDispatchModal.focusIndex === 1) {
				setWorkflowDispatchModal((current) => ({ ...current, ref: current.ref + pasted, error: null }))
				return true
			}
			const field = workflowDispatchModal.inputs[workflowDispatchModal.focusIndex - 2]
			if (!field || field.type === "boolean" || field.type === "choice") return false
			setWorkflowDispatchModal((current) => ({
				...current,
				values: { ...current.values, [field.name]: String(current.values[field.name] ?? field.defaultValue ?? "") + pasted },
				error: null,
			}))
			return true
		}
		if (artifactDownloadModalActive && !artifactDownloadModal.running && artifactDownloadModal.focus === "destination") {
			setArtifactDownloadModal((current) => ({ ...current, destination: current.destination + singleLineText(text), error: null }))
			return true
		}
		if (itemEditorModalActive && !itemEditorModal.running) {
			if (itemEditorModal.focus === "draft") return false
			setItemEditorModal((current) => {
				const field = current.focus as Exclude<ItemEditorModalState["focus"], "draft">
				const previous = current[field]
				if (typeof previous !== "string") return current
				const pasted = field === "body" ? text.replace(/\r\n?/g, "\n") : singleLineText(text)
				return { ...current, [field]: previous + pasted, error: null }
			})
			return true
		}
		if (metadataSelectorModalActive && !metadataSelectorModal.running) {
			setMetadataSelectorModal((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (bulkEditorModalActive && !bulkEditorModal.running && bulkEditorModal.focus === "value") {
			setBulkEditorModal((current) => ({ ...current, value: current.value + singleLineText(text), error: null }))
			return true
		}
		if (releaseEditorModalActive && !releaseEditorModal.running) {
			if (releaseEditorModal.focus === "isDraft" || releaseEditorModal.focus === "isPrerelease") return false
			setReleaseEditorModal((current) => {
				const field = current.focus as "tagName" | "name" | "body" | "targetCommitish"
				const pasted = field === "body" ? text.replace(/\r\n?/g, "\n") : singleLineText(text)
				return { ...current, [field]: current[field] + pasted, error: null }
			})
			return true
		}
		if (themeModalActive && themeModal.filterMode) {
			editThemeQuery((query) => query + singleLineText(text))
			return true
		}
		if (commentModalActive) return false
		if (submitReviewModalActive) {
			setSubmitReviewModal((current) => {
				const next = insertText({ body: current.body, cursor: current.cursor }, text.replace(/\r\n?/g, "\n"))
				return { ...current, focus: "body", body: next.body, cursor: next.cursor, error: null }
			})
			return true
		}
		if (labelModalActive) {
			setLabelModal((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (changedFilesModalActive) {
			setChangedFilesModal((current) => ({ ...current, query: current.query + singleLineText(text), selectedIndex: 0 }))
			return true
		}
		if (filterMode) {
			setFilterDraft((current) => current + singleLineText(text))
			return true
		}
		return false
	}

	usePasteHandler({ renderer, onPaste: insertPastedText })
}

// Type re-export so callers don't have to import from commentEditor.
export type { CommentEditorValue, FilterModalState }
