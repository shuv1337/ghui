import * as Atom from "effect/unstable/reactivity/Atom"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Effect, Stream } from "effect"
import { CacheService } from "../../services/CacheService.js"
import { cacheFirstStream } from "../../services/cacheFirst.js"
import { GitHubService } from "../../services/GitHubService.js"
import { githubRuntime } from "../../services/runtime.js"
import type { WorkflowDispatchInput } from "../../domain.js"
import { selectedRepositoryAtom } from "../../workspace/atoms.js"

// === UI state ===

// `runs` is a full-screen PR view mode, a peer of `diff` / `comments`. The flag
// lives here (read by useViewModeState + PullRequestSurface + the keymap layer).
export const runsFullViewAtom = Atom.make(false)

// Which run (if any) is drilled into — null = runs list (view A); set = run detail
// (view B). Cleared when the runs view closes.
export const selectedRunIdAtom = Atom.make<number | null>(null)

// Cursors. `runsListSelectionAtom` walks the runs list; `runDetailSelectionAtom`
// walks the flattened job/step rows inside a run.
export const runsListSelectionAtom = Atom.make(0)
export const runDetailSelectionAtom = Atom.make(0)
export const repositoryRunsSelectionAtom = Atom.make(0)
export const repositoryRunsFocusedIdAtom = Atom.make<number | null>(null)
export const repositorySelectedRunIdAtom = Atom.make<number | null>(null)
export type RepositoryActionsStatusFilter = "all" | "in_progress" | "failure" | "success" | "cancelled"
export const repositoryActionsStatusFilterAtom = Atom.make<RepositoryActionsStatusFilter>("all")
export const repositoryActionsWorkflowFilterAtom = Atom.make<string | null>(null)

// === Keying ===
//
// Runs are scoped to a PR revision (repo + number + head SHA) so a force-push
// gets fresh runs. Run details / logs are keyed by run id under the repository.

export const runsKey = (pr: { repository: string; number: number; headRefOid: string }) => `${pr.repository}\u0000${pr.number}\u0000${pr.headRefOid}`

const parseRunsKey = (key: string): { repository: string; headSha: string } => {
	const [repository, , headSha] = key.split("\u0000")
	return { repository: repository ?? "", headSha: headSha ?? "" }
}

export const runDetailKey = (repository: string, runId: number) => `${repository}\u0000${runId}`

const parseRunDetailKey = (key: string): { repository: string; runId: number } => {
	const [repository, runId] = key.split("\u0000")
	return { repository: repository ?? "", runId: Number(runId ?? 0) }
}

// === Data families ===

export const pullRequestRunsFor = Atom.family((key: string) => {
	const { repository, headSha } = parseRunsKey(key)
	return githubRuntime.atom(GitHubService.use((github) => github.listWorkflowRunsForCommit(repository, headSha))).pipe(Atom.setIdleTTL(0))
})

export const repositoryRunsFor = Atom.family((repository: string) =>
	githubRuntime
		.atom(
			Stream.unwrap(
				Effect.gen(function* () {
					const cache = yield* CacheService
					const github = yield* GitHubService
					const cached = yield* cache.readActionRuns(repository).pipe(Effect.catch(() => Effect.succeed(null)))
					const live = Stream.fromEffect(github.listWorkflowRuns(repository).pipe(Effect.tap((data) => cache.writeActionRuns({ repository, data, fetchedAt: new Date() }))))
					return cacheFirstStream(cached?.data ?? null, live)
				}),
			),
		)
		.pipe(Atom.setIdleTTL(0)),
)

export const repositoryWorkflowsFor = Atom.family((repository: string) =>
	githubRuntime.atom(GitHubService.use((github) => github.listWorkflows(repository))).pipe(Atom.setIdleTTL(0)),
)

export const selectedRepositoryRunAtom = Atom.make((get) => {
	const repository = get(selectedRepositoryAtom)
	if (!repository) return null
	const result = get(repositoryRunsFor(repository))
	if (!AsyncResult.isSuccess(result)) return null
	const selectedRunId = get(repositorySelectedRunIdAtom)
	const focusedRunId = get(repositoryRunsFocusedIdAtom)
	const selection = get(repositoryRunsSelectionAtom)
	return (
		result.value.find((run) => run.id === selectedRunId) ??
		result.value.find((run) => run.id === focusedRunId) ??
		result.value[Math.max(0, Math.min(selection, result.value.length - 1))] ??
		null
	)
})

export const getJobLogAtom = githubRuntime.fn<{ readonly repository: string; readonly jobId: number }>()((input) =>
	GitHubService.use((github) => github.getJobLog(input.repository, input.jobId)),
)
export const retryRunAtom = githubRuntime.fn<{ readonly repository: string; readonly runId: number; readonly failedOnly: boolean }>()((input) =>
	GitHubService.use((github) => github.retryRun(input.repository, input.runId, input.failedOnly)).pipe(
		Effect.tap(() => CacheService.use((cache) => cache.invalidateActionRuns(input.repository, input.runId))),
	),
)
export const cancelRunAtom = githubRuntime.fn<{ readonly repository: string; readonly runId: number }>()((input) =>
	GitHubService.use((github) => github.cancelRun(input.repository, input.runId)).pipe(
		Effect.tap(() => CacheService.use((cache) => cache.invalidateActionRuns(input.repository, input.runId))),
	),
)
export const dispatchWorkflowAtom = githubRuntime.fn<WorkflowDispatchInput>()((input) =>
	GitHubService.use((github) => github.dispatchWorkflow(input)).pipe(Effect.tap(() => CacheService.use((cache) => cache.invalidateActionRuns(input.repository)))),
)
export const getWorkflowInputsAtom = githubRuntime.fn<{ readonly repository: string; readonly workflow: string }>()((input) =>
	GitHubService.use((github) => github.getWorkflowInputs(input.repository, input.workflow)),
)
export const listArtifactsAtom = githubRuntime.fn<{ readonly repository: string; readonly runId: number }>()((input) =>
	GitHubService.use((github) => github.listArtifacts(input.repository, input.runId)),
)
export const downloadArtifactAtom = githubRuntime.fn<{
	readonly repository: string
	readonly runId: number
	readonly artifactName: string
	readonly destination: string
}>()((input) => GitHubService.use((github) => github.downloadArtifact(input.repository, input.runId, input.artifactName, input.destination)))

export const workflowRunDetailsFor = Atom.family((key: string) => {
	const { repository, runId } = parseRunDetailKey(key)
	return githubRuntime
		.atom(
			Stream.unwrap(
				Effect.gen(function* () {
					const cache = yield* CacheService
					const github = yield* GitHubService
					const cached = yield* cache.readActionRunDetails(repository, runId).pipe(Effect.catch(() => Effect.succeed(null)))
					const live = Stream.fromEffect(github.getWorkflowRunDetails(repository, runId).pipe(Effect.tap((details) => cache.writeActionRunDetails(repository, details))))
					return cacheFirstStream(cached, live)
				}),
			),
		)
		.pipe(Atom.setIdleTTL(0))
})
