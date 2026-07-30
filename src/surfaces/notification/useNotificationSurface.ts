import { useAtom, useAtomSet } from "@effect/atom-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { LoadStatus, NotificationItem } from "../../domain.js"
import { errorMessage } from "../../errors.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"
import {
	loadNotificationsAtom,
	markNotificationReadAtom,
	notificationIncludeReadAtom,
	notificationItemsAtom,
	notificationSelectedIdsAtom,
	notificationSelectionAtom,
	notificationTypeFilterAtom,
	selectedNotificationAtom,
} from "./atoms.js"
import { useSurfaceView } from "../../settings/useSurfaceView.js"
import { applySurfaceView } from "../../settings/viewConfig.js"
import type { SurfaceViewConfig } from "../../configStore.js"

export interface NotificationSurfaceModel {
	readonly items: readonly NotificationItem[]
	readonly allItems: readonly NotificationItem[]
	readonly selected: NotificationItem | null
	readonly selectedIndex: number
	readonly setSelectedIndex: (next: number | ((current: number) => number)) => void
	readonly selectedIds: readonly string[]
	readonly includeRead: boolean
	readonly typeFilter: string | null
	readonly filterQuery: string
	readonly view: SurfaceViewConfig
	readonly status: LoadStatus
	readonly error: string | null
	readonly refresh: () => void
	readonly toggleIncludeRead: () => void
	readonly cycleTypeFilter: () => void
	readonly toggleSelection: () => void
	readonly markRead: (selectedOnly: boolean) => Promise<number>
}

const notificationTypes = ["pullRequest", "issue", "release", "discussion", "commit", "repository", "unknown"] as const

export const useNotificationSurface = (activeSurface: WorkspaceSurface, filterQuery: string): NotificationSurfaceModel => {
	const [allItems, setAllItems] = useAtom(notificationItemsAtom)
	const [selectedIndex, setStoredSelectedIndex] = useAtom(notificationSelectionAtom)
	const [selectedIds, setSelectedIds] = useAtom(notificationSelectedIdsAtom)
	const [includeRead, setIncludeRead] = useAtom(notificationIncludeReadAtom)
	const [typeFilter, setTypeFilter] = useAtom(notificationTypeFilterAtom)
	const setSelectedNotification = useAtomSet(selectedNotificationAtom)
	const load = useAtomSet(loadNotificationsAtom, { mode: "promise" })
	const mark = useAtomSet(markNotificationReadAtom, { mode: "promise" })
	const [status, setStatus] = useState<LoadStatus>("loading")
	const [error, setError] = useState<string | null>(null)
	const [generation, setGeneration] = useState(0)
	const { view } = useSurfaceView("notifications")
	const requestId = useRef(0)
	const selectedIdRef = useRef<string | null>(null)
	const refresh = useCallback(() => setGeneration((value) => value + 1), [])
	const items = useMemo(() => {
		const query = filterQuery.trim().toLowerCase()
		const filtered = allItems.filter(
			(item) =>
				(!typeFilter || item.subjectType === typeFilter) && (!query || `${item.subject} ${item.repository} ${item.reason} ${item.subjectType}`.toLowerCase().includes(query)),
		)
		return applySurfaceView(filtered, view, "notifications")
	}, [allItems, filterQuery, typeFilter, view])
	const selected = items[selectedIndex] ?? null
	const setSelectedIndex = useCallback(
		(next: number | ((current: number) => number)) =>
			setStoredSelectedIndex((current) => {
				const index = typeof next === "function" ? next(current) : next
				selectedIdRef.current = items[index]?.id ?? null
				return index
			}),
		[items, setStoredSelectedIndex],
	)

	useEffect(() => {
		setSelectedNotification(selected)
	}, [selected, setSelectedNotification])

	useEffect(() => {
		if (activeSurface !== "notifications") return
		const current = ++requestId.current
		setStatus(allItems.length === 0 ? "loading" : "ready")
		setError(null)
		void load(includeRead).then(
			(next) => {
				if (requestId.current !== current) return
				const selectedId = selectedIdRef.current ?? selected?.id ?? null
				setAllItems(next)
				setStoredSelectedIndex(
					selectedId
						? Math.max(
								0,
								next.findIndex((item) => item.id === selectedId),
							)
						: 0,
				)
				setSelectedIds((ids) => ids.filter((id) => next.some((item) => item.id === id && item.unread)))
				setStatus("ready")
			},
			(cause) => {
				if (requestId.current !== current) return
				setError(errorMessage(cause))
				setStatus(allItems.length === 0 ? "error" : "ready")
			},
		)
		return () => {
			requestId.current += 1
		}
		// The selected notification is captured when the request starts.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeSurface, generation, includeRead])

	useEffect(() => {
		setStoredSelectedIndex((index) => {
			const preserved = selectedIdRef.current ? items.findIndex((item) => item.id === selectedIdRef.current) : -1
			return preserved >= 0 ? preserved : Math.max(0, Math.min(items.length - 1, index))
		})
	}, [items, setStoredSelectedIndex])

	const toggleIncludeRead = () => setIncludeRead((value) => !value)
	const cycleTypeFilter = () =>
		setTypeFilter((current) => {
			if (current === null) return notificationTypes[0]
			const index = notificationTypes.indexOf(current as (typeof notificationTypes)[number])
			return index < 0 || index === notificationTypes.length - 1 ? null : notificationTypes[index + 1]!
		})
	const toggleSelection = () => {
		if (!selected || !selected.unread) return
		setSelectedIds((ids) => (ids.includes(selected.id) ? ids.filter((id) => id !== selected.id) : [...ids, selected.id]))
	}
	const markRead = async (selectedOnly: boolean) => {
		const targets = selectedOnly && selectedIds.length > 0 ? allItems.filter((item) => selectedIds.includes(item.id) && item.unread) : selected?.unread ? [selected] : []
		if (targets.length === 0) return 0
		const targetIds = new Set(targets.map((item) => item.id))
		const previous = allItems
		setAllItems((items) => items.map((item) => (targetIds.has(item.id) ? { ...item, unread: false, lastReadAt: new Date() } : item)))
		const results = await Promise.allSettled(targets.map((item) => mark(item.id)))
		const failedIds = new Set(results.flatMap((result, index) => (result.status === "rejected" ? [targets[index]!.id] : [])))
		const succeededIds = new Set([...targetIds].filter((id) => !failedIds.has(id)))
		setAllItems((items) => {
			const reconciled = items.map((item) => (failedIds.has(item.id) ? (previous.find((candidate) => candidate.id === item.id) ?? item) : item))
			return includeRead ? reconciled : reconciled.filter((item) => !succeededIds.has(item.id))
		})
		setSelectedIds([...failedIds])
		if (failedIds.size > 0) throw new Error(`${failedIds.size} notification${failedIds.size === 1 ? "" : "s"} could not be marked read`)
		return succeededIds.size
	}

	return {
		items,
		allItems,
		selected,
		selectedIndex,
		setSelectedIndex,
		selectedIds,
		includeRead,
		typeFilter,
		filterQuery,
		view,
		status,
		error,
		refresh,
		toggleIncludeRead,
		cycleTypeFilter,
		toggleSelection,
		markRead,
	}
}
