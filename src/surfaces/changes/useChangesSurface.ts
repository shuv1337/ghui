import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useCallback, useEffect } from "react"
import type { LoadStatus } from "../../domain.js"
import type { ChangePrLink, WorkspaceSnapshot } from "../../localDomain.js"
import { useTerminalFocus } from "../../ui/useTerminalFocus.js"
import { jjChangesSurfaceAvailable } from "../../workspace/jjAvailability.js"
import { repositoryContext } from "../../services/runtime.js"
import {
	changeErrorAtom,
	changePrLinksAtom,
	changeRefreshGenerationAtom,
	changeSelectionAtom,
	changeSnapshotAtom,
	changeStatusAtom,
	describeChangeLoadError,
	loadChangePrLinksAtom,
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
	readonly links: readonly ChangePrLink[]
	readonly relations?: Readonly<Record<string, import("../../localDomain.js").LocalRemoteRelation>>
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
	const [links, setLinks] = useAtom(changePrLinksAtom)
	const refreshGeneration = useAtomValue(changeRefreshGenerationAtom)
	const loadSnapshot = useAtomSet(loadChangeSnapshotAtom, { mode: "promise" })
	const loadLinks = useAtomSet(loadChangePrLinksAtom, { mode: "promise" })
	const storeId = repositoryContext.storeRoot ?? repositoryContext.workspaceRoot

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

	useEffect(() => {
		if (!available || !storeId || !selectedRepository) {
			setLinks([])
			return
		}
		void loadLinks({ storeId, repository: selectedRepository })
			.then(setLinks)
			.catch(() => setLinks([]))
	}, [available, loadLinks, selectedRepository, setLinks, snapshot?.operationId, storeId])

	useTerminalFocus({
		renderer,
		onFocusReturn: () => refresh(false),
	})

	return { available, snapshot, selectedIndex, setSelectedIndex, status, error, refresh, links }
}
