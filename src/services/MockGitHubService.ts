import { Effect, Layer } from "effect"
import type {
	CheckItem,
	BranchItem,
	EnvironmentItem,
	MilestoneItem,
	RepositoryRunner,
	NotificationItem,
	CreatePullRequestCommentInput,
	IssueItem,
	Mergeable,
	PendingReview,
	PullRequestComment,
	PullRequestItem,
	PullRequestMergeInfo,
	PullRequestQueueMode,
	PullRequestReviewComment,
	ReleaseItem,
	ReviewStatus,
} from "../domain.js"
import type { ItemListInput } from "../item.js"
import { mergeInfoFromPullRequest } from "../mergeActions.js"
import { mockAuthor, mockBody, mockIssueTitle, mockLabels, mockPullRequestBranch, mockPullRequestTitle } from "./mockData.js"
import { mockWorkflowRunDetails, mockWorkflowRuns } from "./mockRuns.js"
import { GitHubService } from "./GitHubService.js"
import { loadMockFixtureSnapshot } from "./mockFixtures.js"

export interface MockOptions {
	readonly prCount: number
	readonly repoCount?: number
	readonly repository?: string | null
	readonly repositories?: readonly string[]
	readonly username?: string
	readonly seed?: number
}

const REVIEW_CYCLE: readonly ReviewStatus[] = ["approved", "changes", "review", "none", "draft"]
const MERGEABLE_CYCLE: readonly Mergeable[] = ["mergeable", "conflicting", "unknown"]
const MOCK_REPOSITORIES = ["mock-org/repo-0", "mock-org/repo-1", "mock-org/repo-2", "mock-org/repo-3"] as const

const mockRepository = (index: number, primaryRepository: string | null) =>
	index === 0 && primaryRepository ? primaryRepository : (MOCK_REPOSITORIES[index % MOCK_REPOSITORIES.length] ?? `mock-org/repo-${index}`)

const synthCheckSummary = (passed: number, total: number): Pick<PullRequestItem, "checkStatus" | "checkSummary" | "checks"> => {
	const checks: readonly CheckItem[] = Array.from({ length: total }, (_, index) => ({
		name: `check-${index}`,
		status: "completed",
		conclusion: index < passed ? "success" : "failure",
	}))
	if (total === 0) return { checkStatus: "none", checkSummary: null, checks: [] }
	if (passed === total) return { checkStatus: "passing", checkSummary: `${passed}/${total}`, checks }
	return { checkStatus: "failing", checkSummary: `${passed}/${total}`, checks }
}

const buildPullRequest = (index: number, options: Required<MockOptions>): PullRequestItem => {
	const repoIndex = index % options.repoCount
	const repository = options.repositories[repoIndex % options.repositories.length] ?? mockRepository(repoIndex, options.repository)
	const number = 1000 + index
	const total = 8 + (index % 5)
	const passed = total - (index % 3 === 0 ? 1 : 0)
	const review = REVIEW_CYCLE[index % REVIEW_CYCLE.length]!
	const createdAt = new Date(Date.now() - index * 86_400_000)
	const updatedAt = new Date(Date.now() - index * 3_600_000)

	return {
		repository,
		author: index % 4 === 0 ? options.username : mockAuthor(index),
		headRefOid: `deadbeef${index.toString(16).padStart(8, "0")}`,
		headRefName: mockPullRequestBranch(index),
		baseRefName: index % 9 === 0 ? "release" : "main",
		defaultBranchName: "main",
		number,
		title: mockPullRequestTitle(index),
		body: mockBody("pull-request", index),
		labels: mockLabels(index),
		additions: 10 + index,
		deletions: 5 + (index % 11),
		changedFiles: 1 + (index % 7),
		state: "open",
		reviewStatus: review,
		...synthCheckSummary(passed, total),
		autoMergeEnabled: index % 11 === 0,
		detailLoaded: true,
		createdAt,
		updatedAt,
		closedAt: null,
		url: `https://github.com/${repository}/pull/${number}`,
	}
}

export const buildMockPullRequests = (options: MockOptions): readonly PullRequestItem[] => {
	const resolved: Required<MockOptions> = {
		prCount: options.prCount,
		repoCount: options.repoCount ?? 4,
		repository: options.repository ?? null,
		repositories: options.repositories ?? [],
		username: options.username ?? "mock-user",
		seed: options.seed ?? 0,
	}
	return Array.from({ length: resolved.prCount }, (_, index) => buildPullRequest(index, resolved))
}

const buildMockIssues = (options: MockOptions): readonly IssueItem[] => {
	const resolved: Required<MockOptions> = {
		prCount: options.prCount,
		repoCount: options.repoCount ?? 4,
		repository: options.repository ?? null,
		repositories: options.repositories ?? [],
		username: options.username ?? "mock-user",
		seed: options.seed ?? 0,
	}
	return Array.from({ length: Math.max(8, Math.ceil(resolved.prCount / 3)) }, (_, index) => {
		const repoIndex = index % resolved.repoCount
		const repository = mockRepository(repoIndex, resolved.repository)
		const number = 2000 + index
		return {
			repository,
			number,
			state: "open" as const,
			title: mockIssueTitle(index),
			body: mockBody("issue", index),
			author: index % 2 === 0 ? resolved.username : mockAuthor(index),
			labels: mockLabels(index),
			commentCount: index % 6,
			createdAt: new Date(Date.now() - index * 43_200_000),
			updatedAt: new Date(Date.now() - index * 3_600_000),
			url: `https://github.com/${repository}/issues/${number}`,
		} satisfies IssueItem
	})
}

export const buildMockReleases = (repositories: readonly string[]): readonly ReleaseItem[] => {
	const createdBase = Date.parse("2026-01-15T12:00:00.000Z")
	return repositories.flatMap((repository, repositoryIndex) =>
		Array.from({ length: 4 }, (_, index) => {
			const version = `${repositoryIndex + 1}.${index}.0`
			const createdAt = new Date(createdBase - (repositoryIndex * 4 + index) * 86_400_000)
			return {
				repository,
				tagName: `v${version}`,
				name: index === 0 ? `Release ${version}` : `Version ${version}`,
				body: `Deterministic mock release notes for ${repository} v${version}.`,
				isDraft: index === 3,
				isPrerelease: index === 2,
				author: "mock-user",
				targetCommitish: "main",
				createdAt,
				publishedAt: index === 3 ? null : createdAt,
				url: `https://github.com/${repository}/releases/tag/v${version}`,
			} satisfies ReleaseItem
		}),
	)
}

const filterByView = (mode: PullRequestQueueMode, repository: string | null, source: readonly PullRequestItem[], username: string, strictUserScope: boolean) => {
	if (mode === "repository") return repository ? source.filter((item) => item.repository === repository) : []
	if (repository) return source.filter((item) => item.repository === repository)
	if (!strictUserScope) return source
	const authored = source.filter((item) => item.author === username)
	if (mode === "authored") return authored
	if (mode === "review") return source.filter((item) => item.author !== username && item.reviewStatus === "review")
	if (mode === "assigned") return source.filter((item) => item.author !== username && item.reviewStatus === "changes")
	return source.filter((item) => item.author !== username).slice(0, Math.ceil(source.length / 8))
}

const slicePage = <T>(source: readonly T[], cursor: string | null, pageSize: number): { items: readonly T[]; endCursor: string | null; hasNextPage: boolean } => {
	const start = cursor ? Number.parseInt(cursor, 10) : 0
	const safeStart = Number.isFinite(start) && start >= 0 ? start : 0
	const safePageSize = Math.max(1, Math.min(100, pageSize))
	const end = Math.min(source.length, safeStart + safePageSize)
	return { items: source.slice(safeStart, end), endCursor: end > safeStart ? String(end) : null, hasNextPage: end < source.length }
}

const mockDiff = `diff --git a/src/mockDiff.ts b/src/mockDiff.ts
--- a/src/mockDiff.ts
+++ b/src/mockDiff.ts
@@ -1,6 +1,6 @@
 export const before = true
-const oldOne = 1
+const newOne = 1
-  sameName()
+	sameName()
-const oldTwo = 2
+const newTwo = 2
 export const after = true`

const uniqueLabels = (items: readonly { readonly labels: readonly { readonly name: string; readonly color: string | null }[] }[]) => {
	const byName = new Map<string, { readonly name: string; readonly color: string | null }>()
	for (const item of items) {
		for (const label of item.labels) {
			const key = label.name.toLowerCase()
			if (!byName.has(key)) byName.set(key, label)
		}
	}
	return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export const MockGitHubService = {
	layer: (options: MockOptions) => {
		const fixture = loadMockFixtureSnapshot()
		const strictUserScope = fixture !== null
		const username = options.username ?? "mock-user"
		let items = [...(fixture ? fixture.pullRequests.slice(0, options.prCount) : buildMockPullRequests(options))]
		let userItems = fixture
			? buildMockPullRequests({
					prCount: Math.max(8, Math.min(24, Math.ceil(options.prCount / 8))),
					repoCount: options.repoCount ?? 4,
					repository: null,
					...(options.repositories ? { repositories: options.repositories } : {}),
					username,
				})
			: items.map((item) => ({ ...item, author: username }))
		let issues = [...(fixture ? fixture.issues : buildMockIssues(options))]
		const releaseRepositories = [...new Set([...items.map((item) => item.repository), ...issues.map((item) => item.repository)])]
		let releases = [...buildMockReleases(releaseRepositories)]
		let branches: BranchItem[] = releaseRepositories.flatMap((repository) => [
			{ repository, name: "main", sha: "1111111111111111111111111111111111111111", protected: true, isDefault: true },
			{ repository, name: "feature/mock", sha: "2222222222222222222222222222222222222222", protected: false, isDefault: false },
		])
		let milestones: MilestoneItem[] = releaseRepositories.flatMap((repository) => [
			{
				repository,
				number: 1,
				title: "Next",
				description: "Next release",
				state: "open",
				openIssues: 3,
				closedIssues: 7,
				dueOn: new Date("2026-09-01T23:59:59.000Z"),
				url: `https://github.com/${repository}/milestone/1`,
			},
			{
				repository,
				number: 2,
				title: "Later",
				description: "",
				state: "closed",
				openIssues: 0,
				closedIssues: 4,
				dueOn: null,
				url: `https://github.com/${repository}/milestone/2`,
			},
		])
		const environments: EnvironmentItem[] = releaseRepositories.flatMap((repository) => [
			{
				repository,
				id: 1,
				name: "production",
				url: `https://github.com/${repository}/deployments/activity_log?environment=production`,
				protectionRules: 1,
				latestDeployment: {
					repository,
					id: 101,
					environment: "production",
					ref: "main",
					sha: "1111111111111111111111111111111111111111",
					task: "deploy",
					state: "success",
					description: "Mock deployment",
					createdAt: new Date("2026-07-20T12:00:00.000Z"),
					updatedAt: new Date("2026-07-20T12:05:00.000Z"),
					url: "https://example.test",
				},
			},
			{
				repository,
				id: 2,
				name: "preview",
				url: `https://github.com/${repository}/deployments/activity_log?environment=preview`,
				protectionRules: 0,
				latestDeployment: null,
			},
		])
		const runners: RepositoryRunner[] = releaseRepositories.flatMap((repository) => [
			{
				repository,
				id: 1,
				name: "linux-x64",
				os: "linux",
				status: "online",
				busy: true,
				labels: [
					{ name: "self-hosted", type: "read-only" },
					{ name: "gpu", type: "custom" },
				],
			},
			{ repository, id: 2, name: "macos-arm64", os: "macos", status: "offline", busy: false, labels: [{ name: "self-hosted", type: "read-only" }] },
		])
		let notifications: NotificationItem[] = releaseRepositories.slice(0, 3).map((repository, index) => ({
			id: `mock-notification-${index + 1}`,
			unread: index < 2,
			reason: index === 0 ? "review_requested" : index === 1 ? "mention" : "subscribed",
			subjectType: index === 2 ? "issue" : "pullRequest",
			subject: index === 0 ? "Review the parity implementation" : index === 1 ? "You were mentioned in the rollout" : "Track the release checklist",
			repository,
			updatedAt: new Date(Date.now() - index * 3_600_000),
			lastReadAt: index < 2 ? null : new Date(Date.now() - 1_800_000),
			url: `https://github.com/${repository}/${index === 2 ? "issues" : "pull"}/${100 + index}`,
		}))
		const pendingReviews = new Map<string, PendingReview>()
		let nextPendingReviewId = 1
		const pendingReviewKey = (repository: string, number: number) => `${repository}#${number}`
		const fixturePullRequestsByKey = new Map(fixture?.pullRequests.map((item) => [`${item.repository}#${item.number}`, item]))
		const fixtureIssuesByKey = new Map(fixture?.issues.map((item) => [`${item.repository}#${item.number}`, item]))
		const pullRequestSource = (mode: PullRequestQueueMode, repository: string | null) => (mode === "repository" || repository ? items : userItems)

		// Map the new `ItemListMode` onto the legacy `PullRequestQueueMode` filter
		// path so the mock applies the same scoping as the real service.
		const queueModeForListMode = (mode: "all" | "authored" | "review" | "assigned" | "mentioned"): PullRequestQueueMode => (mode === "all" ? "repository" : mode)

		const filterIssuesByMode = (mode: "all" | "authored" | "assigned" | "mentioned", repository: string | null, source: readonly IssueItem[]): readonly IssueItem[] => {
			const scopedToRepo = repository ? source.filter((issue) => issue.repository === repository) : source
			if (mode === "all") return scopedToRepo
			if (mode === "authored") return scopedToRepo.filter((issue) => issue.author === username)
			// Mock has no assignee/mentions metadata; treat both as "items not authored by me"
			// so the mode visibly differs from "authored".
			return scopedToRepo.filter((issue) => issue.author !== username).slice(0, Math.max(1, Math.ceil(scopedToRepo.length / 4)))
		}
		const fixturePullRequest = (repository: string, number: number) => fixturePullRequestsByKey.get(`${repository}#${number}`) ?? null
		const fixtureIssue = (repository: string, number: number) => fixtureIssuesByKey.get(`${repository}#${number}`) ?? null
		const findPullRequest = (repository: string, number: number) => [...items, ...userItems].find((item) => item.repository === repository && item.number === number) ?? items[0]!
		const labelsForRepository = (repository: string) =>
			uniqueLabels([...items.filter((item) => item.repository === repository), ...issues.filter((issue) => issue.repository === repository)])
		const comments = (repository: string, number: number): readonly PullRequestComment[] => [
			{
				_tag: "comment",
				id: `mock-comment:${repository}:${number}:1`,
				author: "mock-reviewer",
				body: `Top-level discussion for #${number}. This should appear after the summary with its own separator.`,
				createdAt: new Date(Date.now() - 3_600_000),
				url: null,
			},
			{
				_tag: "review-comment",
				id: `mock-review:${repository}:${number}:1`,
				author: "mock-reviewer",
				body: "Inline review comment rendered in the same comments stream.",
				createdAt: new Date(Date.now() - 1_800_000),
				url: null,
				path: "src/App.tsx",
				line: 42,
				side: "RIGHT",
				inReplyTo: null,
			},
			{
				_tag: "review-comment",
				id: `mock-review:${repository}:${number}:2`,
				author: "another-reviewer",
				body: "Threaded reply on the same line — should render indented.",
				createdAt: new Date(Date.now() - 1_200_000),
				url: null,
				path: "src/App.tsx",
				line: 42,
				side: "RIGHT",
				inReplyTo: `mock-review:${repository}:${number}:1`,
			},
		]
		const pullRequestComments = (repository: string, number: number): readonly PullRequestComment[] =>
			fixturePullRequest(repository, number)?.comments ?? comments(repository, number)
		const issueComments = (repository: string, number: number): readonly PullRequestComment[] => {
			const fixture = fixtureIssue(repository, number)
			if (fixture?.comments) return fixture.comments
			const issue = fixture ?? issues.find((item) => item.repository === repository && item.number === number)
			if (!issue) return []
			return issue.commentCount > 0
				? comments(repository, number)
						.filter((comment) => comment._tag === "comment")
						.slice(0, issue.commentCount)
				: []
		}
		const reviewComments = (repository: string, number: number): readonly PullRequestReviewComment[] =>
			fixturePullRequest(repository, number)?.reviewComments ??
			pullRequestComments(repository, number).flatMap((comment) =>
				comment._tag === "review-comment"
					? [
							{
								id: comment.id,
								path: comment.path,
								line: comment.line,
								side: comment.side,
								author: comment.author,
								body: comment.body,
								createdAt: comment.createdAt,
								url: comment.url,
								inReplyTo: comment.inReplyTo,
							},
						]
					: [],
			)

		return Layer.succeed(
			GitHubService,
			GitHubService.of({
				getPullRequestDetails: (repository, number) => Effect.succeed(findPullRequest(repository, number)),
				getRepositoryDetails: (repository: string) => {
					const seed = Array.from(repository).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0)
					const openIssueCount = issues.filter((issue) => issue.repository === repository).length
					const openPullRequestCount = items.filter((item) => item.repository === repository).length
					return Effect.succeed({
						repository,
						description: `Mock repository ${repository} — synthesized for offline development.`,
						url: `https://github.com/${repository}`,
						stargazerCount: 12 + (seed % 4000),
						forkCount: 1 + (seed % 80),
						openIssueCount,
						openPullRequestCount,
						defaultBranch: "main",
						pushedAt: new Date(Date.now() - (seed % 86_400_000)),
						isArchived: false,
						isPrivate: seed % 5 === 0,
					})
				},
				getAuthenticatedUser: () => Effect.succeed(username),
				getPullRequestDiff: (repository, number) => Effect.succeed(fixturePullRequest(repository, number)?.diff ?? mockDiff),
				listWorkflowRunsForCommit: (repository, headSha) => Effect.succeed(mockWorkflowRuns(repository, headSha)),
				getWorkflowRunDetails: (repository, runId) => {
					for (const pr of [...items, ...userItems]) {
						const details = mockWorkflowRunDetails(repository, pr.headRefOid, runId)
						if (details) return Effect.succeed(details)
					}
					// Unknown id (shouldn't happen in mock): fall back to the first PR's first run.
					const firstSha = items[0]?.headRefOid ?? "deadbeef00000000"
					const first = mockWorkflowRuns(repository, firstSha)[0]
					return Effect.succeed(mockWorkflowRunDetails(repository, firstSha, first?.id ?? runId) ?? { ...(first ?? ({} as never)), jobs: [] })
				},
				listWorkflows: () =>
					Effect.succeed([
						{ id: 1, name: "CI", state: "active" as const, path: ".github/workflows/ci.yml" },
						{ id: 2, name: "Release", state: "active" as const, path: ".github/workflows/release.yml" },
					]),
				listWorkflowRuns: (repository) => Effect.succeed(mockWorkflowRuns(repository, items[0]?.headRefOid ?? "deadbeef00000000")),
				getWorkflowInputs: () =>
					Effect.succeed([
						{ name: "environment", description: "Target environment", required: true, type: "choice" as const, defaultValue: "staging", options: ["staging", "production"] },
						{ name: "dry_run", description: "Do not deploy", required: false, type: "boolean" as const, defaultValue: true, options: [] },
					]),
				dispatchWorkflow: () => Effect.void,
				retryRun: () => Effect.void,
				cancelRun: () => Effect.void,
				getJobLog: (repository, jobId) => Effect.succeed({ repository, jobId, text: `Mock log for job ${jobId}\nBuild complete\n` }),
				listArtifacts: () =>
					Effect.succeed([
						{
							id: 1,
							name: "ghui-build",
							sizeInBytes: 4096,
							expired: false,
							createdAt: new Date("2026-01-01T00:00:00Z"),
							expiresAt: new Date("2026-04-01T00:00:00Z"),
						},
					]),
				downloadArtifact: (_repository, _runId, _artifactName, destination) => Effect.succeed(destination),
				listPullRequestReviewComments: (repository, number) => Effect.succeed(reviewComments(repository, number)),
				listPullRequestComments: (repository, number) => Effect.succeed(pullRequestComments(repository, number)),
				listIssueComments: (repository, number) => Effect.succeed(issueComments(repository, number)),
				getPullRequestMergeInfo: (repository, number) => {
					const pr = findPullRequest(repository, number)
					return Effect.succeed({
						...mergeInfoFromPullRequest(pr),
						repository,
						number,
						mergeable: MERGEABLE_CYCLE[number % MERGEABLE_CYCLE.length]!,
						reviewStatus: pr.reviewStatus === "draft" ? "approved" : pr.reviewStatus,
						checkStatus: "passing",
						checkSummary: "10/10",
					} satisfies PullRequestMergeInfo)
				},
				getRepositoryMergeMethods: () => Effect.succeed({ squash: true, merge: true, rebase: true }),
				mergePullRequest: () => Effect.void,
				closePullRequest: (repository, number) =>
					Effect.sync(() => {
						items = items.map((item) => (item.repository === repository && item.number === number ? { ...item, state: "closed" as const, closedAt: new Date() } : item))
						userItems = userItems.map((item) => (item.repository === repository && item.number === number ? { ...item, state: "closed" as const, closedAt: new Date() } : item))
					}),
				closeIssue: (repository, number) =>
					Effect.sync(() => {
						issues = issues.map((issue) => (issue.repository === repository && issue.number === number ? { ...issue, state: "closed" as const, updatedAt: new Date() } : issue))
					}),
				createIssue: (input) =>
					Effect.sync(() => {
						const number = Math.max(2000, ...issues.map((issue) => issue.number)) + 1
						issues = [
							{
								repository: input.repository,
								number,
								state: "open",
								title: input.title,
								body: input.body,
								author: username,
								labels: (input.labels ?? []).map((name) => ({ name, color: null })),
								commentCount: 0,
								createdAt: new Date(),
								updatedAt: new Date(),
								url: `https://github.com/${input.repository}/issues/${number}`,
							},
							...issues,
						]
					}),
				editIssue: (input) =>
					Effect.sync(() => {
						issues = issues.map((issue) => {
							if (issue.repository !== input.repository || issue.number !== input.number) return issue
							const removed = new Set((input.removeLabels ?? []).map((label) => label.toLowerCase()))
							const labels = issue.labels.filter((label) => !removed.has(label.name.toLowerCase()))
							for (const name of input.addLabels ?? []) {
								if (!labels.some((label) => label.name.toLowerCase() === name.toLowerCase())) labels.push({ name, color: null })
							}
							return { ...issue, title: input.title ?? issue.title, body: input.body ?? issue.body, labels, updatedAt: new Date() }
						})
					}),
				reopenIssue: (repository, number) =>
					Effect.sync(() => {
						issues = issues.map((issue) => (issue.repository === repository && issue.number === number ? { ...issue, state: "open" as const, updatedAt: new Date() } : issue))
					}),
				deleteIssue: (repository, number) =>
					Effect.sync(() => {
						issues = issues.filter((issue) => issue.repository !== repository || issue.number !== number)
					}),
				createPullRequest: (input) =>
					Effect.sync(() => {
						const number = Math.max(1000, ...items.map((item) => item.number), ...userItems.map((item) => item.number)) + 1
						const pullRequest = buildPullRequest(number, {
							prCount: options.prCount,
							repoCount: options.repoCount ?? 1,
							repository: input.repository,
							repositories: [input.repository],
							username,
							seed: options.seed ?? 0,
						})
						const created: PullRequestItem = {
							...pullRequest,
							repository: input.repository,
							number,
							title: input.title,
							body: input.body,
							baseRefName: input.base,
							headRefName: input.head,
							reviewStatus: input.draft ? "draft" : "review",
							labels: (input.labels ?? []).map((name) => ({ name, color: null })),
							url: `https://github.com/${input.repository}/pull/${number}`,
						}
						items = [created, ...items]
						userItems = [created, ...userItems]
					}),
				editPullRequest: (input) =>
					Effect.sync(() => {
						const edit = (item: PullRequestItem): PullRequestItem => {
							if (item.repository !== input.repository || item.number !== input.number) return item
							const removed = new Set((input.removeLabels ?? []).map((label) => label.toLowerCase()))
							const labels = item.labels.filter((label) => !removed.has(label.name.toLowerCase()))
							for (const name of input.addLabels ?? []) {
								if (!labels.some((label) => label.name.toLowerCase() === name.toLowerCase())) labels.push({ name, color: null })
							}
							return { ...item, title: input.title ?? item.title, body: input.body ?? item.body, baseRefName: input.base ?? item.baseRefName, labels, updatedAt: new Date() }
						}
						items = items.map(edit)
						userItems = userItems.map(edit)
					}),
				reopenPullRequest: (repository, number) =>
					Effect.sync(() => {
						const reopen = (item: PullRequestItem): PullRequestItem =>
							item.repository === repository && item.number === number ? { ...item, state: "open", closedAt: null, updatedAt: new Date() } : item
						items = items.map(reopen)
						userItems = userItems.map(reopen)
					}),
				approvePullRequest: (repository, number) =>
					Effect.sync(() => {
						const approve = (item: PullRequestItem): PullRequestItem =>
							item.repository === repository && item.number === number ? { ...item, reviewStatus: "approved", updatedAt: new Date() } : item
						items = items.map(approve)
						userItems = userItems.map(approve)
					}),
				createPullRequestComment: (input: CreatePullRequestCommentInput) =>
					Effect.succeed({
						id: `mock:${Date.now()}`,
						path: input.path,
						line: input.line,
						side: input.side,
						author: username,
						body: input.body,
						createdAt: new Date(),
						url: null,
						inReplyTo: null,
					} satisfies PullRequestReviewComment),
				createPullRequestIssueComment: (_repo, _number, body) =>
					Effect.succeed({
						_tag: "comment" as const,
						id: `mock-issue:${Date.now()}`,
						author: username,
						body,
						createdAt: new Date(),
						url: null,
					}),
				replyToReviewComment: (_repo, _number, inReplyTo, body) =>
					Effect.succeed({
						_tag: "review-comment" as const,
						id: `mock-reply:${inReplyTo}:${Date.now()}`,
						path: "src/App.tsx",
						line: 42,
						side: "RIGHT" as const,
						author: username,
						body,
						createdAt: new Date(),
						url: null,
						inReplyTo,
					}),
				editPullRequestIssueComment: (_repo, commentId, body) =>
					Effect.succeed({
						_tag: "comment" as const,
						id: commentId,
						author: username,
						body,
						createdAt: new Date(),
						url: null,
					}),
				editReviewComment: (_repo, commentId, body) =>
					Effect.succeed({
						_tag: "review-comment" as const,
						id: commentId,
						path: "src/App.tsx",
						line: 42,
						side: "RIGHT" as const,
						author: username,
						body,
						createdAt: new Date(),
						url: null,
						inReplyTo: null,
					}),
				deletePullRequestIssueComment: () => Effect.void,
				deleteReviewComment: () => Effect.void,
				submitPullRequestReview: () => Effect.void,
				findPendingReview: (repository, number) => Effect.succeed(pendingReviews.get(pendingReviewKey(repository, number)) ?? null),
				createPendingReview: (repository, number, commitId) =>
					Effect.sync(() => {
						const review: PendingReview = {
							id: `mock-pending:${nextPendingReviewId++}`,
							repository,
							number,
							commitId,
							comments: [],
						}
						pendingReviews.set(pendingReviewKey(repository, number), review)
						return review
					}),
				addPendingReviewComment: (review, input) =>
					Effect.sync(() => {
						const comment: PullRequestReviewComment = {
							id: `mock-pending-comment:${review.id}:${Date.now()}`,
							path: input.path,
							line: input.line,
							side: input.side,
							author: username,
							body: input.body,
							createdAt: new Date(),
							url: null,
							inReplyTo: null,
						}
						const key = pendingReviewKey(review.repository, review.number)
						const current = pendingReviews.get(key)
						if (current) pendingReviews.set(key, { ...current, comments: [...current.comments, comment] })
						return comment
					}),
				submitPendingReview: (review) =>
					Effect.sync(() => {
						pendingReviews.delete(pendingReviewKey(review.repository, review.number))
					}),
				discardPendingReview: (review) =>
					Effect.sync(() => {
						pendingReviews.delete(pendingReviewKey(review.repository, review.number))
					}),
				toggleDraftStatus: () => Effect.void,
				listRepoLabels: (repository) => Effect.succeed(labelsForRepository(repository)),
				listAssignees: () =>
					Effect.succeed([
						{ login: username, name: "Mock User" },
						{ login: "mock-maintainer", name: "Mock Maintainer" },
					]),
				listReviewers: () =>
					Effect.succeed([
						{ login: "mock-reviewer", name: "Mock Reviewer" },
						{ login: "another-reviewer", name: "Another Reviewer" },
					]),
				listMilestones: (repository) => Effect.succeed(milestones.filter((milestone) => milestone.repository === repository)),
				listMilestoneIssues: (repository, milestoneTitle, limit = 1000) =>
					Effect.succeed(
						issues
							.filter((issue) => issue.repository === repository)
							.slice(0, limit)
							.map((issue) => ({ repository, number: issue.number, title: `${milestoneTitle}: ${issue.title}`, state: issue.state, url: issue.url })),
					),
				createMilestone: (input) =>
					Effect.sync(() => {
						const milestone: MilestoneItem = {
							...input,
							number: Math.max(0, ...milestones.filter((item) => item.repository === input.repository).map((item) => item.number)) + 1,
							state: "open",
							openIssues: 0,
							closedIssues: 0,
							url: `https://github.com/${input.repository}/milestone/new`,
						}
						milestones = [milestone, ...milestones]
						return milestone
					}),
				editMilestone: (input) =>
					Effect.sync(() => {
						const current = milestones.find((item) => item.repository === input.repository && item.number === input.number)
						const milestone: MilestoneItem = {
							repository: input.repository,
							number: input.number,
							title: input.title,
							description: input.description,
							state: input.state,
							dueOn: input.dueOn,
							openIssues: current?.openIssues ?? 0,
							closedIssues: current?.closedIssues ?? 0,
							url: current?.url ?? `https://github.com/${input.repository}/milestone/${input.number}`,
						}
						milestones = milestones.map((item) => (item.repository === input.repository && item.number === input.number ? milestone : item))
						return milestone
					}),
				deleteMilestone: (repository, number) =>
					Effect.sync(() => {
						milestones = milestones.filter((item) => item.repository !== repository || item.number !== number)
					}),
				listBranches: (repository) => Effect.succeed(branches.filter((branch) => branch.repository === repository)),
				createBranch: (input) =>
					Effect.sync(() => {
						const branch: BranchItem = { repository: input.repository, name: input.name, sha: input.sourceSha, protected: false, isDefault: false }
						branches = [branch, ...branches.filter((item) => item.repository !== input.repository || item.name !== input.name)]
						return branch
					}),
				deleteBranch: (repository, branch) =>
					Effect.sync(() => {
						branches = branches.filter((item) => item.repository !== repository || item.name !== branch.name)
					}),
				listEnvironments: (repository) => Effect.succeed(environments.filter((environment) => environment.repository === repository)),
				listDeployments: (repository, environment, limit = 100) =>
					Effect.succeed(
						environments
							.filter((item) => item.repository === repository && item.name === environment)
							.flatMap((item) => (item.latestDeployment ? [item.latestDeployment] : []))
							.slice(0, limit),
					),
				listRunners: (repository) => Effect.succeed(runners.filter((runner) => runner.repository === repository)),
				listNotifications: (includeRead = false) => Effect.succeed(notifications.filter((notification) => includeRead || notification.unread)),
				markNotificationRead: (threadId) =>
					Effect.sync(() => {
						notifications = notifications.map((notification) => (notification.id === threadId ? { ...notification, unread: false, lastReadAt: new Date() } : notification))
					}),
				addPullRequestLabel: () => Effect.void,
				removePullRequestLabel: () => Effect.void,
				addIssueLabel: () => Effect.void,
				removeIssueLabel: () => Effect.void,
				listReleases: (repository, limit = 100) => Effect.succeed(releases.filter((release) => release.repository === repository).slice(0, limit)),
				getRelease: (repository, tagName) =>
					Effect.succeed(
						releases.find((release) => release.repository === repository && release.tagName === tagName) ?? {
							repository,
							tagName,
							name: tagName,
							body: "",
							isDraft: false,
							isPrerelease: false,
							author: username,
							targetCommitish: "main",
							createdAt: new Date("2026-01-01T00:00:00.000Z"),
							publishedAt: null,
							url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(tagName)}`,
						},
					),
				createRelease: (input) =>
					Effect.sync(() => {
						const release: ReleaseItem = {
							repository: input.repository,
							tagName: input.tagName,
							name: input.name,
							body: input.body,
							isDraft: input.isDraft,
							isPrerelease: input.isPrerelease,
							author: username,
							targetCommitish: input.targetCommitish ?? "main",
							createdAt: new Date(),
							publishedAt: input.isDraft ? null : new Date(),
							url: `https://github.com/${input.repository}/releases/tag/${encodeURIComponent(input.tagName)}`,
						}
						releases = [release, ...releases.filter((candidate) => candidate.repository !== input.repository || candidate.tagName !== input.tagName)]
						return release
					}),
				editRelease: (input) =>
					Effect.sync(() => {
						const existing = releases.find((release) => release.repository === input.repository && release.tagName === input.tagName)
						const release: ReleaseItem = {
							...(existing ?? {
								repository: input.repository,
								tagName: input.tagName,
								author: username,
								createdAt: new Date(),
								publishedAt: null,
								url: `https://github.com/${input.repository}/releases/tag/${encodeURIComponent(input.tagName)}`,
							}),
							name: input.name,
							body: input.body,
							isDraft: input.isDraft,
							isPrerelease: input.isPrerelease,
							targetCommitish: input.targetCommitish ?? existing?.targetCommitish ?? "main",
							publishedAt: input.isDraft ? null : (existing?.publishedAt ?? new Date()),
						}
						releases = releases.map((candidate) => (candidate.repository === input.repository && candidate.tagName === input.tagName ? release : candidate))
						if (!existing) releases = [release, ...releases]
						return release
					}),
				deleteRelease: (repository, tagName) =>
					Effect.sync(() => {
						releases = releases.filter((release) => release.repository !== repository || release.tagName !== tagName)
					}),
				listPullRequestPage: (input: ItemListInput<"pullRequest">) => {
					const queueMode = queueModeForListMode(input.mode)
					const filtered = filterByView(queueMode, input.repository, pullRequestSource(queueMode, input.repository), username, strictUserScope)
					return Effect.succeed(slicePage(filtered, input.cursor, input.pageSize))
				},
				listIssuePage: (input: ItemListInput<"issue">) => Effect.succeed(slicePage(filterIssuesByMode(input.mode, input.repository, issues), input.cursor, input.pageSize)),
				listAllPullRequests: (input: {
					readonly kind: "pullRequest"
					readonly mode: "all" | "authored" | "review" | "assigned" | "mentioned"
					readonly repository: string | null
				}) => {
					const queueMode = queueModeForListMode(input.mode)
					return Effect.succeed(filterByView(queueMode, input.repository, pullRequestSource(queueMode, input.repository), username, strictUserScope))
				},
				listAllIssues: (input: { readonly kind: "issue"; readonly mode: "all" | "authored" | "assigned" | "mentioned"; readonly repository: string | null }) =>
					Effect.succeed(filterIssuesByMode(input.mode, input.repository, issues)),
			}),
		)
	},
}
