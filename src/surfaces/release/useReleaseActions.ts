import { useEffect } from "react"
import { registerHandoff } from "../../commands/handoffs.js"
import type { CreateReleaseInput, EditReleaseInput, ReleaseItem } from "../../domain.js"
import { errorMessage } from "../../errors.js"
import type { DeleteReleaseModalState, ReleaseEditorField, ReleaseEditorModalState } from "../../ui/modals/types.js"

type Setter<T> = (next: T | ((current: T) => T)) => void

export interface UseReleaseActionsInput {
	readonly repository: string | null
	readonly selectedRelease: ReleaseItem | null
	readonly editor: ReleaseEditorModalState
	readonly deletion: DeleteReleaseModalState
	readonly setEditor: Setter<ReleaseEditorModalState>
	readonly setDeletion: Setter<DeleteReleaseModalState>
	readonly closeModal: () => void
	readonly createRelease: (input: CreateReleaseInput) => Promise<ReleaseItem>
	readonly editRelease: (input: EditReleaseInput) => Promise<ReleaseItem>
	readonly deleteRelease: (input: { readonly repository: string; readonly tagName: string }) => Promise<void>
	readonly refresh: () => void
	readonly selectRelease: (tagName: string) => void
	readonly notify: (message: string) => void
}

export const useReleaseActions = (input: UseReleaseActionsInput) => {
	const openCreate = () => {
		if (!input.repository) return
		input.setEditor({
			mode: "create",
			repository: input.repository,
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
		})
	}
	const openEdit = () => {
		const release = input.selectedRelease
		if (!release) return
		input.setEditor({
			mode: "edit",
			repository: release.repository,
			originalTagName: release.tagName,
			tagName: release.tagName,
			name: release.name,
			body: release.body,
			targetCommitish: release.targetCommitish,
			isDraft: release.isDraft,
			isPrerelease: release.isPrerelease,
			focus: "name",
			running: false,
			error: null,
		})
	}
	const openDelete = () => {
		const release = input.selectedRelease
		if (!release) return
		input.setDeletion({
			repository: release.repository,
			tagName: release.tagName,
			name: release.name,
			running: false,
			error: null,
		})
	}

	useEffect(() => registerHandoff("refreshReleases", input.refresh), [input.refresh])
	useEffect(() => registerHandoff("openCreateRelease", openCreate), [input.repository, input.setEditor])
	useEffect(() => registerHandoff("openEditRelease", openEdit), [input.selectedRelease, input.setEditor])
	useEffect(() => registerHandoff("openDeleteRelease", openDelete), [input.selectedRelease, input.setDeletion])

	const fields = (
		input.editor.mode === "edit" ? ["name", "body", "targetCommitish", "isDraft", "isPrerelease"] : ["tagName", "name", "body", "targetCommitish", "isDraft", "isPrerelease"]
	) satisfies readonly ReleaseEditorField[]
	const moveFocus = (delta: -1 | 1) =>
		input.setEditor((current) => {
			const index = Math.max(0, fields.indexOf(current.focus))
			return { ...current, focus: fields[(index + delta + fields.length) % fields.length]! }
		})
	const toggleFocused = () =>
		input.setEditor((current) =>
			current.focus === "isDraft" ? { ...current, isDraft: !current.isDraft } : current.focus === "isPrerelease" ? { ...current, isPrerelease: !current.isPrerelease } : current,
		)
	const submit = () => {
		const state = input.editor
		if (!state.tagName.trim()) {
			input.setEditor((current) => ({ ...current, error: "Tag is required.", focus: "tagName" }))
			return
		}
		if (!state.name.trim()) {
			input.setEditor((current) => ({ ...current, error: "Name is required.", focus: "name" }))
			return
		}
		input.setEditor((current) => ({ ...current, running: true, error: null }))
		const payload = {
			repository: state.repository,
			tagName: state.originalTagName ?? state.tagName.trim(),
			name: state.name.trim(),
			body: state.body,
			targetCommitish: state.targetCommitish.trim() || null,
			isDraft: state.isDraft,
			isPrerelease: state.isPrerelease,
		}
		const operation = state.mode === "create" ? input.createRelease(payload) : input.editRelease(payload)
		void operation.then(
			(release) => {
				input.closeModal()
				input.selectRelease(release.tagName)
				input.refresh()
				input.notify(`${state.mode === "create" ? "Created" : "Updated"} ${release.tagName}`)
			},
			(error) => input.setEditor((current) => ({ ...current, running: false, error: errorMessage(error) })),
		)
	}
	const confirmDelete = () => {
		const state = input.deletion
		if (!state.repository || !state.tagName) return
		input.setDeletion((current) => ({ ...current, running: true, error: null }))
		void input.deleteRelease({ repository: state.repository, tagName: state.tagName }).then(
			() => {
				input.closeModal()
				input.refresh()
				input.notify(`Deleted ${state.tagName}; tag preserved`)
			},
			(error) => input.setDeletion((current) => ({ ...current, running: false, error: errorMessage(error) })),
		)
	}

	return { moveFocus, toggleFocused, submit, confirmDelete }
}
