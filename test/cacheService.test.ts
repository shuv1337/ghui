import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import type { IssueItem, NotificationItem, PullRequestItem, ReleaseItem, RepositoryDetails, WorkflowRunDetails } from "../src/domain.ts"
import type { IssueLoad } from "../src/issueLoad.ts"
import type { IssueView } from "../src/issueViews.ts"
import type { PullRequestLoad } from "../src/pullRequestLoad.ts"
import type { PullRequestView } from "../src/pullRequestViews.ts"
import { CacheService, pullRequestCacheKey } from "../src/services/CacheService.ts"
import { makeWorkspacePreferences, repositoryId, viewerId } from "../src/workspacePreferences.ts"

const tempDirs: string[] = []

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

const tempCachePath = async () => {
	const dir = await mkdtemp(join(tmpdir(), "ghui-cache-"))
	tempDirs.push(dir)
	return join(dir, "cache.sqlite")
}

const view: PullRequestView = { _tag: "Queue", mode: "authored", repository: null }

const pullRequest = (number: number, overrides: Partial<PullRequestItem> = {}): PullRequestItem => ({
	repository: "owner/repo",
	author: "author",
	headRefOid: `sha-${number}`,
	headRefName: `feature/${number}`,
	baseRefName: "main",
	defaultBranchName: "main",
	number,
	title: `PR ${number}`,
	body: "Body",
	labels: [{ name: "bug", color: "#d73a4a" }],
	additions: 10,
	deletions: 2,
	changedFiles: 3,
	state: "open",
	reviewStatus: "none",
	checkStatus: "passing",
	checkSummary: "1/1",
	checks: [{ name: "ci", status: "completed", conclusion: "success" }],
	autoMergeEnabled: false,
	detailLoaded: true,
	createdAt: new Date(`2026-01-${String(number).padStart(2, "0")}T00:00:00Z`),
	updatedAt: new Date(`2026-01-${String(number).padStart(2, "0")}T00:00:00Z`),
	closedAt: null,
	url: `https://github.com/owner/repo/pull/${number}`,
	...overrides,
})

const load = (data: readonly PullRequestItem[]): PullRequestLoad => ({
	view,
	data,
	fetchedAt: new Date(),
	endCursor: "cursor-1",
	hasNextPage: true,
})

const release = (tagName: string, overrides: Partial<ReleaseItem> = {}): ReleaseItem => ({
	repository: "owner/repo",
	tagName,
	name: `Release ${tagName}`,
	body: `Notes for ${tagName}`,
	isDraft: false,
	isPrerelease: false,
	author: "alice",
	targetCommitish: "main",
	createdAt: new Date("2026-05-01T00:00:00Z"),
	publishedAt: new Date("2026-05-02T00:00:00Z"),
	url: `https://github.com/owner/repo/releases/tag/${tagName}`,
	...overrides,
})

const actionRun = (id: number): WorkflowRunDetails => ({
	id,
	number: 12,
	attempt: 2,
	workflowName: "CI",
	displayTitle: "Cache Actions",
	event: "push",
	headBranch: "main",
	headSha: "abc123",
	status: "completed",
	conclusion: "success",
	url: `https://github.com/owner/repo/actions/runs/${id}`,
	createdAt: new Date("2026-06-01T00:00:00Z"),
	startedAt: null,
	updatedAt: new Date("2026-06-01T00:02:00Z"),
	jobs: [
		{
			id: id * 10,
			name: "test (node 22)",
			status: "completed",
			conclusion: "success",
			startedAt: null,
			completedAt: new Date("2026-06-01T00:02:00Z"),
			url: `https://github.com/owner/repo/actions/runs/${id}/job/${id * 10}`,
			steps: [
				{
					number: 1,
					name: "Skipped setup",
					status: "completed",
					conclusion: "skipped",
					startedAt: null,
					completedAt: null,
				},
			],
		},
	],
})

const runCache = async <A, E>(filename: string, effect: Effect.Effect<A, E, CacheService>) => Effect.runPromise(effect.pipe(Effect.provide(CacheService.layerSqliteFile(filename))))

describe("CacheService", () => {
	test("persists queue order and revives dates", async () => {
		const filename = await tempCachePath()
		const first = pullRequest(1)
		const second = pullRequest(2, { title: "Second" })

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([second, first]))
			}),
		)

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readQueue("alice", view)
			}),
		)

		expect(cached?.data.map((item) => item.number)).toEqual([2, 1])
		expect(cached?.fetchedAt).toBeInstanceOf(Date)
		expect(cached?.data[0]?.createdAt).toBeInstanceOf(Date)
		expect(cached?.data[0]?.labels).toEqual([{ name: "bug", color: "#d73a4a" }])
		expect(cached?.endCursor).toBe("cursor-1")
		expect(cached?.hasNextPage).toBe(true)
	})

	test("scopes user queues by viewer", async () => {
		const filename = await tempCachePath()
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([pullRequest(1)]))
				yield* cache.writeQueue("bob", load([pullRequest(2)]))
			}),
		)

		const [alice, bob] = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* Effect.all([cache.readQueue("alice", view), cache.readQueue("bob", view)])
			}),
		)

		expect(alice?.data.map((item) => item.number)).toEqual([1])
		expect(bob?.data.map((item) => item.number)).toEqual([2])
	})

	test("reads hydrated pull request details by repository and number", async () => {
		const filename = await tempCachePath()
		const detail = pullRequest(3, { body: "Hydrated body", additions: 42 })

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.upsertPullRequest(detail)
			}),
		)

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readPullRequest({ repository: "owner/repo", number: 3 })
			}),
		)

		expect(cached?.body).toBe("Hydrated body")
		expect(cached?.additions).toBe(42)
		expect(cached?.createdAt).toBeInstanceOf(Date)
	})

	test("queue summaries do not clobber hydrated details, including checks", async () => {
		const filename = await tempCachePath()
		const detail = pullRequest(4, {
			body: "Hydrated body",
			additions: 42,
			checkStatus: "passing",
			checkSummary: "9/9",
			checks: [{ name: "ci", status: "completed", conclusion: "success" }],
			detailLoaded: true,
		})
		// A real list-fetch summary never carries a real rollup; checkStatus="none" is what lands.
		const summary = pullRequest(4, {
			body: "",
			labels: [],
			additions: 0,
			deletions: 0,
			changedFiles: 0,
			checkStatus: "none",
			checkSummary: null,
			checks: [],
			detailLoaded: false,
		})

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.upsertPullRequest(detail)
				yield* cache.writeQueue("alice", load([summary]))
				return yield* cache.readPullRequest({ repository: "owner/repo", number: 4 })
			}),
		).then((cached) => {
			expect(cached).toMatchObject({
				body: "Hydrated body",
				additions: 42,
				checkStatus: "passing",
				checkSummary: "9/9",
				detailLoaded: true,
			})
		})
	})

	test("skips corrupt pull request rows when reading queues", async () => {
		const filename = await tempCachePath()
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([pullRequest(1), pullRequest(2)]))
			}),
		)

		const db = new Database(filename)
		db.run("update pull_requests set data_json = ? where pr_key = ?", "{", pullRequestCacheKey({ repository: "owner/repo", number: 1 }))
		db.close()

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readQueue("alice", view)
			}),
		)

		expect(cached?.data.map((item) => item.number)).toEqual([2])
	})

	test("disabled layer is a no-op", async () => {
		const cached = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([pullRequest(1)]))
				return yield* cache.readQueue("alice", view)
			}).pipe(Effect.provide(CacheService.disabledLayer)),
		)

		expect(cached).toBeNull()
	})

	test("persists workspace preferences by branded viewer", async () => {
		const filename = await tempCachePath()
		const preferences = makeWorkspacePreferences({
			viewer: viewerId("kitlangton"),
			favoriteRepositories: [repositoryId("kitlangton/ghui"), repositoryId("anomalyco/opencode")],
			recentRepositories: [repositoryId("anomalyco/opencode"), repositoryId("Effect-TS/effect")],
		})

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeWorkspacePreferences(preferences)
			}),
		)

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readWorkspacePreferences(viewerId("kitlangton"))
			}),
		)

		expect(cached?.favoriteRepositories).toEqual(["kitlangton/ghui", "anomalyco/opencode"])
		expect(cached?.recentRepositories).toEqual(["anomalyco/opencode", "Effect-TS/effect"])
	})

	test("persists issue queue order and revives dates", async () => {
		const filename = await tempCachePath()
		const issueView: IssueView = { _tag: "Queue", mode: "authored", repository: null }
		const issue = (number: number, overrides: Partial<IssueItem> = {}): IssueItem => ({
			repository: "owner/repo",
			number,
			state: "open",
			title: `Issue ${number}`,
			body: "Body",
			author: "alice",
			labels: [{ name: "bug", color: "#d73a4a" }],
			commentCount: 0,
			createdAt: new Date(`2026-02-${String(number).padStart(2, "0")}T00:00:00Z`),
			updatedAt: new Date(`2026-02-${String(number).padStart(2, "0")}T00:00:00Z`),
			url: `https://github.com/owner/repo/issues/${number}`,
			...overrides,
		})
		const issueLoad = (data: readonly IssueItem[]): IssueLoad => ({
			view: issueView,
			data,
			fetchedAt: new Date(),
			endCursor: "issue-cursor",
			hasNextPage: false,
		})

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeIssueQueue("alice", issueLoad([issue(2, { title: "Second" }), issue(1)]))
			}),
		)

		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readIssueQueue("alice", issueView)
			}),
		)

		expect(cached?.data.map((item) => item.number)).toEqual([2, 1])
		expect(cached?.data[0]?.title).toBe("Second")
		expect(cached?.data[0]?.createdAt).toBeInstanceOf(Date)
		expect(cached?.data[0]?.labels).toEqual([{ name: "bug", color: "#d73a4a" }])
		expect(cached?.endCursor).toBe("issue-cursor")
		expect(cached?.hasNextPage).toBe(false)
	})

	test("issue queue cache is independent of pull request cache", async () => {
		const filename = await tempCachePath()
		const prView: PullRequestView = { _tag: "Queue", mode: "authored", repository: null }
		const issueView: IssueView = { _tag: "Queue", mode: "authored", repository: null }
		const issue: IssueItem = {
			repository: "owner/repo",
			number: 99,
			state: "open",
			title: "Issue 99",
			body: "",
			author: "alice",
			labels: [],
			commentCount: 0,
			createdAt: new Date("2026-03-01T00:00:00Z"),
			updatedAt: new Date("2026-03-01T00:00:00Z"),
			url: "https://github.com/owner/repo/issues/99",
		}

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", load([pullRequest(1)]))
				yield* cache.writeIssueQueue("alice", {
					view: issueView,
					data: [issue],
					fetchedAt: new Date(),
					endCursor: null,
					hasNextPage: false,
				})
			}),
		)

		const [prLoad, issueLoadResult] = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* Effect.all([cache.readQueue("alice", prView), cache.readIssueQueue("alice", issueView)])
			}),
		)

		expect(prLoad?.data.map((item) => item.number)).toEqual([1])
		expect(issueLoadResult?.data.map((item) => item.number)).toEqual([99])
	})

	test("readRepoRollup aggregates pull requests and issues per viewer", async () => {
		const filename = await tempCachePath()
		const prView: PullRequestView = { _tag: "Queue", mode: "authored", repository: null }
		const issueView: IssueView = { _tag: "Queue", mode: "authored", repository: null }
		const otherViewerView: PullRequestView = { _tag: "Queue", mode: "review", repository: null }

		const prAlice = pullRequest(1, { repository: "owner/alpha", updatedAt: new Date("2026-04-10T00:00:00Z") })
		const prAlice2 = pullRequest(2, { repository: "owner/alpha", updatedAt: new Date("2026-04-12T00:00:00Z") })
		const prAliceOther = pullRequest(3, { repository: "owner/beta", updatedAt: new Date("2026-04-09T00:00:00Z") })
		const issueAlice: IssueItem = {
			repository: "owner/alpha",
			number: 11,
			state: "open",
			title: "I",
			body: "",
			author: "alice",
			labels: [],
			commentCount: 0,
			createdAt: new Date("2026-04-15T00:00:00Z"),
			updatedAt: new Date("2026-04-15T00:00:00Z"),
			url: "https://github.com/owner/alpha/issues/11",
		}
		const prBob = pullRequest(4, { repository: "owner/gamma" })

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeQueue("alice", { view: prView, data: [prAlice, prAlice2, prAliceOther], fetchedAt: new Date(), endCursor: null, hasNextPage: false })
				yield* cache.writeIssueQueue("alice", { view: issueView, data: [issueAlice], fetchedAt: new Date(), endCursor: null, hasNextPage: false })
				yield* cache.writeQueue("bob", { view: otherViewerView, data: [prBob], fetchedAt: new Date(), endCursor: null, hasNextPage: false })
			}),
		)

		const rows = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readRepoRollup("alice")
			}),
		)

		const byRepo = new Map(rows.map((row) => [row.repository, row]))
		expect(byRepo.get("owner/alpha")?.pullRequestCount).toBe(2)
		expect(byRepo.get("owner/alpha")?.issueCount).toBe(1)
		expect(byRepo.get("owner/alpha")?.lastActivityAt?.toISOString()).toBe("2026-04-15T00:00:00.000Z")
		expect(byRepo.get("owner/beta")?.pullRequestCount).toBe(1)
		expect(byRepo.get("owner/beta")?.issueCount).toBe(0)
		// Bob's PR must not leak into Alice's rollup.
		expect(byRepo.has("owner/gamma")).toBe(false)
	})

	test("readRepositoryDetailsFetchedAt reflects the latest write", async () => {
		const filename = await tempCachePath()
		const details: RepositoryDetails = {
			repository: "owner/repo",
			description: "Hi",
			url: "https://github.com/owner/repo",
			stargazerCount: 1,
			forkCount: 0,
			openIssueCount: 0,
			openPullRequestCount: 0,
			defaultBranch: "main",
			pushedAt: null,
			isArchived: false,
			isPrivate: false,
		}
		const before = new Date()

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeRepositoryDetails(details)
			}),
		)

		const fetchedAt = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readRepositoryDetailsFetchedAt("owner/repo")
			}),
		)

		expect(fetchedAt).toBeInstanceOf(Date)
		expect(fetchedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
	})

	test("persists release order, empty snapshots, and revived dates", async () => {
		const filename = await tempCachePath()
		const fetchedAt = new Date("2026-05-03T00:00:00Z")
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeReleaseList({ repository: "owner/repo", data: [release("v2"), release("v1")], fetchedAt })
			}),
		)

		const populated = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readReleaseList("owner/repo")
			}),
		)
		expect(populated?.data.map((item) => item.tagName)).toEqual(["v2", "v1"])
		expect(populated?.data[0]!.createdAt).toBeInstanceOf(Date)
		expect(populated?.fetchedAt.toISOString()).toBe(fetchedAt.toISOString())

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeReleaseList({ repository: "owner/empty", data: [], fetchedAt })
			}),
		)
		const empty = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readReleaseList("owner/empty")
			}),
		)
		expect(empty).toEqual({ repository: "owner/empty", data: [], fetchedAt })
	})

	test("skips corrupt release rows and invalidates list snapshots after mutations", async () => {
		const filename = await tempCachePath()
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeReleaseList({ repository: "owner/repo", data: [release("v2"), release("v1")], fetchedAt: new Date() })
			}),
		)
		const db = new Database(filename)
		db.run("update releases set data_json = ? where release_key = ?", "{", "owner/repo#v2")
		db.close()

		const surviving = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readReleaseList("owner/repo")
			}),
		)
		expect(surviving?.data.map((item) => item.tagName)).toEqual(["v1"])

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.upsertRelease(release("v3"))
			}),
		)
		expect(
			await runCache(
				filename,
				Effect.gen(function* () {
					const cache = yield* CacheService
					return yield* cache.readReleaseList("owner/repo")
				}),
			),
		).toBeNull()
	})

	test("persists Action summaries and details, revives nullable dates, and invalidates authoritatively", async () => {
		const filename = await tempCachePath()
		const details = actionRun(77)
		const { jobs: _jobs, ...summary } = details
		const fetchedAt = new Date("2026-06-01T00:03:00Z")
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeActionRuns({ repository: "owner/repo", data: [summary], fetchedAt })
				yield* cache.writeActionRunDetails("owner/repo", details)
			}),
		)

		const [runs, runDetails] = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* Effect.all([cache.readActionRuns("owner/repo"), cache.readActionRunDetails("owner/repo", 77)])
			}),
		)
		expect(runs?.data[0]?.createdAt).toBeInstanceOf(Date)
		expect(runs?.data[0]?.startedAt).toBeNull()
		expect(runs?.fetchedAt.toISOString()).toBe(fetchedAt.toISOString())
		expect(runDetails?.jobs[0]?.name).toBe("test (node 22)")
		expect(runDetails?.jobs[0]?.startedAt).toBeNull()
		expect(runDetails?.jobs[0]?.steps[0]?.conclusion).toBe("skipped")

		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.invalidateActionRuns("owner/repo", 77)
			}),
		)
		const [invalidRuns, invalidDetails] = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* Effect.all([cache.readActionRuns("owner/repo"), cache.readActionRunDetails("owner/repo", 77)])
			}),
		)
		expect(invalidRuns).toBeNull()
		expect(invalidDetails).toBeNull()
	})

	test("treats corrupt Action cache rows as cache misses", async () => {
		const filename = await tempCachePath()
		const details = actionRun(88)
		const { jobs: _jobs, ...summary } = details
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeActionRuns({ repository: "owner/repo", data: [summary], fetchedAt: new Date() })
				yield* cache.writeActionRunDetails("owner/repo", details)
			}),
		)
		const db = new Database(filename)
		db.run("update action_run_snapshots set data_json = ? where repository = ?", "{", "owner/repo")
		db.run("update action_run_details set data_json = ? where run_key = ?", "{", "owner/repo#88")
		db.close()
		const [runs, runDetails] = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* Effect.all([cache.readActionRuns("owner/repo"), cache.readActionRunDetails("owner/repo", 88)])
			}),
		)
		expect(runs).toBeNull()
		expect(runDetails).toBeNull()
	})

	test("persists repository resources across reopen and treats corrupt rows as cache misses", async () => {
		const filename = await tempCachePath()
		const fetchedAt = new Date("2026-07-29T10:00:00Z")
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeBranches({
					repository: "owner/repo",
					fetchedAt,
					data: [{ repository: "owner/repo", name: "main", sha: "abc", protected: true, isDefault: true }],
				})
				yield* cache.writeMilestones({
					repository: "owner/repo",
					fetchedAt,
					data: [
						{
							repository: "owner/repo",
							number: 1,
							title: "Parity",
							description: "",
							state: "open",
							openIssues: 2,
							closedIssues: 3,
							dueOn: new Date("2026-09-01T23:59:59Z"),
							url: "https://github.com/owner/repo/milestone/1",
						},
					],
				})
				const deployment = {
					repository: "owner/repo",
					id: 9,
					environment: "production",
					ref: "main",
					sha: "abc",
					task: "deploy",
					state: "success" as const,
					description: "",
					createdAt: new Date("2026-07-01T10:00:00Z"),
					updatedAt: new Date("2026-07-01T10:05:00Z"),
					url: "https://prod.example",
				}
				yield* cache.writeEnvironments({
					repository: "owner/repo",
					fetchedAt,
					data: [
						{
							repository: "owner/repo",
							id: 1,
							name: "production",
							url: "https://github.com/owner/repo/deployments/production",
							protectionRules: 1,
							latestDeployment: deployment,
						},
					],
				})
				yield* cache.writeDeployments("production", { repository: "owner/repo", fetchedAt, data: [deployment] })
				yield* cache.writeRunners({
					repository: "owner/repo",
					fetchedAt,
					data: [
						{
							repository: "owner/repo",
							id: 1,
							name: "gpu",
							os: "linux",
							status: "online",
							busy: true,
							labels: [{ name: "gpu", type: "custom" }],
						},
					],
				})
			}),
		)

		const [branches, milestones, environments, deployments, runners] = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* Effect.all([
					cache.readBranches("owner/repo"),
					cache.readMilestones("owner/repo"),
					cache.readEnvironments("owner/repo"),
					cache.readDeployments("owner/repo", "production"),
					cache.readRunners("owner/repo"),
				])
			}),
		)
		expect(branches?.data[0]?.isDefault).toBe(true)
		expect(milestones?.data[0]?.dueOn).toBeInstanceOf(Date)
		expect(environments?.data[0]?.latestDeployment?.createdAt).toBeInstanceOf(Date)
		expect(deployments?.data[0]?.updatedAt).toBeInstanceOf(Date)
		expect(runners?.data[0]?.labels[0]?.type).toBe("custom")

		const db = new Database(filename)
		db.run("update repository_resource_snapshots set data_json = ? where repository = ? and resource = ?", "{", "owner/repo", "runners")
		db.close()
		const corrupt = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readRunners("owner/repo")
			}),
		)
		expect(corrupt).toBeNull()
	})

	test("caches short notification summaries without private subjects", async () => {
		const filename = await tempCachePath()
		const notification: NotificationItem = {
			id: "thread-1",
			unread: true,
			reason: "mention",
			subjectType: "issue",
			subject: "private incident title",
			repository: "owner/private",
			updatedAt: new Date("2026-07-29T10:00:00Z"),
			lastReadAt: null,
			url: "https://github.com/owner/private/issues/1",
		}
		await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				yield* cache.writeNotificationSummaries("octocat", false, {
					repository: "octocat",
					data: [notification],
					fetchedAt: new Date("2026-07-29T10:01:00Z"),
				})
			}),
		)
		const db = new Database(filename)
		const row = db.query<{ data_json: string }, []>("select data_json from repository_resource_snapshots where repository = 'octocat' and resource = 'notifications:unread'").get()
		db.close()
		expect(row?.data_json).not.toContain(notification.subject)
		expect(row?.data_json).not.toContain('"subject"')
		const cached = await runCache(
			filename,
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readNotificationSummaries("octocat", false)
			}),
		)
		expect(cached?.data[0]).toMatchObject({ id: "thread-1", updatedAt: new Date("2026-07-29T10:00:00Z") })
	})

	test("layerFromPath falls back to disabled cache when startup fails", async () => {
		const dir = await mkdtemp(join(tmpdir(), "ghui-cache-fallback-"))
		tempDirs.push(dir)
		const blockedParent = join(dir, "not-a-directory")
		await Bun.write(blockedParent, "blocked")

		const cached = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readQueue("alice", view)
			}).pipe(Effect.provide(CacheService.layerFromPath(join(blockedParent, "cache.sqlite")))),
		)

		expect(cached).toBeNull()
	})
})
