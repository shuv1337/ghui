import type { ArtifactDownloadModalState, RunActionModalState, WorkflowDispatchModalState } from "../ui/modals/types.js"
import { useActionsAutoRefresh, type RendererFocusEvents } from "./useActionsAutoRefresh.js"
import { useActionsModalActions } from "./useActionsModalActions.js"
import { useRepositoryActionsView } from "./useRepositoryActionsView.js"

type Setter<T> = (next: T | ((current: T) => T)) => void

export interface UseActionsSurfaceShellInput {
	readonly renderer: RendererFocusEvents
	readonly repository: string | null
	readonly active: boolean
	readonly halfPage: number
	readonly filterText: string
	readonly runActionModal: RunActionModalState
	readonly workflowDispatchModal: WorkflowDispatchModalState
	readonly artifactDownloadModal: ArtifactDownloadModalState
	readonly setRunActionModal: Setter<RunActionModalState>
	readonly setWorkflowDispatchModal: Setter<WorkflowDispatchModalState>
	readonly setArtifactDownloadModal: Setter<ArtifactDownloadModalState>
	readonly closeModal: () => void
	readonly notify: (message: string) => void
}

export const useActionsSurfaceShell = (input: UseActionsSurfaceShellInput) => {
	const view = useRepositoryActionsView(input.repository, input.halfPage, input.filterText)
	useActionsAutoRefresh({
		renderer: input.renderer,
		active: input.active,
		hasVisibleInProgressRun: view.hasVisibleInProgressRun,
		onRefresh: view.ctx.refresh,
	})
	const modalActions = useActionsModalActions({
		runActionModal: input.runActionModal,
		workflowDispatchModal: input.workflowDispatchModal,
		artifactDownloadModal: input.artifactDownloadModal,
		setRunActionModal: input.setRunActionModal,
		setWorkflowDispatchModal: input.setWorkflowDispatchModal,
		setArtifactDownloadModal: input.setArtifactDownloadModal,
		closeActiveModal: input.closeModal,
		refreshRuns: view.ctx.refresh,
		flashNotice: input.notify,
	})
	return { view, modalActions }
}
