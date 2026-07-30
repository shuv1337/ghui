import { useAtom, useAtomSet } from "@effect/atom-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CreateReleaseInput, EditReleaseInput, LoadStatus, ReleaseItem } from "../../domain.js"
import { errorMessage } from "../../errors.js"
import { useClampedIndex } from "../../ui/useClampedIndex.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"
import { createReleaseAtom, deleteReleaseAtom, editReleaseAtom, loadReleasesAtom, releaseItemsAtom, selectedReleaseAtom, selectedReleaseIndexAtom } from "./atoms.js"
import { useSurfaceView } from "../../settings/useSurfaceView.js"
import { applySurfaceView } from "../../settings/viewConfig.js"
import type { SurfaceViewConfig } from "../../configStore.js"

export interface ReleaseSurfaceShell {
	readonly releases: readonly ReleaseItem[]
	readonly selectedRelease: ReleaseItem | null
	readonly selectedReleaseIndex: number
	readonly setSelectedReleaseIndex: (next: number | ((current: number) => number)) => void
	readonly status: LoadStatus
	readonly error: string | null
	readonly view: SurfaceViewConfig
	readonly refresh: () => void
	readonly selectRelease: (tagName: string) => void
	readonly createRelease: (input: CreateReleaseInput) => Promise<ReleaseItem>
	readonly editRelease: (input: EditReleaseInput) => Promise<ReleaseItem>
	readonly deleteRelease: (input: { readonly repository: string; readonly tagName: string }) => Promise<void>
}

export const useReleaseSurface = (repository: string | null, activeSurface: WorkspaceSurface): ReleaseSurfaceShell => {
	const [rawReleases, setReleases] = useAtom(releaseItemsAtom)
	const [selectedReleaseIndex, setStoredSelectedReleaseIndex] = useAtom(selectedReleaseIndexAtom)
	const setSelectedRelease = useAtomSet(selectedReleaseAtom)
	const loadReleases = useAtomSet(loadReleasesAtom, { mode: "promise" })
	const createRelease = useAtomSet(createReleaseAtom, { mode: "promise" })
	const editRelease = useAtomSet(editReleaseAtom, { mode: "promise" })
	const deleteRelease = useAtomSet(deleteReleaseAtom, { mode: "promise" })
	const [status, setStatus] = useState<LoadStatus>("loading")
	const [error, setError] = useState<string | null>(null)
	const [generation, setGeneration] = useState(0)
	const requestId = useRef(0)
	const selectedTagRef = useRef<string | null>(null)
	const { view } = useSurfaceView("releases")
	const releases = useMemo(() => applySurfaceView(rawReleases, view, "releases"), [rawReleases, view])
	const selectedRelease = releases[selectedReleaseIndex] ?? null
	const setSelectedReleaseIndex = useCallback(
		(next: number | ((current: number) => number)) =>
			setStoredSelectedReleaseIndex((current) => {
				const index = typeof next === "function" ? next(current) : next
				selectedTagRef.current = releases[index]?.tagName ?? null
				return index
			}),
		[releases, setStoredSelectedReleaseIndex],
	)
	const refresh = useCallback(() => setGeneration((current) => current + 1), [])

	useEffect(() => {
		setSelectedRelease(selectedRelease)
	}, [selectedRelease, setSelectedRelease])

	useEffect(() => {
		setStoredSelectedReleaseIndex((current) => {
			const selectedTag = selectedTagRef.current
			const preserved = selectedTag ? releases.findIndex((release) => release.tagName === selectedTag) : -1
			const next = preserved >= 0 ? preserved : Math.max(0, Math.min(releases.length - 1, current))
			selectedTagRef.current = releases[next]?.tagName ?? null
			return next
		})
	}, [releases, setStoredSelectedReleaseIndex])

	useEffect(() => {
		if (activeSurface !== "releases" || !repository) return
		const currentRequest = ++requestId.current
		setStatus(releases.length === 0 ? "loading" : "ready")
		setError(null)
		void loadReleases(repository).then(
			(next) => {
				if (requestId.current !== currentRequest) return
				setReleases(next)
				setStatus("ready")
			},
			(cause) => {
				if (requestId.current !== currentRequest) return
				setError(errorMessage(cause))
				setStatus(releases.length === 0 ? "error" : "ready")
			},
		)
		return () => {
			requestId.current += 1
		}
	}, [activeSurface, generation, loadReleases, rawReleases.length, repository, setReleases])

	useClampedIndex(releases.length, setSelectedReleaseIndex)

	return {
		releases,
		selectedRelease,
		selectedReleaseIndex,
		setSelectedReleaseIndex,
		status,
		error,
		view,
		refresh,
		selectRelease: (tagName) => {
			selectedTagRef.current = tagName
		},
		createRelease,
		editRelease,
		deleteRelease,
	}
}
