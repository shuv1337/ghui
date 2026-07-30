import { useAtomSet } from "@effect/atom-react"
import { useCallback } from "react"
import { errorMessage } from "../errors.js"
import type { ArtifactDownloadModalState, RunActionModalState, WorkflowDispatchModalState } from "../ui/modals/types.js"
import type { ActionArtifact } from "../domain.js"
import { cancelRunAtom, dispatchWorkflowAtom, downloadArtifactAtom, getWorkflowInputsAtom, retryRunAtom } from "../ui/runs/atoms.js"

type StateSetter<A> = (next: A | ((current: A) => A)) => void

export interface UseActionsModalActionsInput {
	readonly runActionModal: RunActionModalState
	readonly workflowDispatchModal: WorkflowDispatchModalState
	readonly artifactDownloadModal: ArtifactDownloadModalState
	readonly setRunActionModal: StateSetter<RunActionModalState>
	readonly setWorkflowDispatchModal: StateSetter<WorkflowDispatchModalState>
	readonly setArtifactDownloadModal: StateSetter<ArtifactDownloadModalState>
	readonly closeActiveModal: () => void
	readonly refreshRuns: () => void
	readonly flashNotice: (message: string) => void
}

const wrap = (index: number, delta: -1 | 1, length: number): number => (length === 0 ? 0 : (index + delta + length) % length)

const defaultsFor = (inputs: WorkflowDispatchModalState["inputs"]): Readonly<Record<string, string | boolean>> =>
	Object.fromEntries(inputs.flatMap((input) => (input.defaultValue === null ? [] : [[input.name, input.defaultValue]])))

export const artifactDownloadValidation = (artifact: ActionArtifact | null, destination: string): string | null => {
	if (!artifact) return "No artifact selected."
	if (artifact.expired) return `${artifact.name} has expired.`
	if (!destination.trim()) return "Choose an explicit destination directory."
	return null
}

export const useActionsModalActions = (input: UseActionsModalActionsInput) => {
	const retryRun = useAtomSet(retryRunAtom, { mode: "promise" })
	const cancelRun = useAtomSet(cancelRunAtom, { mode: "promise" })
	const dispatchWorkflow = useAtomSet(dispatchWorkflowAtom, { mode: "promise" })
	const getWorkflowInputs = useAtomSet(getWorkflowInputsAtom, { mode: "promise" })
	const downloadArtifact = useAtomSet(downloadArtifactAtom, { mode: "promise" })

	const confirmRunAction = useCallback(() => {
		const modal = input.runActionModal
		if (modal.running) return
		input.setRunActionModal((current) => ({ ...current, running: true, error: null }))
		const operation =
			modal.action === "retry"
				? retryRun({ repository: modal.repository, runId: modal.runId, failedOnly: modal.failedOnly })
				: cancelRun({ repository: modal.repository, runId: modal.runId })
		void operation
			.then(() => {
				input.closeActiveModal()
				input.refreshRuns()
				input.flashNotice(modal.action === "retry" ? `Retry requested for run #${modal.runId}` : `Cancellation requested for run #${modal.runId}`)
			})
			.catch((error) => input.setRunActionModal((current) => ({ ...current, running: false, error: errorMessage(error) })))
	}, [input, retryRun, cancelRun])

	const loadWorkflowInputs = useCallback(
		(repository: string, workflowId: number) => {
			input.setWorkflowDispatchModal((current) => ({ ...current, loadingInputs: true, inputs: [], values: {}, error: null }))
			void getWorkflowInputs({ repository, workflow: String(workflowId) })
				.then((inputs) =>
					input.setWorkflowDispatchModal((current) => {
						const selected = current.workflows[current.workflowIndex]
						if (current.repository !== repository || selected?.id !== workflowId) return current
						return { ...current, inputs, values: defaultsFor(inputs), loadingInputs: false, error: null }
					}),
				)
				.catch((error) =>
					input.setWorkflowDispatchModal((current) => {
						const selected = current.workflows[current.workflowIndex]
						return current.repository === repository && selected?.id === workflowId ? { ...current, loadingInputs: false, error: errorMessage(error) } : current
					}),
				)
		},
		[input, getWorkflowInputs],
	)

	const moveWorkflowDispatchFocus = useCallback(
		(delta: -1 | 1) => {
			input.setWorkflowDispatchModal((current) => ({
				...current,
				focusIndex: wrap(current.focusIndex, delta, current.inputs.length + 2),
				error: null,
			}))
		},
		[input],
	)

	const cycleWorkflowDispatchValue = useCallback(
		(delta: -1 | 1) => {
			const current = input.workflowDispatchModal
			if (current.running || current.loadingInputs) return
			if (current.focusIndex === 0) {
				if (current.workflows.length < 2) return
				const workflowIndex = wrap(current.workflowIndex, delta, current.workflows.length)
				const workflow = current.workflows[workflowIndex]
				if (!workflow) return
				input.setWorkflowDispatchModal({ ...current, workflowIndex, focusIndex: 0, inputs: [], values: {}, loadingInputs: true, error: null })
				loadWorkflowInputs(current.repository, workflow.id)
				return
			}
			const field = current.inputs[current.focusIndex - 2]
			if (!field) return
			if (field.type === "boolean") {
				input.setWorkflowDispatchModal({
					...current,
					values: { ...current.values, [field.name]: !(current.values[field.name] === true || current.values[field.name] === "true") },
					error: null,
				})
				return
			}
			if (field.type === "choice" && field.options.length > 0) {
				const value = String(current.values[field.name] ?? field.defaultValue ?? field.options[0])
				const index = Math.max(0, field.options.indexOf(value))
				input.setWorkflowDispatchModal({
					...current,
					values: { ...current.values, [field.name]: field.options[wrap(index, delta, field.options.length)]! },
					error: null,
				})
			}
		},
		[input, loadWorkflowInputs],
	)

	const confirmWorkflowDispatch = useCallback(() => {
		const modal = input.workflowDispatchModal
		if (modal.running || modal.loadingInputs) return
		const workflow = modal.workflows[modal.workflowIndex]
		if (!workflow) {
			input.setWorkflowDispatchModal((current) => ({ ...current, error: "Select an active workflow." }))
			return
		}
		if (!modal.ref.trim()) {
			input.setWorkflowDispatchModal((current) => ({ ...current, focusIndex: 1, error: "Ref is required." }))
			return
		}
		const missing = modal.inputs.find((field) => field.required && String(modal.values[field.name] ?? field.defaultValue ?? "").trim().length === 0)
		if (missing) {
			input.setWorkflowDispatchModal((current) => ({
				...current,
				focusIndex: current.inputs.indexOf(missing) + 2,
				error: `${missing.name} is required.`,
			}))
			return
		}
		const values = Object.fromEntries(
			modal.inputs.flatMap((field) => {
				const value = modal.values[field.name] ?? field.defaultValue
				return value === null || (typeof value === "string" && value.length === 0 && !field.required) ? [] : [[field.name, value]]
			}),
		)
		input.setWorkflowDispatchModal((current) => ({ ...current, running: true, error: null }))
		void dispatchWorkflow({ repository: modal.repository, workflow: String(workflow.id), ref: modal.ref.trim(), values })
			.then(() => {
				input.closeActiveModal()
				input.refreshRuns()
				input.flashNotice(`Dispatched ${workflow.name}`)
			})
			.catch((error) => input.setWorkflowDispatchModal((current) => ({ ...current, running: false, error: errorMessage(error) })))
	}, [input, dispatchWorkflow])

	const toggleArtifactFocus = useCallback(() => {
		input.setArtifactDownloadModal((current) => ({ ...current, focus: current.focus === "artifact" ? "destination" : "artifact", error: null }))
	}, [input])

	const moveArtifactSelection = useCallback(
		(delta: -1 | 1) => {
			input.setArtifactDownloadModal((current) => ({
				...current,
				selectedIndex: wrap(current.selectedIndex, delta, current.artifacts.length),
				error: null,
			}))
		},
		[input],
	)

	const confirmArtifactDownload = useCallback(() => {
		const modal = input.artifactDownloadModal
		if (modal.running || modal.loading) return
		const artifact = modal.artifacts[modal.selectedIndex] ?? null
		const validationError = artifactDownloadValidation(artifact, modal.destination)
		if (validationError) {
			input.setArtifactDownloadModal((current) => ({
				...current,
				focus: artifact?.expired || !artifact ? "artifact" : "destination",
				error: validationError,
			}))
			return
		}
		input.setArtifactDownloadModal((current) => ({ ...current, running: true, error: null }))
		void downloadArtifact({
			repository: modal.repository,
			runId: modal.runId,
			artifactName: artifact!.name,
			destination: modal.destination.trim(),
		})
			.then((destination) => {
				input.closeActiveModal()
				input.flashNotice(`Downloaded ${artifact!.name} to ${destination}`)
			})
			.catch((error) => input.setArtifactDownloadModal((current) => ({ ...current, running: false, error: errorMessage(error) })))
	}, [input, downloadArtifact])

	return {
		confirmRunAction,
		moveWorkflowDispatchFocus,
		cycleWorkflowDispatchValue,
		confirmWorkflowDispatch,
		toggleArtifactFocus,
		moveArtifactSelection,
		confirmArtifactDownload,
	}
}
