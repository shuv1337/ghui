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

const resourceKey = (item: BranchItem | MilestoneItem | EnvironmentItem | RepositoryRunner) =>
	"name" in item && "sha" in item ? item.name : "number" in item ? String(item.number) : "protectionRules" in item ? String(item.id) : String(item.id)

export interface ResourceSurfaceModel {
	readonly surface: ResourceSurfaceId
	readonly items: readonly (BranchItem | MilestoneItem | EnvironmentItem | RepositoryRunner)[]
	readonly selectedItem: BranchItem | MilestoneItem | EnvironmentItem | RepositoryRunner | null
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
	const branchView = useSurfaceView("branches").view
	const milestoneView = useSurfaceView("milestones").view
	const environmentView = useSurfaceView("environments").view
	const runnerView = useSurfaceView("runners").view
	const branches = useMemo(() => applySurfaceView(rawBranches, branchView, "branches"), [rawBranches, branchView])
	const milestones = useMemo(() => applySurfaceView(rawMilestones, milestoneView, "milestones"), [rawMilestones, milestoneView])
	const environments = useMemo(() => applySurfaceView(rawEnvironments, environmentView, "environments"), [rawEnvironments, environmentView])
	const runners = useMemo(() => applySurfaceView(rawRunners, runnerView, "runners"), [rawRunners, runnerView])
	const selectedBranch = branches[branchIndex] ?? null
	const selectedMilestone = milestones[milestoneIndex] ?? null
	const selectedEnvironment = environments[environmentIndex] ?? null
	const selectedRunner = runners[runnerIndex] ?? null
	const branchKeyRef = useRef<string | null>(null)
	const milestoneKeyRef = useRef<string | null>(null)
	const environmentKeyRef = useRef<string | null>(null)
	const runnerKeyRef = useRef<string | null>(null)
	const setVisibleBranchIndex = useCallback(
		(next: number | ((current: number) => number)) =>
			setBranchIndex((current) => {
				const index = typeof next === "function" ? next(current) : next
				branchKeyRef.current = branches[index] ? resourceKey(branches[index]!) : null
				return index
			}),
		[branches, setBranchIndex],
	)
	const setVisibleMilestoneIndex = useCallback(
		(next: number | ((current: number) => number)) =>
			setMilestoneIndex((current) => {
				const index = typeof next === "function" ? next(current) : next
				milestoneKeyRef.current = milestones[index] ? resourceKey(milestones[index]!) : null
				return index
			}),
		[milestones, setMilestoneIndex],
	)
	const setVisibleEnvironmentIndex = useCallback(
		(next: number | ((current: number) => number)) =>
			setEnvironmentIndex((current) => {
				const index = typeof next === "function" ? next(current) : next
				environmentKeyRef.current = environments[index] ? resourceKey(environments[index]!) : null
				return index
			}),
		[environments, setEnvironmentIndex],
	)
	const setVisibleRunnerIndex = useCallback(
		(next: number | ((current: number) => number)) =>
			setRunnerIndex((current) => {
				const index = typeof next === "function" ? next(current) : next
				runnerKeyRef.current = runners[index] ? resourceKey(runners[index]!) : null
				return index
			}),
		[runners, setRunnerIndex],
	)
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
	const isResource = activeSurface === "branches" || activeSurface === "milestones" || activeSurface === "environments" || activeSurface === "runners"

	useEffect(() => setSelectedBranch(selectedBranch), [selectedBranch, setSelectedBranch])
	useEffect(() => setSelectedMilestone(selectedMilestone), [selectedMilestone, setSelectedMilestone])
	useEffect(() => setSelectedEnvironment(selectedEnvironment), [selectedEnvironment, setSelectedEnvironment])
	useEffect(() => setSelectedRunner(selectedRunner), [selectedRunner, setSelectedRunner])

	useEffect(() => {
		setBranchIndex((current) => {
			const preserved = branchKeyRef.current ? branches.findIndex((item) => resourceKey(item) === branchKeyRef.current) : -1
			const next = preserved >= 0 ? preserved : Math.max(0, Math.min(branches.length - 1, current))
			branchKeyRef.current = branches[next] ? resourceKey(branches[next]!) : null
			return next
		})
	}, [branches, setBranchIndex])
	useEffect(() => {
		setMilestoneIndex((current) => {
			const preserved = milestoneKeyRef.current ? milestones.findIndex((item) => resourceKey(item) === milestoneKeyRef.current) : -1
			const next = preserved >= 0 ? preserved : Math.max(0, Math.min(milestones.length - 1, current))
			milestoneKeyRef.current = milestones[next] ? resourceKey(milestones[next]!) : null
			return next
		})
	}, [milestones, setMilestoneIndex])
	useEffect(() => {
		setEnvironmentIndex((current) => {
			const preserved = environmentKeyRef.current ? environments.findIndex((item) => resourceKey(item) === environmentKeyRef.current) : -1
			const next = preserved >= 0 ? preserved : Math.max(0, Math.min(environments.length - 1, current))
			environmentKeyRef.current = environments[next] ? resourceKey(environments[next]!) : null
			return next
		})
	}, [environments, setEnvironmentIndex])
	useEffect(() => {
		setRunnerIndex((current) => {
			const preserved = runnerKeyRef.current ? runners.findIndex((item) => resourceKey(item) === runnerKeyRef.current) : -1
			const next = preserved >= 0 ? preserved : Math.max(0, Math.min(runners.length - 1, current))
			runnerKeyRef.current = runners[next] ? resourceKey(runners[next]!) : null
			return next
		})
	}, [runners, setRunnerIndex])

	useEffect(() => {
		if (!repository || !isResource) return
		const surface = activeSurface
		const currentItems = surface === "branches" ? branches : surface === "milestones" ? milestones : surface === "environments" ? environments : runners
		const currentRequest = ++requestId.current
		setStatusBySurface((value) => ({ ...value, [surface]: currentItems.length === 0 ? "loading" : "ready" }))
		setErrorBySurface((value) => ({ ...value, [surface]: null }))
		const request =
			surface === "branches"
				? loadBranches(repository)
				: surface === "milestones"
					? loadMilestones(repository)
					: surface === "environments"
						? loadEnvironments(repository)
						: loadRunners(repository)
		void request.then(
			(next) => {
				if (requestId.current !== currentRequest) return
				const selectedKey =
					surface === "branches"
						? branchKeyRef.current
						: surface === "milestones"
							? milestoneKeyRef.current
							: surface === "environments"
								? environmentKeyRef.current
								: runnerKeyRef.current
				const visibleNext =
					surface === "branches"
						? applySurfaceView(next as readonly BranchItem[], branchView, "branches")
						: surface === "milestones"
							? applySurfaceView(next as readonly MilestoneItem[], milestoneView, "milestones")
							: surface === "environments"
								? applySurfaceView(next as readonly EnvironmentItem[], environmentView, "environments")
								: applySurfaceView(next as readonly RepositoryRunner[], runnerView, "runners")
				const nextIndex = selectedKey
					? Math.max(
							0,
							visibleNext.findIndex((item) => resourceKey(item) === selectedKey),
						)
					: 0
				if (surface === "branches") {
					setBranches(next as readonly BranchItem[])
					setBranchIndex(nextIndex)
					branchKeyRef.current = visibleNext[nextIndex] ? resourceKey(visibleNext[nextIndex]!) : null
				} else if (surface === "milestones") {
					setMilestones(next as readonly MilestoneItem[])
					setMilestoneIndex(nextIndex)
					milestoneKeyRef.current = visibleNext[nextIndex] ? resourceKey(visibleNext[nextIndex]!) : null
				} else if (surface === "environments") {
					setEnvironments(next as readonly EnvironmentItem[])
					setEnvironmentIndex(nextIndex)
					environmentKeyRef.current = visibleNext[nextIndex] ? resourceKey(visibleNext[nextIndex]!) : null
				} else {
					setRunners(next as readonly RepositoryRunner[])
					setRunnerIndex(nextIndex)
					runnerKeyRef.current = visibleNext[nextIndex] ? resourceKey(visibleNext[nextIndex]!) : null
				}
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
		// Selection objects are intentionally captured at refresh start so a late
		// response preserves that identity instead of chasing render-time movement.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeSurface, generation, repository, branchView, milestoneView, environmentView, runnerView])

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

	const active: ResourceSurfaceModel | null = !isResource
		? null
		: activeSurface === "branches"
			? {
					surface: "branches",
					items: branches,
					selectedItem: selectedBranch,
					selectedIndex: branchIndex,
					setSelectedIndex: setVisibleBranchIndex,
					status: statusBySurface.branches,
					error: errorBySurface.branches,
					view: branchView,
					refresh,
				}
			: activeSurface === "milestones"
				? {
						surface: "milestones",
						items: milestones,
						selectedItem: selectedMilestone,
						selectedIndex: milestoneIndex,
						setSelectedIndex: setVisibleMilestoneIndex,
						status: statusBySurface.milestones,
						error: errorBySurface.milestones,
						view: milestoneView,
						refresh,
					}
				: activeSurface === "environments"
					? {
							surface: "environments",
							items: environments,
							selectedItem: selectedEnvironment,
							selectedIndex: environmentIndex,
							setSelectedIndex: setVisibleEnvironmentIndex,
							status: statusBySurface.environments,
							error: errorBySurface.environments,
							view: environmentView,
							refresh,
						}
					: {
							surface: "runners",
							items: runners,
							selectedItem: selectedRunner,
							selectedIndex: runnerIndex,
							setSelectedIndex: setVisibleRunnerIndex,
							status: statusBySurface.runners,
							error: errorBySurface.runners,
							view: runnerView,
							refresh,
						}

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
