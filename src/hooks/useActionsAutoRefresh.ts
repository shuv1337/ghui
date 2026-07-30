import { useEffect } from "react"
import { useTerminalFocus } from "../ui/useTerminalFocus.js"

interface RendererFocusEvents {
	on: (event: "focus" | "blur", handler: () => void) => void
	off: (event: "focus" | "blur", handler: () => void) => void
}

export const ACTIONS_REFRESH_INTERVAL_MS = 15_000

export const actionsAutoRefreshEnabled = (active: boolean, terminalFocused: boolean, hasVisibleInProgressRun: boolean): boolean =>
	active && terminalFocused && hasVisibleInProgressRun

export const createActionsAutoRefreshTimer = ({
	enabled,
	intervalMs,
	onRefresh,
	setIntervalFn = globalThis.setInterval,
	clearIntervalFn = globalThis.clearInterval,
}: {
	readonly enabled: boolean
	readonly intervalMs: number
	readonly onRefresh: () => void
	readonly setIntervalFn?: typeof globalThis.setInterval
	readonly clearIntervalFn?: typeof globalThis.clearInterval
}): (() => void) => {
	if (!enabled) return () => {}
	const handle = setIntervalFn(onRefresh, intervalMs)
	return () => clearIntervalFn(handle)
}

export const useActionsAutoRefresh = ({
	renderer,
	active,
	hasVisibleInProgressRun,
	onRefresh,
	intervalMs = ACTIONS_REFRESH_INTERVAL_MS,
}: {
	readonly renderer: RendererFocusEvents
	readonly active: boolean
	readonly hasVisibleInProgressRun: boolean
	readonly onRefresh: () => void
	readonly intervalMs?: number
}): void => {
	const { terminalFocused } = useTerminalFocus({
		renderer,
		onFocusReturn: () => {
			if (active && hasVisibleInProgressRun) onRefresh()
		},
	})
	const enabled = actionsAutoRefreshEnabled(active, terminalFocused, hasVisibleInProgressRun)
	useEffect(() => createActionsAutoRefreshTimer({ enabled, intervalMs, onRefresh }), [enabled, intervalMs, onRefresh])
}
