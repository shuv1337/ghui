import { useAtom, useAtomSet } from "@effect/atom-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
	BranchItem,
	CreateBranchInput,
	CreateMilestoneInput,
	DeploymentItem,
	EditMilestoneInput,
	EnvironmentItem,
	LoadStatus,
	MilestoneIssue,
	MilestoneItem,
	RepositoryRunner,
} from "../../domain.js"
import { errorMessage } from "../../errors.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"
import {
	branchItemsAtom,
	branchSelectionAtom,
	createBranchAtom,
	createMilestoneAtom,
	deleteBranchAtom,
	deleteMilestoneAtom,
	deploymentItemsAtom,
	editMilestoneAtom,
	environmentItemsAtom,
	environmentSelectionAtom,
	loadBranchesAtom,
	loadDeploymentsAtom,
	loadEnvironmentsAtom,
	loadMilestoneIssuesAtom,
	loadMilestonesAtom,
	loadRunnersAtom,
	milestoneIssuesAtom,
	milestoneItemsAtom,
	milestoneSelectionAtom,
	runnerItemsAtom,
	runnerSelectionAtom,
	selectedBranchAtom,
	selectedEnvironmentAtom,
	selectedMilestoneAtom,
	selectedRunnerAtom,
} from "./atoms.js"
import { useSurfaceView } from "../../settings/useSurfaceView.js"
import { applySurfaceView } from "../../settings/viewConfig.js"
import type { SurfaceViewConfig } from "../../configStore.js"

export type ResourceSurfaceId = Extract<WorkspaceSurface, "branches" | "milestones" | "environments" | "runners">

type ResourceItem = BranchItem | MilestoneItem | EnvironmentItem | RepositoryRunner
type Setter<T> = (next: T | ((current: T) => T)) => void

interface ResourceListState<T extends ResourceItem> {
	readonly items: readonly T[]
	readonly selectedItem: T | null
	readonly selectedIndex: number
	readonly setSelectedIndex: Setter<number>
	readonly view: SurfaceViewConfig
	readonly replaceLoaded: (items: readonly T[]) => void
}

const useResourceListState = <T extends ResourceItem>({
	surface,
	rawItems,
	setRawItems,
	selectedIndex,
	setSelectedIndex,
	setSelectedAtom,
	keyOf,
}: {
	readonly surface: ResourceSurfaceId
	readonly rawItems: readonly T[]
	readonly setRawItems: Setter<readonly T[]>
	readonly selectedIndex: number
	readonly setSelectedIndex: Setter<number>
	readonly setSelectedAtom: (item: T | null) => void
	readonly keyOf: (item: T) => string
}): ResourceListState<T> => {
	const { view } = useSurfaceView(surface)
	const items = useMemo(() => applySurfaceView(rawItems, view, surface), [rawItems, view, surface])
	const selectedItem = items[selectedIndex] ?? null
	const selectedKeyRef = useRef<string | null>(null)
	const setVisibleIndex = useCallback(
		(next: number | ((current: number) => number)) =>
			setSelectedIndex((current) => {
				const index = typeof next === "function" ? next(current) : next
				selectedKeyRef.current = items[index] ? keyOf(items[index]!) : null
				return index
			}),
		[items, keyOf, setSelectedIndex],
	)
	const replaceLoaded = useCallback(
		(next: readonly T[]) => {
			const visibleNext = applySurfaceView(next, view, surface)
			const preserved = selectedKeyRef.current ? visibleNext.findIndex((item) => keyOf(item) === selectedKeyRef.current) : -1
			const nextIndex = preserved >= 0 ? preserved : 0
			setRawItems(next)
			setSelectedIndex(nextIndex)
			selectedKeyRef.current = visibleNext[nextIndex] ? keyOf(visibleNext[nextIndex]!) : null
		},
		[keyOf, setRawItems, setSelectedIndex, surface, view],
	)

	useEffect(() => setSelectedAtom(selectedItem), [selectedItem, setSelectedAtom])
	useEffect(() => {
		setSelectedIndex((current) => {
			const preserved = selectedKeyRef.current ? items.findIndex((item) => keyOf(item) === selectedKeyRef.current) : -1
			const next = preserved >= 0 ? preserved : Math.max(0, Math.min(items.length - 1, current))
			selectedKeyRef.current = items[next] ? keyOf(items[next]!) : null
			return next
		})
	}, [items, keyOf, setSelectedIndex])

	return { items, selectedItem, selectedIndex, setSelectedIndex: setVisibleIndex, view, replaceLoaded }
}

const isResourceSurface = (surface: WorkspaceSurface): surface is ResourceSurfaceId =>
	surface === "branches" || surface === "milestones" || surface === "environments" || surface === "runners"

const branchKey = (branch: BranchItem) => branch.name
const milestoneKey = (milestone: MilestoneItem) => String(milestone.number)
const environmentKey = (environment: EnvironmentItem) => String(environment.id)
const runnerKey = (runner: RepositoryRunner) => String(runner.id)

export interface ResourceSurfaceModel {
	readonly surface: ResourceSurfaceId
	readonly items: readonly ResourceItem[]
	readonly selectedItem: ResourceItem | null
	readonly selectedIndex: number
	readonly setSelectedIndex: (index: number | ((current: number) => number)) => void
	readonly status: LoadStatus
	readonly error: string | null
	readonly view: SurfaceViewConfig
	readonly refresh: () => void
}

export interface RepositoryResourcesModel {
	readonly active: ResourceSurfaceModel | null
	readonly branches: readonly BranchItem[]
	readonly selectedBranch: BranchItem | null
	readonly milestones: readonly MilestoneItem[]
	readonly selectedMilestone: MilestoneItem | null
	readonly milestoneIssues: readonly MilestoneIssue[]
	readonly environments: readonly EnvironmentItem[]
	readonly selectedEnvironment: EnvironmentItem | null
	readonly deployments: readonly DeploymentItem[]
	readonly runners: readonly RepositoryRunner[]
	readonly selectedRunner: RepositoryRunner | null
	readonly createBranch: (input: CreateBranchInput) => Promise<BranchItem>
	readonly deleteBranch: (input: { readonly repository: string; readonly branch: BranchItem; readonly selectedBranchName: string | null }) => Promise<void>
	readonly createMilestone: (input: CreateMilestoneInput) => Promise<MilestoneItem>
	readonly editMilestone: (input: EditMilestoneInput) => Promise<MilestoneItem>
	readonly deleteMilestone: (input: { readonly repository: string; readonly number: number }) => Promise<void>
}

export const useResourceSurfaces = (repository: string | null, activeSurface: WorkspaceSurface): RepositoryResourcesModel => {
	const [rawBranches, setBranches] = useAtom(branchItemsAtom)
	const [branchIndex, setBranchIndex] = useAtom(branchSelectionAtom)
	const setSelectedBranch = useAtomSet(selectedBranchAtom)
	const [rawMilestones, setMilestones] = useAtom(milestoneItemsAtom)
	const [milestoneIndex, setMilestoneIndex] = useAtom(milestoneSelectionAtom)
	const setSelectedMilestone = useAtomSet(selectedMilestoneAtom)
	const [milestoneIssues, setMilestoneIssues] = useAtom(milestoneIssuesAtom)
	const [rawEnvironments, setEnvironments] = useAtom(environmentItemsAtom)
	const [environmentIndex, setEnvironmentIndex] = useAtom(environmentSelectionAtom)
	const setSelectedEnvironment = useAtomSet(selectedEnvironmentAtom)
	const [deployments, setDeployments] = useAtom(deploymentItemsAtom)
	const [rawRunners, setRunners] = useAtom(runnerItemsAtom)
	const [runnerIndex, setRunnerIndex] = useAtom(runnerSelectionAtom)
	const setSelectedRunner = useAtomSet(selectedRunnerAtom)
	const branchState = useResourceListState({
		surface: "branches",
		rawItems: rawBranches,
		setRawItems: setBranches,
		selectedIndex: branchIndex,
		setSelectedIndex: setBranchIndex,
		setSelectedAtom: setSelectedBranch,
		keyOf: branchKey,
	})
	const milestoneState = useResourceListState({
		surface: "milestones",
		rawItems: rawMilestones,
		setRawItems: setMilestones,
		selectedIndex: milestoneIndex,
		setSelectedIndex: setMilestoneIndex,
		setSelectedAtom: setSelectedMilestone,
		keyOf: milestoneKey,
	})
	const environmentState = useResourceListState({
		surface: "environments",
		rawItems: rawEnvironments,
		setRawItems: setEnvironments,
		selectedIndex: environmentIndex,
		setSelectedIndex: setEnvironmentIndex,
		setSelectedAtom: setSelectedEnvironment,
		keyOf: environmentKey,
	})
	const runnerState = useResourceListState({
		surface: "runners",
		rawItems: rawRunners,
		setRawItems: setRunners,
		selectedIndex: runnerIndex,
		setSelectedIndex: setRunnerIndex,
		setSelectedAtom: setSelectedRunner,
		keyOf: runnerKey,
	})
	const { items: branches, selectedItem: selectedBranch } = branchState
	const { items: milestones, selectedItem: selectedMilestone } = milestoneState
	const { items: environments, selectedItem: selectedEnvironment } = environmentState
	const { items: runners, selectedItem: selectedRunner } = runnerState
	const loadBranches = useAtomSet(loadBranchesAtom, { mode: "promise" })
	const loadMilestones = useAtomSet(loadMilestonesAtom, { mode: "promise" })
	const loadMilestoneIssues = useAtomSet(loadMilestoneIssuesAtom, { mode: "promise" })
	const loadEnvironments = useAtomSet(loadEnvironmentsAtom, { mode: "promise" })
	const loadDeployments = useAtomSet(loadDeploymentsAtom, { mode: "promise" })
	const loadRunners = useAtomSet(loadRunnersAtom, { mode: "promise" })
	const createBranch = useAtomSet(createBranchAtom, { mode: "promise" })
	const deleteBranch = useAtomSet(deleteBranchAtom, { mode: "promise" })
	const createMilestone = useAtomSet(createMilestoneAtom, { mode: "promise" })
	const editMilestone = useAtomSet(editMilestoneAtom, { mode: "promise" })
	const deleteMilestone = useAtomSet(deleteMilestoneAtom, { mode: "promise" })
	const [statusBySurface, setStatusBySurface] = useState<Record<ResourceSurfaceId, LoadStatus>>({
		branches: "loading",
		milestones: "loading",
		environments: "loading",
		runners: "loading",
	})
	const [errorBySurface, setErrorBySurface] = useState<Record<ResourceSurfaceId, string | null>>({
		branches: null,
		milestones: null,
		environments: null,
		runners: null,
	})
	const [generation, setGeneration] = useState(0)
	const requestId = useRef(0)
	const refresh = useCallback(() => setGeneration((value) => value + 1), [])
	const isResource = isResourceSurface(activeSurface)
	const resourceDescriptors: Readonly<
		Record<
			ResourceSurfaceId,
			{
				readonly items: readonly ResourceItem[]
				readonly selectedItem: ResourceItem | null
				readonly selectedIndex: number
				readonly setSelectedIndex: Setter<number>
				readonly view: SurfaceViewConfig
				readonly load: (repository: string) => Promise<readonly ResourceItem[]>
				readonly replaceLoaded: (items: readonly ResourceItem[]) => void
			}
		>
	> = {
		branches: {
			...branchState,
			load: loadBranches,
			replaceLoaded: (items) => branchState.replaceLoaded(items as readonly BranchItem[]),
		},
		milestones: {
			...milestoneState,
			load: loadMilestones,
			replaceLoaded: (items) => milestoneState.replaceLoaded(items as readonly MilestoneItem[]),
		},
		environments: {
			...environmentState,
			load: loadEnvironments,
			replaceLoaded: (items) => environmentState.replaceLoaded(items as readonly EnvironmentItem[]),
		},
		runners: {
			...runnerState,
			load: loadRunners,
			replaceLoaded: (items) => runnerState.replaceLoaded(items as readonly RepositoryRunner[]),
		},
	}

	useEffect(() => {
		if (!repository || !isResource) return
		const surface = activeSurface
		const descriptor = resourceDescriptors[surface]
		const currentItems = descriptor.items
		const currentRequest = ++requestId.current
		setStatusBySurface((value) => ({ ...value, [surface]: currentItems.length === 0 ? "loading" : "ready" }))
		setErrorBySurface((value) => ({ ...value, [surface]: null }))
		void descriptor.load(repository).then(
			(next) => {
				if (requestId.current !== currentRequest) return
				descriptor.replaceLoaded(next)
				setStatusBySurface((value) => ({ ...value, [surface]: "ready" }))
			},
			(cause) => {
				if (requestId.current !== currentRequest) return
				setErrorBySurface((value) => ({ ...value, [surface]: errorMessage(cause) }))
				setStatusBySurface((value) => ({ ...value, [surface]: currentItems.length === 0 ? "error" : "ready" }))
			},
		)
		return () => {
			requestId.current += 1
		}
		// Each replaceLoaded callback captures its current view while preserving
		// selection identity through the resource-specific descriptor key.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeSurface, generation, repository, branchState.replaceLoaded, milestoneState.replaceLoaded, environmentState.replaceLoaded, runnerState.replaceLoaded])

	useEffect(() => {
		if (activeSurface !== "milestones" || !selectedMilestone) {
			setMilestoneIssues([])
			return
		}
		let active = true
		void loadMilestoneIssues({ repository: selectedMilestone.repository, title: selectedMilestone.title }).then(
			(value) => {
				if (active) setMilestoneIssues(value)
			},
			() => {
				if (active) setMilestoneIssues([])
			},
		)
		return () => {
			active = false
		}
	}, [activeSurface, loadMilestoneIssues, selectedMilestone, setMilestoneIssues])

	useEffect(() => {
		if (activeSurface !== "environments" || !selectedEnvironment) {
			setDeployments([])
			return
		}
		let active = true
		void loadDeployments({ repository: selectedEnvironment.repository, environment: selectedEnvironment.name }).then(
			(value) => {
				if (active) setDeployments(value)
			},
			() => {
				if (active) setDeployments([])
			},
		)
		return () => {
			active = false
		}
	}, [activeSurface, loadDeployments, selectedEnvironment, setDeployments])

	const activeDescriptor = isResource ? resourceDescriptors[activeSurface] : null
	const active: ResourceSurfaceModel | null = activeDescriptor
		? {
				surface: activeSurface as ResourceSurfaceId,
				items: activeDescriptor.items,
				selectedItem: activeDescriptor.selectedItem,
				selectedIndex: activeDescriptor.selectedIndex,
				setSelectedIndex: activeDescriptor.setSelectedIndex,
				status: statusBySurface[activeSurface as ResourceSurfaceId],
				error: errorBySurface[activeSurface as ResourceSurfaceId],
				view: activeDescriptor.view,
				refresh,
			}
		: null

	return {
		active,
		branches,
		selectedBranch,
		milestones,
		selectedMilestone,
		milestoneIssues,
		environments,
		selectedEnvironment,
		deployments,
		runners,
		selectedRunner,
		createBranch,
		deleteBranch,
		createMilestone,
		editMilestone,
		deleteMilestone,
	}
}
