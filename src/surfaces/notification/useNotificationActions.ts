import { useEffect } from "react"
import { registerHandoff } from "../../commands/handoffs.js"
import { errorMessage } from "../../errors.js"
import type { NotificationSurfaceModel } from "./useNotificationSurface.js"

export const useNotificationActions = (model: NotificationSurfaceModel, notify: (message: string) => void, openUrl: (url: string) => Promise<void>) => {
	const markRead = (selectedOnly: boolean) => {
		void model
			.markRead(selectedOnly)
			.then((count) => notify(count === 0 ? "No unread notification selected" : `Marked ${count} notification${count === 1 ? "" : "s"} read`))
			.catch((cause) => notify(errorMessage(cause)))
	}
	const open = () => {
		if (!model.selected?.url) {
			notify("Notification target is unavailable or was deleted")
			return
		}
		void openUrl(model.selected.url).catch((cause) => notify(errorMessage(cause)))
	}

	useEffect(() => registerHandoff("refreshNotifications", model.refresh), [model.refresh])
	useEffect(() => registerHandoff("toggleNotificationReadFilter", model.toggleIncludeRead), [model.toggleIncludeRead])
	useEffect(() => registerHandoff("cycleNotificationTypeFilter", model.cycleTypeFilter), [model.cycleTypeFilter])
	useEffect(() => registerHandoff("toggleNotificationSelection", model.toggleSelection), [model.toggleSelection])
	useEffect(() => registerHandoff("markNotificationRead", () => markRead(false)), [model.selected, model.markRead, notify])
	useEffect(() => registerHandoff("markSelectedNotificationsRead", () => markRead(true)), [model.selectedIds, model.markRead, notify])
	useEffect(() => registerHandoff("openNotification", open), [model.selected, openUrl, notify])
}
