import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useCallback, useEffect } from "react"
import type { LoadStatus } from "../../domain.js"
import type { WorkspaceSnapshot } from "../../localDomain.js"
import { useTerminalFocus } from "../../ui/useTerminalFocus.js"
import { jjChangesSurfaceAvailable } from "../../workspace/jjAvailability.js"
import { repositoryContext } from "../../services/runtime.js"
import {
	changeErrorAtom,
	changeRefreshGenerationAtom,
	changeSelectionAtom,
	changeSnapshotAtom,
	changeStatusAtom,
	describeChangeLoadError,
	loadChangeSnapshotAtom,
} from "./atoms.js"

export interface ChangesSurfaceModel {
	readonly available: boolean
	readonly snapshot: WorkspaceSnapshot | null
	readonly selectedIndex: number
	readonly setSelectedIndex: (index: number | ((current: number) => number)) => void
	readonly status: LoadStatus
	readonly error: string | null
	readonly refresh: (force?: boolean) => void
}

export const useChangesSurface = (
	selectedRepository: string | null,
	renderer: { on: (event: "focus" | "blur", handler: () => void) => void; off: (event: "focus" | "blur", handler: () => void) => void },
): ChangesSurfaceModel => {
	const available = jjChangesSurfaceAvailable(repositoryContext, selectedRepository)
	const [snapshot, setSnapshot] = useAtom(changeSnapshotAtom)
	const [status, setStatus] = useAtom(changeStatusAtom)
	const [error, setError] = useAtom(changeErrorAtom)
	const [selectedIndex, setSelectedIndex] = useAtom(changeSelectionAtom)
	const refreshGeneration = useAtomValue(changeRefreshGenerationAtom)
	const loadSnapshot = useAtomSet(loadChangeSnapshotAtom, { mode: "promise" })

	const refresh = useCallback(
		(force = false) => {
			if (!available) {
				setSnapshot(null)
				setStatus("ready")
				setError(null)
				return
			}
			setStatus(snapshot && !force ? "ready" : "loading")
			void loadSnapshot(force ? { force: true } : undefined)
				.then((next) => {
					setSnapshot(next)
					setStatus("ready")
					setError(null)
					setSelectedIndex((current) => Math.max(0, Math.min(current, Math.max(0, next.stack.length - 1))))
				})
				.catch((cause) => {
					setStatus("error")
					setError(describeChangeLoadError(cause))
				})
		},
		[available, loadSnapshot, setError, setSelectedIndex, setSnapshot, setStatus, snapshot],
	)

	useEffect(() => {
		refresh(refreshGeneration > 0)
	}, [available, refreshGeneration, selectedRepository])

	useTerminalFocus({
		renderer,
		onFocusReturn: () => refresh(false),
	})

	return { available, snapshot, selectedIndex, setSelectedIndex, status, error, refresh }
}
