import type { DeleteReleaseModalState, DeleteResourceModalState, ReleaseEditorModalState, ResourceEditorModalState } from "../ui/modals/types.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import { useNotificationActions } from "../surfaces/notification/useNotificationActions.js"
import { useNotificationSurface } from "../surfaces/notification/useNotificationSurface.js"
import { useReleaseActions } from "../surfaces/release/useReleaseActions.js"
import { useReleaseSurface } from "../surfaces/release/useReleaseSurface.js"
import { useResourceActions } from "../surfaces/resource/useResourceActions.js"
import { useResourceSurfaces } from "../surfaces/resource/useResourceSurfaces.js"

type Setter<T> = (next: T | ((current: T) => T)) => void

export interface UseParitySurfacesInput {
	readonly repository: string | null
	readonly activeSurface: WorkspaceSurface
	readonly filterText: string
	readonly releaseEditor: ReleaseEditorModalState
	readonly deleteRelease: DeleteReleaseModalState
	readonly resourceEditor: ResourceEditorModalState
	readonly deleteResource: DeleteResourceModalState
	readonly setReleaseEditor: Setter<ReleaseEditorModalState>
	readonly setDeleteRelease: Setter<DeleteReleaseModalState>
	readonly setResourceEditor: Setter<ResourceEditorModalState>
	readonly setDeleteResource: Setter<DeleteResourceModalState>
	readonly closeModal: () => void
	readonly notify: (message: string) => void
	readonly openUrl: (url: string) => Promise<void>
}

export const useParitySurfaces = (input: UseParitySurfacesInput) => {
	const releaseSurface = useReleaseSurface(input.repository, input.activeSurface)
	const releaseActions = useReleaseActions({
		repository: input.repository,
		selectedRelease: releaseSurface.selectedRelease,
		editor: input.releaseEditor,
		deletion: input.deleteRelease,
		setEditor: input.setReleaseEditor,
		setDeletion: input.setDeleteRelease,
		closeModal: input.closeModal,
		createRelease: releaseSurface.createRelease,
		editRelease: releaseSurface.editRelease,
		deleteRelease: releaseSurface.deleteRelease,
		refresh: releaseSurface.refresh,
		selectRelease: releaseSurface.selectRelease,
		notify: input.notify,
	})
	const resourcesView = useResourceSurfaces(input.repository, input.activeSurface)
	const resourceActions = useResourceActions({
		repository: input.repository,
		model: resourcesView,
		editor: input.resourceEditor,
		deletion: input.deleteResource,
		setEditor: input.setResourceEditor,
		setDeletion: input.setDeleteResource,
		closeModal: input.closeModal,
		notify: input.notify,
		openUrl: input.openUrl,
	})
	const notificationsView = useNotificationSurface(input.activeSurface, input.filterText)
	useNotificationActions(notificationsView, input.notify, input.openUrl)

	return { releaseSurface, releaseActions, resourcesView, resourceActions, notificationsView }
}
