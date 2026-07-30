import { useKeyboard } from "@opentui/react"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import { type CommentEditorValue, insertText } from "./commentEditor.js"
import type {
	ChangedFilesModalState,
	ArtifactDownloadModalState,
	BulkEditorModalState,
	CommandPaletteState,
	ItemEditorModalState,
	MetadataSelectorModalState,
	LabelModalState,
	OpenRepositoryModalState,
	ReleaseEditorModalState,
	SubmitReviewModalState,
	ThemeModalState,
	WorkflowDispatchModalState,
	ResourceEditorModalState,
} from "./modals.js"
import { editSingleLineInput, isSingleLineInputKey, printableKeyText } from "./singleLineInput.js"

export interface UseTextInputDispatcherInput {
	readonly disabled: boolean

	// Modal active flags
	readonly commandPaletteActive: boolean
	readonly openRepositoryModalActive: boolean
	readonly themeModalActive: boolean
	readonly commentModalActive: boolean
	readonly submitReviewModalActive: boolean
	readonly changedFilesModalActive: boolean
	readonly labelModalActive: boolean
	readonly filterMode: boolean
	readonly detailFullView: boolean
	readonly diffFullView: boolean
	readonly commentsViewActive: boolean
	readonly releaseEditorModalActive: boolean
	readonly itemEditorModalActive: boolean
	readonly metadataSelectorModalActive: boolean
	readonly bulkEditorModalActive: boolean
	readonly workflowDispatchModalActive: boolean
	readonly artifactDownloadModalActive: boolean
	readonly resourceEditorModalActive: boolean
	readonly deleteResourceModalActive: boolean

	// Modal sub-state needed for routing
	readonly themeModal: ThemeModalState
	readonly submitReviewModal: SubmitReviewModalState
	readonly releaseEditorModal: ReleaseEditorModalState
	readonly itemEditorModal: ItemEditorModalState
	readonly metadataSelectorModal: MetadataSelectorModalState
	readonly bulkEditorModal: BulkEditorModalState
	readonly workflowDispatchModal: WorkflowDispatchModalState
	readonly artifactDownloadModal: ArtifactDownloadModalState
	readonly resourceEditorModal: ResourceEditorModalState

	// Workspace surface tabs (for 1/2/3 numeric shortcuts)
	readonly workspaceTabSurfaces: readonly WorkspaceSurface[]
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void

	// Per-modal text-input setters
	readonly setCommandPalette: (next: CommandPaletteState | ((prev: CommandPaletteState) => CommandPaletteState)) => void
	readonly setOpenRepositoryModal: (next: OpenRepositoryModalState | ((prev: OpenRepositoryModalState) => OpenRepositoryModalState)) => void
	readonly setChangedFilesModal: (next: ChangedFilesModalState | ((prev: ChangedFilesModalState) => ChangedFilesModalState)) => void
	readonly setLabelModal: (next: LabelModalState | ((prev: LabelModalState) => LabelModalState)) => void
	readonly setFilterDraft: (next: string | ((prev: string) => string)) => void
	readonly setReleaseEditorModal: (next: ReleaseEditorModalState | ((prev: ReleaseEditorModalState) => ReleaseEditorModalState)) => void
	readonly setItemEditorModal: (next: ItemEditorModalState | ((prev: ItemEditorModalState) => ItemEditorModalState)) => void
	readonly setMetadataSelectorModal: (next: MetadataSelectorModalState | ((prev: MetadataSelectorModalState) => MetadataSelectorModalState)) => void
	readonly setBulkEditorModal: (next: BulkEditorModalState | ((prev: BulkEditorModalState) => BulkEditorModalState)) => void
	readonly setWorkflowDispatchModal: (next: WorkflowDispatchModalState | ((prev: WorkflowDispatchModalState) => WorkflowDispatchModalState)) => void
	readonly setArtifactDownloadModal: (next: ArtifactDownloadModalState | ((prev: ArtifactDownloadModalState) => ArtifactDownloadModalState)) => void
	readonly setResourceEditorModal: (next: ResourceEditorModalState | ((prev: ResourceEditorModalState) => ResourceEditorModalState)) => void
	readonly editThemeQuery: (transform: (query: string) => string) => void
	readonly editSubmitReview: (transform: (state: CommentEditorValue) => CommentEditorValue) => void
	readonly closeResourceModal: () => void
}

/**
 * Routes raw text keystrokes to whichever modal owns input right now.
 * The precedence order encodes the modal stack:
 *
 *   command palette > open-repo > numeric tabs (when in list mode) >
 *   theme > comment > submit-review > changed-files > label > filter
 *
 * This is the load-bearing invariant — any module that wants to claim
 * raw keyboard input registers via this dispatcher rather than a
 * separate useKeyboard call so the precedence stays linearizable.
 *
 * Modal-action keys (q/ctrl+c/escape/return/etc.) live in the keymap
 * layer; this hook only handles characters that need byte-by-byte
 * accumulation into a query/body string.
 */
export const useTextInputDispatcher = (input: UseTextInputDispatcherInput): void => {
	useKeyboard((key) => {
		if (input.disabled) return

		if ((input.resourceEditorModalActive || input.deleteResourceModalActive) && key.name === "escape") {
			input.closeResourceModal()
			return
		}

		if (input.commandPaletteActive) {
			if (isSingleLineInputKey(key)) {
				input.setCommandPalette((current) => {
					const query = editSingleLineInput(current.query, key) ?? current.query
					return current.query === query && current.selectedIndex === 0 ? current : { ...current, query, selectedIndex: 0 }
				})
			}
			return
		}

		if (input.openRepositoryModalActive) {
			if (isSingleLineInputKey(key)) {
				input.setOpenRepositoryModal((current) => ({
					...current,
					query: editSingleLineInput(current.query, key) ?? current.query,
					error: null,
				}))
			}
			return
		}

		if (input.workflowDispatchModalActive) {
			if (input.workflowDispatchModal.running || input.workflowDispatchModal.loadingInputs || !isSingleLineInputKey(key)) return
			input.setWorkflowDispatchModal((current) => {
				if (current.focusIndex === 1) {
					const ref = editSingleLineInput(current.ref, key) ?? current.ref
					return ref === current.ref ? current : { ...current, ref, error: null }
				}
				const field = current.inputs[current.focusIndex - 2]
				if (!field || field.type === "boolean" || field.type === "choice") return current
				const previous = String(current.values[field.name] ?? field.defaultValue ?? "")
				const value = editSingleLineInput(previous, key) ?? previous
				return value === previous ? current : { ...current, values: { ...current.values, [field.name]: value }, error: null }
			})
			return
		}

		if (input.artifactDownloadModalActive) {
			if (input.artifactDownloadModal.running || input.artifactDownloadModal.focus !== "destination" || !isSingleLineInputKey(key)) return
			input.setArtifactDownloadModal((current) => {
				const destination = editSingleLineInput(current.destination, key) ?? current.destination
				return destination === current.destination ? current : { ...current, destination, error: null }
			})
			return
		}

		if (input.itemEditorModalActive) {
			if (input.itemEditorModal.running || input.itemEditorModal.focus === "draft") return
			if (isSingleLineInputKey(key)) {
				input.setItemEditorModal((current) => {
					const field = current.focus as Exclude<ItemEditorModalState["focus"], "draft">
					const previous = current[field]
					if (typeof previous !== "string") return current
					const value = editSingleLineInput(previous, key) ?? previous
					return value === previous ? current : { ...current, [field]: value, error: null }
				})
			}
			return
		}

		if (input.metadataSelectorModalActive) {
			if (isSingleLineInputKey(key)) {
				input.setMetadataSelectorModal((current) => ({
					...current,
					query: editSingleLineInput(current.query, key) ?? current.query,
					selectedIndex: 0,
				}))
			}
			return
		}

		if (input.bulkEditorModalActive) {
			if (input.bulkEditorModal.running || input.bulkEditorModal.focus !== "value") return
			if (isSingleLineInputKey(key)) {
				input.setBulkEditorModal((current) => ({ ...current, value: editSingleLineInput(current.value, key) ?? current.value, error: null }))
			}
			return
		}

		if (input.releaseEditorModalActive) {
			if (input.releaseEditorModal.running) return
			if (input.releaseEditorModal.focus === "isDraft" || input.releaseEditorModal.focus === "isPrerelease") return
			if (isSingleLineInputKey(key)) {
				input.setReleaseEditorModal((current) => {
					const field = current.focus as "tagName" | "name" | "body" | "targetCommitish"
					const previous = current[field]
					const value = editSingleLineInput(previous, key) ?? previous
					return value === previous ? current : { ...current, [field]: value, error: null }
				})
			}
			return
		}

		if (input.resourceEditorModalActive) {
			if (input.resourceEditorModal.running || !isSingleLineInputKey(key)) return
			input.setResourceEditorModal((current) => {
				if (current.focus === "source" || current.focus === "state") return current
				const field = current.kind === "branch" ? "branchName" : current.focus === "title" || current.focus === "description" || current.focus === "dueOn" ? current.focus : null
				if (!field) return current
				const previous = current[field]
				if (typeof previous !== "string") return current
				const value = editSingleLineInput(previous, key) ?? previous
				return value === previous ? current : { ...current, [field]: value, error: null }
			})
			return
		}

		// Numeric tab shortcuts (1-9) — only active in list mode (no modal,
		// no full-view, no filter editing).
		if (!input.filterMode && !input.detailFullView && !input.diffFullView && !input.commentsViewActive) {
			const text = printableKeyText(key)
			const position = text && /^[1-9]$/.test(text) ? Number(text) - 1 : -1
			if (position >= 0) {
				input.switchWorkspaceSurface(input.workspaceTabSurfaces[position] ?? input.activeWorkspaceSurface)
				return
			}
		}

		if (input.themeModalActive) {
			if (input.themeModal.filterMode && isSingleLineInputKey(key)) {
				input.editThemeQuery((query) => editSingleLineInput(query, key) ?? query)
			}
			return
		}

		if (input.commentModalActive) return

		if (input.submitReviewModalActive) {
			if (input.submitReviewModal.focus !== "body") return
			const text = printableKeyText(key)
			if (text) input.editSubmitReview((state) => insertText(state, text))
			return
		}

		if (input.changedFilesModalActive) {
			if (isSingleLineInputKey(key)) {
				input.setChangedFilesModal((current) => {
					const query = editSingleLineInput(current.query, key) ?? current.query
					return query === current.query ? current : { ...current, query, selectedIndex: 0 }
				})
			}
			return
		}

		if (input.labelModalActive) {
			if (isSingleLineInputKey(key)) {
				input.setLabelModal((current) => ({
					...current,
					query: editSingleLineInput(current.query, key) ?? current.query,
					selectedIndex: 0,
				}))
			}
			return
		}

		if (input.filterMode) {
			if (isSingleLineInputKey(key)) {
				input.setFilterDraft((current) => editSingleLineInput(current, key) ?? current)
			}
		}
	})
}
