import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type {
	BranchItem,
	CreateBranchInput,
	CreateMilestoneInput,
	DeploymentItem,
	EditMilestoneInput,
	EnvironmentItem,
	MilestoneIssue,
	MilestoneItem,
	RepositoryRunner,
} from "../../domain.js"
import { CacheService } from "../../services/CacheService.js"
import { GitHubService } from "../../services/GitHubService.js"
import { githubRuntime } from "../../services/runtime.js"

export const branchItemsAtom = Atom.make<readonly BranchItem[]>([]).pipe(Atom.keepAlive)
export const branchSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)
export const selectedBranchAtom = Atom.make<BranchItem | null>(null).pipe(Atom.keepAlive)
export const milestoneItemsAtom = Atom.make<readonly MilestoneItem[]>([]).pipe(Atom.keepAlive)
export const milestoneSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)
export const selectedMilestoneAtom = Atom.make<MilestoneItem | null>(null).pipe(Atom.keepAlive)
export const milestoneIssuesAtom = Atom.make<readonly MilestoneIssue[]>([]).pipe(Atom.keepAlive)
export const environmentItemsAtom = Atom.make<readonly EnvironmentItem[]>([]).pipe(Atom.keepAlive)
export const environmentSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)
export const selectedEnvironmentAtom = Atom.make<EnvironmentItem | null>(null).pipe(Atom.keepAlive)
export const deploymentItemsAtom = Atom.make<readonly DeploymentItem[]>([]).pipe(Atom.keepAlive)
export const runnerItemsAtom = Atom.make<readonly RepositoryRunner[]>([]).pipe(Atom.keepAlive)
export const runnerSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)
export const selectedRunnerAtom = Atom.make<RepositoryRunner | null>(null).pipe(Atom.keepAlive)

const cacheFirstList = <T>(
	read: (cache: CacheService["Service"]) => Effect.Effect<{ readonly data: readonly T[] } | null, unknown>,
	live: (github: GitHubService["Service"]) => Effect.Effect<readonly T[], unknown>,
	write: (cache: CacheService["Service"], data: readonly T[]) => Effect.Effect<void>,
) =>
	Effect.gen(function* () {
		const cache = yield* CacheService
		const github = yield* GitHubService
		const cached = yield* read(cache).pipe(Effect.catch(() => Effect.succeed(null)))
		return yield* live(github).pipe(
			Effect.tap((data) => write(cache, data)),
			Effect.catch((error) => (cached ? Effect.succeed(cached.data) : Effect.fail(error))),
		)
	})

export const loadBranchesAtom = githubRuntime.fn<string>()((repository) =>
	cacheFirstList(
		(cache) => cache.readBranches(repository),
		(github) => github.listBranches(repository),
		(cache, data) => cache.writeBranches({ repository, data, fetchedAt: new Date() }),
	),
)
export const createBranchAtom = githubRuntime.fn<CreateBranchInput>()((input) =>
	GitHubService.use((github) => github.createBranch(input)).pipe(Effect.tap(() => CacheService.use((cache) => cache.invalidateBranches(input.repository)))),
)
export const deleteBranchAtom = githubRuntime.fn<{ readonly repository: string; readonly branch: BranchItem; readonly selectedBranchName: string | null }>()(
	({ repository, branch, selectedBranchName }) =>
		GitHubService.use((github) => github.deleteBranch(repository, branch, selectedBranchName)).pipe(
			Effect.tap(() => CacheService.use((cache) => cache.invalidateBranches(repository))),
		),
)

export const loadMilestonesAtom = githubRuntime.fn<string>()((repository) =>
	cacheFirstList(
		(cache) => cache.readMilestones(repository),
		(github) => github.listMilestones(repository),
		(cache, data) => cache.writeMilestones({ repository, data, fetchedAt: new Date() }),
	),
)
export const loadMilestoneIssuesAtom = githubRuntime.fn<{ readonly repository: string; readonly title: string }>()(({ repository, title }) =>
	GitHubService.use((github) => github.listMilestoneIssues(repository, title)),
)
export const createMilestoneAtom = githubRuntime.fn<CreateMilestoneInput>()((input) =>
	GitHubService.use((github) => github.createMilestone(input)).pipe(Effect.tap(() => CacheService.use((cache) => cache.invalidateMilestones(input.repository)))),
)
export const editMilestoneAtom = githubRuntime.fn<EditMilestoneInput>()((input) =>
	GitHubService.use((github) => github.editMilestone(input)).pipe(Effect.tap(() => CacheService.use((cache) => cache.invalidateMilestones(input.repository)))),
)
export const deleteMilestoneAtom = githubRuntime.fn<{ readonly repository: string; readonly number: number }>()(({ repository, number }) =>
	GitHubService.use((github) => github.deleteMilestone(repository, number)).pipe(Effect.tap(() => CacheService.use((cache) => cache.invalidateMilestones(repository)))),
)

export const loadEnvironmentsAtom = githubRuntime.fn<string>()((repository) =>
	cacheFirstList(
		(cache) => cache.readEnvironments(repository),
		(github) => github.listEnvironments(repository),
		(cache, data) => cache.writeEnvironments({ repository, data, fetchedAt: new Date() }),
	),
)
export const loadDeploymentsAtom = githubRuntime.fn<{ readonly repository: string; readonly environment: string }>()(({ repository, environment }) =>
	cacheFirstList(
		(cache) => cache.readDeployments(repository, environment),
		(github) => github.listDeployments(repository, environment),
		(cache, data) => cache.writeDeployments(environment, { repository, data, fetchedAt: new Date() }),
	),
)

export const loadRunnersAtom = githubRuntime.fn<string>()((repository) =>
	cacheFirstList(
		(cache) => cache.readRunners(repository),
		(github) => github.listRunners(repository),
		(cache, data) => cache.writeRunners({ repository, data, fetchedAt: new Date() }),
	),
)
