import { Effect, Option, Schema, Stream } from "effect"
import { config } from "../../config.js"
import type { CreateIssueInput, CreatePullRequestInput, EditIssueInput, EditPullRequestInput, IssueItem, PullRequestItem, RepositoryUser } from "../../domain.js"
import { type ItemListInput, type ItemPage, searchQualifier } from "../../item.js"
import { CommandError } from "../CommandRunner.js"
import { itemPage, parseIssueSearchNode, parsePullRequestSummary } from "../githubNormalize.js"
import {
	issueSearchQuery,
	pullRequestSummarySearchQuery,
	RawIssueSearchNodeSchema,
	RawPullRequestSummaryNodeSchema,
	RepositoryPullRequestsResponseSchema,
	RepositoryUsersResponseSchema,
	repositoryPullRequestsQuery,
	SearchResponseSchema,
	type SearchResponse,
} from "../githubSchemas.js"
import { flattenPages, type GitHubClient, type GitHubError } from "./client.js"

const repositoryParts = (repository: string) => {
	const [owner, name] = repository.split("/")
	return owner && name ? { owner, name } : null
}

export const makeGitHubItems = (client: GitHubClient) => {
	const repeatedFlag = (flag: string, values: readonly string[] | undefined): string[] => values?.flatMap((value) => [flag, value]) ?? []
	const milestoneFlags = (milestone: string | null | undefined): string[] =>
		milestone === undefined ? [] : milestone === null ? ["--remove-milestone"] : ["--milestone", milestone]
	const searchItemPage = <RawSchema extends Schema.Top, Item>(label: string, graphqlQuery: string, schema: RawSchema, parse: (node: RawSchema["Type"]) => Item) => {
		const responseSchema = SearchResponseSchema(schema)
		return <K extends "pullRequest" | "issue">(input: ItemListInput<K>) =>
			Effect.gen(function* () {
				const args = [
					"api",
					"graphql",
					"-f",
					`query=${graphqlQuery}`,
					"-F",
					`searchQuery=${searchQualifier(input)}`,
					"-F",
					`first=${input.pageSize}`,
					...(input.cursor ? ["-F", `after=${input.cursor}`] : []),
				] as const
				const response: SearchResponse<RawSchema["Type"]> = yield* client.json(label, responseSchema, args)
				return itemPage(response.data.search, parse)
			})
	}

	const listPullRequestSearchPage = searchItemPage("listPullRequestSearchPage", pullRequestSummarySearchQuery, RawPullRequestSummaryNodeSchema, parsePullRequestSummary)
	const listIssueSearchPage = searchItemPage("listIssueSearchPage", issueSearchQuery, RawIssueSearchNodeSchema, parseIssueSearchNode)

	const listRepositoryPullRequestPage = Effect.fn("GitHubService.listRepositoryPullRequestPage")(function* (input: {
		repository: string
		cursor: string | null
		pageSize: number
	}) {
		const repo = repositoryParts(input.repository)
		if (!repo) return yield* new CommandError({ command: "gh", args: [], detail: `Invalid repository: ${input.repository}`, cause: input.repository })
		const args = [
			"api",
			"graphql",
			"-f",
			`query=${repositoryPullRequestsQuery}`,
			"-F",
			`owner=${repo.owner}`,
			"-F",
			`name=${repo.name}`,
			"-F",
			`first=${input.pageSize}`,
			...(input.cursor ? ["-F", `after=${input.cursor}`] : []),
		] as const
		const response = yield* client.json("listRepositoryPullRequestPage", RepositoryPullRequestsResponseSchema, args)
		const connection = response.data.repository?.pullRequests
		if (!connection) return yield* new CommandError({ command: "gh", args: [], detail: `Repository not found: ${input.repository}`, cause: input.repository })
		return itemPage(connection, parsePullRequestSummary)
	})

	const listPullRequestPage = Effect.fn("GitHubService.listPullRequestPage")(function* (input: ItemListInput<"pullRequest">) {
		const pageSize = Math.max(1, Math.min(100, input.pageSize))
		if (input.mode === "all" && input.repository !== null) {
			return yield* listRepositoryPullRequestPage({ repository: input.repository, cursor: input.cursor, pageSize })
		}
		return yield* listPullRequestSearchPage({ ...input, pageSize })
	})

	const listIssuePage = Effect.fn("GitHubService.listIssuePage")(function* (input: ItemListInput<"issue">) {
		const pageSize = Math.max(1, Math.min(100, input.pageSize))
		return yield* listIssueSearchPage({ ...input, pageSize })
	})

	const drainItemPages = <K extends "pullRequest" | "issue", Item>(
		query: Omit<ItemListInput<K>, "cursor" | "pageSize">,
		pageFetch: (input: ItemListInput<K>) => Effect.Effect<ItemPage<Item>, GitHubError>,
		limit: number,
	): Effect.Effect<readonly Item[], GitHubError> => {
		type State = { readonly cursor: string | null; readonly fetched: number }
		const stream = Stream.paginate<State, Item, GitHubError>({ cursor: null, fetched: 0 }, ({ cursor, fetched }) => {
			const remaining = limit - fetched
			if (remaining <= 0) return Effect.succeed([[], Option.none()] as const)
			const pageSize = Math.min(100, remaining)
			return pageFetch({ ...query, cursor, pageSize } as ItemListInput<K>).pipe(
				Effect.map((page): readonly [readonly Item[], Option.Option<State>] => {
					const items = page.items.slice(0, remaining)
					const nextFetched = fetched + items.length
					const next: Option.Option<State> =
						page.hasNextPage && page.endCursor && nextFetched < limit ? Option.some({ cursor: page.endCursor, fetched: nextFetched }) : Option.none()
					return [items, next]
				}),
			)
		})
		return Stream.runCollect(stream).pipe(Effect.map((chunk) => Array.from(chunk)))
	}

	const listAllPullRequests = (input: Omit<ItemListInput<"pullRequest">, "cursor" | "pageSize">) =>
		drainItemPages<"pullRequest", PullRequestItem>(input, listPullRequestPage, config.prFetchLimit)
	const listAllIssues = (input: Omit<ItemListInput<"issue">, "cursor" | "pageSize">) => drainItemPages<"issue", IssueItem>(input, listIssuePage, config.prFetchLimit)

	const createIssue = (input: CreateIssueInput) =>
		client.void(
			"createIssue",
			[
				"issue",
				"create",
				"--repo",
				input.repository,
				"--title",
				input.title,
				"--body-file",
				"-",
				...repeatedFlag("--label", input.labels),
				...repeatedFlag("--assignee", input.assignees),
				...milestoneFlags(input.milestone),
			],
			{ stdin: input.body },
		)

	const editIssue = (input: EditIssueInput) =>
		client.void(
			"editIssue",
			[
				"issue",
				"edit",
				String(input.number),
				"--repo",
				input.repository,
				...(input.title === undefined ? [] : ["--title", input.title]),
				...(input.body === undefined ? [] : ["--body-file", "-"]),
				...repeatedFlag("--add-label", input.addLabels),
				...repeatedFlag("--remove-label", input.removeLabels),
				...repeatedFlag("--add-assignee", input.addAssignees),
				...repeatedFlag("--remove-assignee", input.removeAssignees),
				...milestoneFlags(input.milestone),
			],
			input.body === undefined ? undefined : { stdin: input.body },
		)

	const reopenIssue = (repository: string, number: number) => client.void("reopenIssue", ["issue", "reopen", String(number), "--repo", repository])
	const deleteIssue = (repository: string, number: number) => client.void("deleteIssue", ["issue", "delete", String(number), "--repo", repository, "--yes"])

	const createPullRequest = (input: CreatePullRequestInput) =>
		client.void(
			"createPullRequest",
			[
				"pr",
				"create",
				"--repo",
				input.repository,
				"--title",
				input.title,
				"--body-file",
				"-",
				"--base",
				input.base,
				"--head",
				input.head,
				...(input.draft ? ["--draft"] : []),
				...repeatedFlag("--label", input.labels),
				...repeatedFlag("--assignee", input.assignees),
				...repeatedFlag("--reviewer", input.reviewers),
				...milestoneFlags(input.milestone),
			],
			{ stdin: input.body },
		)

	const editPullRequest = (input: EditPullRequestInput) =>
		client.void(
			"editPullRequest",
			[
				"pr",
				"edit",
				String(input.number),
				"--repo",
				input.repository,
				...(input.title === undefined ? [] : ["--title", input.title]),
				...(input.body === undefined ? [] : ["--body-file", "-"]),
				...(input.base === undefined ? [] : ["--base", input.base]),
				...repeatedFlag("--add-label", input.addLabels),
				...repeatedFlag("--remove-label", input.removeLabels),
				...repeatedFlag("--add-assignee", input.addAssignees),
				...repeatedFlag("--remove-assignee", input.removeAssignees),
				...repeatedFlag("--add-reviewer", input.addReviewers),
				...repeatedFlag("--remove-reviewer", input.removeReviewers),
				...milestoneFlags(input.milestone),
			],
			input.body === undefined ? undefined : { stdin: input.body },
		)

	const reopenPullRequest = (repository: string, number: number) => client.void("reopenPullRequest", ["pr", "reopen", String(number), "--repo", repository])
	const approvePullRequest = (repository: string, number: number, body = "") =>
		client.void("approvePullRequest", ["pr", "review", String(number), "--repo", repository, "--approve", "--body-file", "-"], { stdin: body })

	const listAssignees = (repository: string) =>
		client
			.json("listAssignees", RepositoryUsersResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/assignees?per_page=100`])
			.pipe(Effect.map((pages): readonly RepositoryUser[] => flattenPages(pages).map((user) => ({ login: user.login, name: user.name ?? null }))))

	const listReviewers = (repository: string) =>
		client
			.json("listReviewers", RepositoryUsersResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/collaborators?affiliation=all&permission=push&per_page=100`])
			.pipe(Effect.map((pages): readonly RepositoryUser[] => flattenPages(pages).map((user) => ({ login: user.login, name: user.name ?? null }))))

	return {
		listPullRequestPage,
		listIssuePage,
		listAllPullRequests,
		listAllIssues,
		createIssue,
		editIssue,
		reopenIssue,
		deleteIssue,
		createPullRequest,
		editPullRequest,
		reopenPullRequest,
		approvePullRequest,
		listAssignees,
		listReviewers,
	} as const
}
