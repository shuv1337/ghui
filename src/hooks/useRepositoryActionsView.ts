import { useAtom, useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Cause } from "effect"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { ActionJobLog, Workflow, WorkflowRun, WorkflowRunDetails } from "../domain.js"
import { errorMessage } from "../errors.js"
import type { RunsViewCtx } from "../keymap/runsView.js"
import { openUrlAtom } from "../services/systemAtoms.js"
import {
	cancelRunAtom,
	getJobLogAtom,
	repositoryRunsFor,
	repositoryRunsFocusedIdAtom,
	repositoryActionsStatusFilterAtom,
	repositoryActionsWorkflowFilterAtom,
	repositoryRunsSelectionAtom,
	repositorySelectedRunIdAtom,
	repositoryWorkflowsFor,
	retryRunAtom,
	runDetailKey,
	runDetailSelectionAtom,
	workflowRunDetailsFor,
} from "../ui/runs/atoms.js"
import { failureRowIndices, flattenRunRows, type RunDetailRow } from "../ui/runs/runsRows.js"
import { useSurfaceView } from "../settings/useSurfaceView.js"
import { applySurfaceView } from "../settings/viewConfig.js"

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, Math.max(0, max)))
type ResultState<A> =
	| { readonly status: "loading" }
	| { readonly status: "error"; readonly message: string }
	| { readonly status: "ready"; readonly value: A; readonly refreshing: boolean }
const toState = <A, E>(result: AsyncResult.AsyncResult<A, E>, message: string): ResultState<A> => {
	if (AsyncResult.isSuccess(result)) return { status: "ready", value: result.value, refreshing: result.waiting }
	if (AsyncResult.isFailure(result)) return { status: "error", message: errorMessage(Cause.squash(result.cause)) || message }
	return { status: "loading" }
}

export interface RepositoryActionsViewModel {
	readonly ctx: RunsViewCtx
	readonly inDetail: boolean
	readonly runsState: ResultState<readonly WorkflowRun[]>
	readonly workflowsState: ResultState<readonly Workflow[]>
	readonly detailState: ResultState<WorkflowRunDetails> | null
	readonly runsSelection: number
	readonly detailSelection: number
	readonly detailRows: readonly RunDetailRow[]
	readonly selectedRun: WorkflowRun | null
	readonly jobLog: ActionJobLog | null
	readonly jobLogError: string | null
	readonly jobLogLoading: boolean
	readonly jobLogScrollTop: number
	readonly filterSummary: string
	readonly hasVisibleInProgressRun: boolean
	readonly filtersActive: boolean
	readonly selectRow: (index: number) => void
	readonly activateRow: (index: number) => void
	readonly retrySelectedRun: (failedOnly: boolean) => Promise<void>
	readonly cancelSelectedRun: () => Promise<void>
}

export const useRepositoryActionsView = (repository: string | null, halfPage: number, searchQuery = ""): RepositoryActionsViewModel => {
	const repositoryKey = repository ?? ""
	const runsAtom = repositoryRunsFor(repositoryKey)
	const workflowsAtom = repositoryWorkflowsFor(repositoryKey)
	const runsResult = useAtomValue(runsAtom)
	const workflowsResult = useAtomValue(workflowsAtom)
	const refreshRuns = useAtomRefresh(runsAtom)
	const [selectedRunId, setSelectedRunId] = useAtom(repositorySelectedRunIdAtom)
	const [runsSelection, setRunsSelection] = useAtom(repositoryRunsSelectionAtom)
	const [focusedRunId, setFocusedRunId] = useAtom(repositoryRunsFocusedIdAtom)
	const [detailSelection, setDetailSelection] = useAtom(runDetailSelectionAtom)
	const getJobLog = useAtomSet(getJobLogAtom, { mode: "promise" })
	const retryRun = useAtomSet(retryRunAtom, { mode: "promise" })
	const cancelRun = useAtomSet(cancelRunAtom, { mode: "promise" })
	const openUrl = useAtomSet(openUrlAtom, { mode: "promise" })
	const [jobLog, setJobLog] = useState<ActionJobLog | null>(null)
	const [jobLogError, setJobLogError] = useState<string | null>(null)
	const [jobLogLoading, setJobLogLoading] = useState(false)
	const [jobLogScrollTop, setJobLogScrollTop] = useState(0)
	const [statusFilter, setStatusFilter] = useAtom(repositoryActionsStatusFilterAtom)
	const [workflowFilter, setWorkflowFilter] = useAtom(repositoryActionsWorkflowFilterAtom)
	const { view } = useSurfaceView("actions")

	useEffect(() => {
		setStatusFilter("all")
		setWorkflowFilter(null)
		setSelectedRunId(null)
		setFocusedRunId(null)
		setRunsSelection(0)
	}, [repositoryKey, setStatusFilter, setWorkflowFilter, setSelectedRunId, setFocusedRunId, setRunsSelection])

	const unfilteredRunsState = useMemo(() => toState(runsResult, "Failed to load repository runs"), [runsResult])
	const workflowsState = useMemo(() => toState(workflowsResult, "Failed to load workflows"), [workflowsResult])
	const unfilteredRuns = unfilteredRunsState.status === "ready" ? unfilteredRunsState.value : []
	const runs = useMemo(
		() =>
			applySurfaceView(
				unfilteredRuns.filter(
					(run) =>
						(workflowFilter === null || run.workflowName === workflowFilter) &&
						(statusFilter === "all" || (statusFilter === "in_progress" ? run.status === "in_progress" || run.status === "queued" : run.conclusion === statusFilter)) &&
						(searchQuery.trim().length === 0 ||
							[run.workflowName, run.displayTitle, run.headBranch, run.event, run.headSha].some((value) => value.toLowerCase().includes(searchQuery.trim().toLowerCase()))),
				),
				view,
				"actions",
			),
		[unfilteredRuns, workflowFilter, statusFilter, searchQuery, view],
	)
	const runsState: ResultState<readonly WorkflowRun[]> =
		unfilteredRunsState.status === "ready" ? { status: "ready", value: runs, refreshing: unfilteredRunsState.refreshing } : unfilteredRunsState
	const filterSummary = `workflow: ${workflowFilter ?? "all"} · status: ${statusFilter === "in_progress" ? "active" : statusFilter}${
		searchQuery.trim() ? ` · search: ${searchQuery.trim()}` : ""
	}`
	const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs.find((run) => run.id === focusedRunId) ?? runs[clamp(runsSelection, runs.length - 1)] ?? null
	const inDetail = selectedRunId !== null
	useEffect(() => {
		if (inDetail || runs.length === 0) return
		const preservedIndex = focusedRunId === null ? -1 : runs.findIndex((run) => run.id === focusedRunId)
		const nextIndex = preservedIndex >= 0 ? preservedIndex : clamp(runsSelection, runs.length - 1)
		const nextId = runs[nextIndex]?.id ?? null
		if (nextIndex !== runsSelection) setRunsSelection(nextIndex)
		if (nextId !== focusedRunId) setFocusedRunId(nextId)
	}, [inDetail, runs, focusedRunId, runsSelection, setRunsSelection, setFocusedRunId])
	const detailKey = repository && selectedRunId !== null ? runDetailKey(repository, selectedRunId) : "\u0000\u0000"
	const detailResult = useAtomValue(workflowRunDetailsFor(detailKey))
	const detailState = selectedRunId === null ? null : toState(detailResult, "Failed to load run details")
	const detailRun = detailState?.status === "ready" ? detailState.value : null
	const detailRows = useMemo(() => (detailRun ? flattenRunRows(detailRun) : []), [detailRun])

	const back = useCallback(() => {
		if (jobLog) {
			setJobLog(null)
			setJobLogError(null)
			setJobLogScrollTop(0)
			return
		}
		if (selectedRunId !== null) {
			setSelectedRunId(null)
			setDetailSelection(0)
		}
	}, [jobLog, selectedRunId, setSelectedRunId, setDetailSelection])

	const moveSelection = useCallback(
		(delta: number) => {
			if (jobLog) {
				const lineCount = jobLog.text.split(/\r?\n/).length
				setJobLogScrollTop((current) => clamp(current + delta, lineCount - Math.max(1, halfPage * 2)))
			} else if (inDetail) setDetailSelection((current) => clamp(current + delta, detailRows.length - 1))
			else
				setRunsSelection((current) => {
					const next = clamp(current + delta, runs.length - 1)
					setFocusedRunId(runs[next]?.id ?? null)
					return next
				})
		},
		[jobLog, inDetail, detailRows.length, runs, halfPage, setDetailSelection, setRunsSelection, setFocusedRunId],
	)
	const moveSelectionToBoundary = useCallback(
		(boundary: "first" | "last") => {
			if (jobLog) {
				setJobLogScrollTop(boundary === "first" ? 0 : Math.max(0, jobLog.text.split(/\r?\n/).length - Math.max(1, halfPage * 2)))
			} else if (inDetail) setDetailSelection(boundary === "first" ? 0 : Math.max(0, detailRows.length - 1))
			else {
				const next = boundary === "first" ? 0 : Math.max(0, runs.length - 1)
				setRunsSelection(next)
				setFocusedRunId(runs[next]?.id ?? null)
			}
		},
		[jobLog, inDetail, detailRows.length, runs, halfPage, setDetailSelection, setRunsSelection, setFocusedRunId],
	)
	const openRow = useCallback(
		(index: number) => {
			if (!repository) return
			if (!inDetail) {
				const run = runs[index]
				if (!run) return
				setSelectedRunId(run.id)
				setDetailSelection(0)
				setJobLog(null)
				return
			}
			const row = detailRows[index]
			if (!row) return
			const jobId = row.job.id
			setJobLogLoading(true)
			setJobLogError(null)
			setJobLogScrollTop(0)
			void getJobLog({ repository, jobId })
				.then(setJobLog)
				.catch((error) => setJobLogError(errorMessage(error)))
				.finally(() => setJobLogLoading(false))
		},
		[repository, inDetail, runs, detailRows, setSelectedRunId, setDetailSelection, getJobLog],
	)
	const jumpFailure = useCallback(
		(direction: 1 | -1) => {
			const failures = failureRowIndices(detailRows)
			if (!inDetail || failures.length === 0) return
			const next =
				direction === 1
					? (failures.find((index) => index > detailSelection) ?? failures[0]!)
					: ([...failures].reverse().find((index) => index < detailSelection) ?? failures[failures.length - 1]!)
			setDetailSelection(next)
		},
		[inDetail, detailRows, detailSelection, setDetailSelection],
	)
	const retrySelectedRun = async (failedOnly: boolean) => {
		if (!repository || !selectedRun) return
		await retryRun({ repository, runId: selectedRun.id, failedOnly })
		refreshRuns()
	}
	const cancelSelectedRun = async () => {
		if (!repository || !selectedRun) return
		await cancelRun({ repository, runId: selectedRun.id })
		refreshRuns()
	}
	const ctx = useMemo<RunsViewCtx>(
		() => ({
			halfPage,
			inDetail,
			handleEscape: back,
			moveSelection,
			moveSelectionToBoundary,
			openSelected: () => openRow(inDetail ? detailSelection : runsSelection),
			nextFailure: () => jumpFailure(1),
			previousFailure: () => jumpFailure(-1),
			refresh: refreshRuns,
			openInBrowser: () => {
				const url = inDetail ? detailRun?.url : selectedRun?.url
				if (url) void openUrl(url)
			},
			repositoryActions: true,
		}),
		[halfPage, inDetail, back, moveSelection, moveSelectionToBoundary, openRow, detailSelection, runsSelection, jumpFailure, refreshRuns, detailRun, selectedRun, openUrl],
	)
	return {
		ctx,
		inDetail,
		runsState,
		workflowsState,
		detailState,
		runsSelection: clamp(runsSelection, runs.length - 1),
		detailSelection: clamp(detailSelection, detailRows.length - 1),
		detailRows,
		selectedRun,
		jobLog,
		jobLogError,
		jobLogLoading,
		jobLogScrollTop,
		filterSummary,
		hasVisibleInProgressRun: runs.some((run) => run.status !== "completed"),
		filtersActive: statusFilter !== "all" || workflowFilter !== null || searchQuery.trim().length > 0,
		selectRow: (index) => {
			if (inDetail) {
				setDetailSelection(clamp(index, detailRows.length - 1))
				return
			}
			const next = clamp(index, runs.length - 1)
			setRunsSelection(next)
			setFocusedRunId(runs[next]?.id ?? null)
		},
		activateRow: openRow,
		retrySelectedRun,
		cancelSelectedRun,
	}
}
