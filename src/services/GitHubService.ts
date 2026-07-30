import { Context, Effect, Layer } from "effect"
import { config } from "../config.js"
import {
	type CreateReleaseInput,
	type CreateBranchInput,
	type CreateMilestoneInput,
	type CreateIssueInput,
	type CreatePullRequestInput,
	type CreatePullRequestCommentInput,
	type EditIssueInput,
	type EditPullRequestInput,
	type EditReleaseInput,
	type EditMilestoneInput,
	type BranchItem,
	type MilestoneItem,
	type MilestoneIssue,
	type EnvironmentItem,
	type DeploymentItem,
	type RepositoryRunner,
	type NotificationItem,
	type IssueItem,
	type PendingReview,
	type PullRequestComment,
	type PullRequestItem,
	type PullRequestMergeAction,
	type PullRequestMergeInfo,
	type PullRequestReviewComment,
	type ReleaseItem,
	type RepositoryDetails,
	type RepositoryMergeMethods,
	type RepositoryUser,
	type SubmitPullRequestReviewInput,
	type WorkflowRun,
	type WorkflowRunDetails,
	type Workflow,
	type WorkflowDispatchInput,
	type WorkflowInput,
	type ActionArtifact,
	type ActionJobLog,
} from "../domain.js"
import { type ItemListInput, type ItemPage } from "../item.js"
import { mergeActionCliArgs } from "../mergeActions.js"
import { CommandError, CommandRunner } from "./CommandRunner.js"
import {
	fallbackCreatedComment,
	fallbackEditedReviewComment,
	fallbackReplyComment,
	parseIssueComment,
	parseIssueComments,
	parsePullRequest,
	parsePullRequestComment,
	parsePullRequestComments,
	parsePullRequestFiles,
	parsePullRequestMergeInfo,
	parseRepositoryDetails,
	parseRepositoryMergeMethods,
	parseRunDetails,
	parseWorkflowRuns,
	pullRequestFilesToPatch,
	reviewCommentAsComment,
	sortComments,
} from "./githubNormalize.js"
import {
	CommentsResponseSchema,
	MergeInfoResponseSchema,
	PullRequestAdminMergeResponseSchema,
	PullRequestCommentSchema,
	pullRequestDetailQuery,
	PullRequestDetailResponseSchema,
	PullRequestFilesResponseSchema,
	RepoLabelsResponseSchema,
	RepositoryDetailsResponseSchema,
	RepositoryMergeMethodsResponseSchema,
	repositoryDetailsQuery,
	ViewerSchema,
	WorkflowRunDetailsSchema,
	WorkflowRunListSchema,
} from "./githubSchemas.js"
import { makeGitHubClient, type GitHubError } from "./github/client.js"
import { makeGitHubItems } from "./github/items.js"
import { makeGitHubReleases } from "./github/releases.js"
import { makeGitHubReviews } from "./github/reviews.js"
import { makeGitHubActions } from "./github/actions.js"
import { makeGitHubBranches } from "./github/branches.js"
import { makeGitHubMilestones } from "./github/milestones.js"
import { makeGitHubDeployments } from "./github/deployments.js"
import { makeGitHubRunners } from "./github/runners.js"
import { makeGitHubNotifications } from "./github/notifications.js"
export { isGitHubRateLimitError } from "./githubRateLimit.js"
export type { GitHubError } from "./github/client.js"

const repositoryParts = (repository: string) => {
	const [owner, name] = repository.split("/")
	return owner && name ? { owner, name } : null
}

const REVIEW_EVENT_CLI_FLAG = {
	COMMENT: "--comment",
	APPROVE: "--approve",
	REQUEST_CHANGES: "--request-changes",
} as const satisfies Record<SubmitPullRequestReviewInput["event"], string>

export class GitHubService extends Context.Service<
	GitHubService,
	{
		readonly listPullRequestPage: (input: ItemListInput<"pullRequest">) => Effect.Effect<ItemPage<PullRequestItem>, GitHubError>
		readonly listIssuePage: (input: ItemListInput<"issue">) => Effect.Effect<ItemPage<IssueItem>, GitHubError>
		readonly listAllPullRequests: (input: Omit<ItemListInput<"pullRequest">, "cursor" | "pageSize">) => Effect.Effect<readonly PullRequestItem[], GitHubError>
		readonly listAllIssues: (input: Omit<ItemListInput<"issue">, "cursor" | "pageSize">) => Effect.Effect<readonly IssueItem[], GitHubError>
		readonly getPullRequestDetails: (repository: string, number: number) => Effect.Effect<PullRequestItem, GitHubError>
		readonly getRepositoryDetails: (repository: string) => Effect.Effect<RepositoryDetails, GitHubError>
		readonly getAuthenticatedUser: () => Effect.Effect<string, GitHubError>
		readonly getPullRequestDiff: (repository: string, number: number) => Effect.Effect<string, GitHubError>
		readonly listWorkflowRunsForCommit: (repository: string, headSha: string) => Effect.Effect<readonly WorkflowRun[], GitHubError>
		readonly getWorkflowRunDetails: (repository: string, runId: number) => Effect.Effect<WorkflowRunDetails, GitHubError>
		readonly listWorkflows: (repository: string, limit?: number) => Effect.Effect<readonly Workflow[], GitHubError>
		readonly listWorkflowRuns: (repository: string, limit?: number) => Effect.Effect<readonly WorkflowRun[], GitHubError>
		readonly getWorkflowInputs: (repository: string, workflow: string) => Effect.Effect<readonly WorkflowInput[], CommandError>
		readonly dispatchWorkflow: (input: WorkflowDispatchInput) => Effect.Effect<void, CommandError>
		readonly retryRun: (repository: string, runId: number, failedOnly?: boolean) => Effect.Effect<void, CommandError>
		readonly cancelRun: (repository: string, runId: number) => Effect.Effect<void, CommandError>
		readonly getJobLog: (repository: string, jobId: number) => Effect.Effect<ActionJobLog, CommandError>
		readonly listArtifacts: (repository: string, runId: number) => Effect.Effect<readonly ActionArtifact[], GitHubError>
		readonly downloadArtifact: (repository: string, runId: number, artifactName: string, destination: string) => Effect.Effect<string, CommandError>
		readonly listPullRequestReviewComments: (repository: string, number: number) => Effect.Effect<readonly PullRequestReviewComment[], GitHubError>
		readonly listPullRequestComments: (repository: string, number: number) => Effect.Effect<readonly PullRequestComment[], GitHubError>
		readonly listIssueComments: (repository: string, number: number) => Effect.Effect<readonly PullRequestComment[], GitHubError>
		readonly getPullRequestMergeInfo: (repository: string, number: number) => Effect.Effect<PullRequestMergeInfo, GitHubError>
		readonly getRepositoryMergeMethods: (repository: string) => Effect.Effect<RepositoryMergeMethods, GitHubError>
		readonly mergePullRequest: (repository: string, number: number, action: PullRequestMergeAction) => Effect.Effect<void, CommandError>
		readonly closePullRequest: (repository: string, number: number) => Effect.Effect<void, CommandError>
		readonly closeIssue: (repository: string, number: number) => Effect.Effect<void, CommandError>
		readonly createIssue: (input: CreateIssueInput) => Effect.Effect<void, CommandError>
		readonly editIssue: (input: EditIssueInput) => Effect.Effect<void, CommandError>
		readonly reopenIssue: (repository: string, number: number) => Effect.Effect<void, CommandError>
		readonly deleteIssue: (repository: string, number: number) => Effect.Effect<void, CommandError>
		readonly createPullRequest: (input: CreatePullRequestInput) => Effect.Effect<void, CommandError>
		readonly editPullRequest: (input: EditPullRequestInput) => Effect.Effect<void, CommandError>
		readonly reopenPullRequest: (repository: string, number: number) => Effect.Effect<void, CommandError>
		readonly approvePullRequest: (repository: string, number: number, body?: string) => Effect.Effect<void, CommandError>
		readonly createPullRequestComment: (input: CreatePullRequestCommentInput) => Effect.Effect<PullRequestReviewComment, GitHubError>
		readonly createPullRequestIssueComment: (repository: string, number: number, body: string) => Effect.Effect<PullRequestComment, GitHubError>
		readonly replyToReviewComment: (repository: string, number: number, inReplyTo: string, body: string) => Effect.Effect<PullRequestComment, GitHubError>
		readonly editPullRequestIssueComment: (repository: string, commentId: string, body: string) => Effect.Effect<PullRequestComment, GitHubError>
		readonly editReviewComment: (repository: string, commentId: string, body: string) => Effect.Effect<PullRequestComment, GitHubError>
		readonly deletePullRequestIssueComment: (repository: string, commentId: string) => Effect.Effect<void, CommandError>
		readonly deleteReviewComment: (repository: string, commentId: string) => Effect.Effect<void, CommandError>
		readonly submitPullRequestReview: (input: SubmitPullRequestReviewInput) => Effect.Effect<void, CommandError>
		readonly findPendingReview: (repository: string, number: number) => Effect.Effect<PendingReview | null, GitHubError>
		readonly createPendingReview: (repository: string, number: number, commitId: string) => Effect.Effect<PendingReview, GitHubError>
		readonly addPendingReviewComment: (
			review: Pick<PendingReview, "id" | "repository" | "number">,
			input: CreatePullRequestCommentInput,
		) => Effect.Effect<PullRequestReviewComment, GitHubError>
		readonly submitPendingReview: (
			review: Pick<PendingReview, "id" | "repository" | "number">,
			event: SubmitPullRequestReviewInput["event"],
			body: string,
		) => Effect.Effect<void, CommandError>
		readonly discardPendingReview: (review: Pick<PendingReview, "id" | "repository" | "number">) => Effect.Effect<void, CommandError>
		readonly toggleDraftStatus: (repository: string, number: number, isDraft: boolean) => Effect.Effect<void, CommandError>
		readonly listRepoLabels: (repository: string) => Effect.Effect<readonly { readonly name: string; readonly color: string | null }[], GitHubError>
		readonly listAssignees: (repository: string) => Effect.Effect<readonly RepositoryUser[], GitHubError>
		readonly listReviewers: (repository: string) => Effect.Effect<readonly RepositoryUser[], GitHubError>
		readonly listMilestones: (repository: string) => Effect.Effect<readonly MilestoneItem[], GitHubError>
		readonly listMilestoneIssues: (repository: string, milestoneTitle: string, limit?: number) => Effect.Effect<readonly MilestoneIssue[], GitHubError>
		readonly createMilestone: (input: CreateMilestoneInput) => Effect.Effect<MilestoneItem, GitHubError>
		readonly editMilestone: (input: EditMilestoneInput) => Effect.Effect<MilestoneItem, GitHubError>
		readonly deleteMilestone: (repository: string, number: number) => Effect.Effect<void, CommandError>
		readonly listBranches: (repository: string) => Effect.Effect<readonly BranchItem[], GitHubError>
		readonly createBranch: (input: CreateBranchInput) => Effect.Effect<BranchItem, CommandError>
		readonly deleteBranch: (repository: string, branch: BranchItem, selectedBranchName: string | null) => Effect.Effect<void, CommandError>
		readonly listEnvironments: (repository: string) => Effect.Effect<readonly EnvironmentItem[], GitHubError>
		readonly listDeployments: (repository: string, environment: string, limit?: number) => Effect.Effect<readonly DeploymentItem[], GitHubError>
		readonly listRunners: (repository: string) => Effect.Effect<readonly RepositoryRunner[], GitHubError>
		readonly listNotifications: (includeRead?: boolean) => Effect.Effect<readonly NotificationItem[], GitHubError>
		readonly markNotificationRead: (threadId: string) => Effect.Effect<void, CommandError>
		readonly addPullRequestLabel: (repository: string, number: number, label: string) => Effect.Effect<void, CommandError>
		readonly removePullRequestLabel: (repository: string, number: number, label: string) => Effect.Effect<void, CommandError>
		readonly addIssueLabel: (repository: string, number: number, label: string) => Effect.Effect<void, CommandError>
		readonly removeIssueLabel: (repository: string, number: number, label: string) => Effect.Effect<void, CommandError>
		readonly listReleases: (repository: string, limit?: number) => Effect.Effect<readonly ReleaseItem[], GitHubError>
		readonly getRelease: (repository: string, tagName: string) => Effect.Effect<ReleaseItem, GitHubError>
		readonly createRelease: (input: CreateReleaseInput) => Effect.Effect<ReleaseItem, GitHubError>
		readonly editRelease: (input: EditReleaseInput) => Effect.Effect<ReleaseItem, GitHubError>
		readonly deleteRelease: (repository: string, tagName: string) => Effect.Effect<void, CommandError>
	}
>()("ghui/GitHubService") {
	static readonly layerNoDeps = Layer.effect(
		GitHubService,
		Effect.gen(function* () {
			const command = yield* CommandRunner
			const github = makeGitHubClient(command)
			const ghJson = github.json
			const ghVoid = github.void
			const {
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
			} = makeGitHubItems(github)
			const { findPendingReview, createPendingReview, addPendingReviewComment, submitPendingReview, discardPendingReview } = makeGitHubReviews(github)
			const { listReleases, getRelease, createRelease, editRelease, deleteRelease } = makeGitHubReleases(github)
			const actions = makeGitHubActions(github, config.runFetchLimit)
			const branches = makeGitHubBranches(github)
			const milestones = makeGitHubMilestones(github)
			const deployments = makeGitHubDeployments(github)
			const runners = makeGitHubRunners(github)
			const notifications = makeGitHubNotifications(github)

			const getPullRequestDetails = Effect.fn("GitHubService.getPullRequestDetails")(function* (repository: string, number: number) {
				const repo = repositoryParts(repository)
				if (!repo) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Invalid repository: ${repository}`, cause: repository })
				}

				const response = yield* command.runSchema(PullRequestDetailResponseSchema, "gh", [
					"api",
					"graphql",
					"-f",
					`query=${pullRequestDetailQuery}`,
					"-F",
					`owner=${repo.owner}`,
					"-F",
					`name=${repo.name}`,
					"-F",
					`number=${number}`,
				])
				const pullRequest = response.data.repository?.pullRequest
				if (!pullRequest) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Pull request not found: ${repository}#${number}`, cause: `${repository}#${number}` })
				}
				return parsePullRequest(pullRequest)
			})

			const authenticatedUser = yield* ghJson("getAuthenticatedUser", ViewerSchema, ["api", "user"]).pipe(
				Effect.map((viewer) => viewer.login),
				Effect.cachedWithTTL("5 minutes"),
			)
			const getAuthenticatedUser = () => authenticatedUser

			const getRepositoryDetails = Effect.fn("GitHubService.getRepositoryDetails")(function* (repository: string) {
				const repo = repositoryParts(repository)
				if (!repo) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Invalid repository: ${repository}`, cause: repository })
				}
				const response = yield* ghJson("getRepositoryDetails", RepositoryDetailsResponseSchema, [
					"api",
					"graphql",
					"-f",
					`query=${repositoryDetailsQuery}`,
					"-F",
					`owner=${repo.owner}`,
					"-F",
					`name=${repo.name}`,
				])
				const node = response.data.repository
				if (!node) {
					return yield* new CommandError({ command: "gh", args: [], detail: `Repository not found: ${repository}`, cause: repository })
				}
				return parseRepositoryDetails(repository, node)
			})

			const getPullRequestDiff = (repository: string, number: number) =>
				ghJson("getPullRequestDiff", PullRequestFilesResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/pulls/${number}/files`]).pipe(
					Effect.map((response) => pullRequestFilesToPatch(parsePullRequestFiles(response))),
				)

			const RUN_LIST_FIELDS = "databaseId,number,attempt,workflowName,name,displayTitle,event,headBranch,headSha,status,conclusion,url,createdAt,startedAt,updatedAt"

			const listWorkflowRunsForCommit = (repository: string, headSha: string) =>
				ghJson("listWorkflowRunsForCommit", WorkflowRunListSchema, [
					"run",
					"list",
					"--repo",
					repository,
					"--commit",
					headSha,
					"--limit",
					String(config.runFetchLimit),
					"--json",
					RUN_LIST_FIELDS,
				]).pipe(Effect.map(parseWorkflowRuns))

			const getWorkflowRunDetails = (repository: string, runId: number) =>
				ghJson("getWorkflowRunDetails", WorkflowRunDetailsSchema, ["run", "view", String(runId), "--repo", repository, "--json", `${RUN_LIST_FIELDS},jobs`]).pipe(
					Effect.map(parseRunDetails),
				)

			const listPullRequestReviewComments = (repository: string, number: number) =>
				ghJson("listPullRequestReviewComments", CommentsResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/pulls/${number}/comments`]).pipe(
					Effect.map(parsePullRequestComments),
				)

			const listPullRequestComments = Effect.fn("GitHubService.listPullRequestComments")(function* (repository: string, number: number) {
				const [issueComments, reviewComments] = yield* Effect.all(
					[
						ghJson("listPullRequestIssueComments", CommentsResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/issues/${number}/comments`]).pipe(
							Effect.map(parseIssueComments),
						),
						listPullRequestReviewComments(repository, number).pipe(Effect.map((comments) => comments.map(reviewCommentAsComment))),
					],
					{ concurrency: "unbounded" },
				)

				return sortComments([...issueComments, ...reviewComments])
			})

			const listIssueComments = (repository: string, number: number) =>
				ghJson("listIssueComments", CommentsResponseSchema, ["api", "--paginate", "--slurp", `repos/${repository}/issues/${number}/comments`]).pipe(Effect.map(parseIssueComments))

			const getPullRequestMergeInfo = Effect.fn("GitHubService.getPullRequestMergeInfo")(function* (repository: string, number: number) {
				const info = yield* ghJson("getPullRequestMergeInfo", MergeInfoResponseSchema, [
					"pr",
					"view",
					String(number),
					"--repo",
					repository,
					"--json",
					"number,title,state,isDraft,mergeable,reviewDecision,autoMergeRequest,statusCheckRollup",
				])
				const repo = repositoryParts(repository)
				const adminInfo = repo
					? yield* ghJson("getPullRequestAdminMergeInfo", PullRequestAdminMergeResponseSchema, [
							"api",
							"graphql",
							"-F",
							`owner=${repo.owner}`,
							"-F",
							`name=${repo.name}`,
							"-F",
							`number=${number}`,
							"-f",
							"query=query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { viewerCanMergeAsAdmin } } }",
						])
					: null

				return parsePullRequestMergeInfo(repository, info, adminInfo?.data.repository.pullRequest?.viewerCanMergeAsAdmin ?? false)
			})

			const getRepositoryMergeMethods = Effect.fn("GitHubService.getRepositoryMergeMethods")(function* (repository: string) {
				const response = yield* ghJson("getRepositoryMergeMethods", RepositoryMergeMethodsResponseSchema, [
					"repo",
					"view",
					repository,
					"--json",
					"squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed",
				])
				return parseRepositoryMergeMethods(response)
			})

			const mergePullRequest = (repository: string, number: number, action: PullRequestMergeAction) =>
				ghVoid("mergePullRequest", ["pr", "merge", String(number), "--repo", repository, ...mergeActionCliArgs(action)])

			const closePullRequest = (repository: string, number: number) => ghVoid("closePullRequest", ["pr", "close", String(number), "--repo", repository])

			const closeIssue = (repository: string, number: number) => ghVoid("closeIssue", ["issue", "close", String(number), "--repo", repository])

			const createPullRequestIssueComment = Effect.fn("GitHubService.createPullRequestIssueComment")(function* (repository: string, number: number, body: string) {
				const response = yield* command.runSchema(PullRequestCommentSchema, "gh", [
					"api",
					"--method",
					"POST",
					`repos/${repository}/issues/${number}/comments`,
					"-f",
					`body=${body}`,
				])
				return parseIssueComment(response)
			})

			const replyToReviewComment = Effect.fn("GitHubService.replyToReviewComment")(function* (repository: string, number: number, inReplyTo: string, body: string) {
				const response = yield* command.runSchema(PullRequestCommentSchema, "gh", [
					"api",
					"--method",
					"POST",
					`repos/${repository}/pulls/${number}/comments/${inReplyTo}/replies`,
					"-f",
					`body=${body}`,
				])
				const review = parsePullRequestComment(response)
				if (!review) return fallbackReplyComment(inReplyTo, body)
				return reviewCommentAsComment({ ...review, inReplyTo: review.inReplyTo ?? inReplyTo })
			})

			const createPullRequestComment = Effect.fn("GitHubService.createPullRequestComment")(function* (input: CreatePullRequestCommentInput) {
				const response = yield* command.runSchema(PullRequestCommentSchema, "gh", [
					"api",
					"--method",
					"POST",
					`repos/${input.repository}/pulls/${input.number}/comments`,
					"-f",
					`body=${input.body}`,
					"-f",
					`commit_id=${input.commitId}`,
					"-f",
					`path=${input.path}`,
					"-F",
					`line=${input.line}`,
					"-f",
					`side=${input.side}`,
					...(input.startLine === undefined ? [] : ["-F", `start_line=${input.startLine}`, "-f", `start_side=${input.startSide ?? input.side}`]),
				])
				return parsePullRequestComment(response) ?? fallbackCreatedComment(input)
			})

			const editPullRequestIssueComment = Effect.fn("GitHubService.editPullRequestIssueComment")(function* (repository: string, commentId: string, body: string) {
				const response = yield* command.runSchema(PullRequestCommentSchema, "gh", [
					"api",
					"--method",
					"PATCH",
					`repos/${repository}/issues/comments/${commentId}`,
					"-f",
					`body=${body}`,
				])
				return parseIssueComment(response)
			})

			const editReviewComment = Effect.fn("GitHubService.editReviewComment")(function* (repository: string, commentId: string, body: string) {
				const response = yield* command.runSchema(PullRequestCommentSchema, "gh", [
					"api",
					"--method",
					"PATCH",
					`repos/${repository}/pulls/comments/${commentId}`,
					"-f",
					`body=${body}`,
				])
				const review = parsePullRequestComment(response)
				if (!review) return fallbackEditedReviewComment(commentId, body)
				return reviewCommentAsComment(review)
			})

			const deletePullRequestIssueComment = (repository: string, commentId: string) =>
				ghVoid("deletePullRequestIssueComment", ["api", "--method", "DELETE", `repos/${repository}/issues/comments/${commentId}`])

			const deleteReviewComment = (repository: string, commentId: string) =>
				ghVoid("deleteReviewComment", ["api", "--method", "DELETE", `repos/${repository}/pulls/comments/${commentId}`])

			const submitPullRequestReview = (input: SubmitPullRequestReviewInput) =>
				ghVoid("submitPullRequestReview", ["pr", "review", String(input.number), "--repo", input.repository, REVIEW_EVENT_CLI_FLAG[input.event], "--body", input.body])

			const toggleDraftStatus = (repository: string, number: number, isDraft: boolean) =>
				ghVoid("toggleDraftStatus", ["pr", "ready", String(number), "--repo", repository, ...(isDraft ? [] : ["--undo"])])

			const listRepoLabels = (repository: string) =>
				ghJson("listRepoLabels", RepoLabelsResponseSchema, ["label", "list", "--repo", repository, "--json", "name,color", "--limit", "1000"]).pipe(
					Effect.map((labels) => labels.map((label) => ({ name: label.name, color: `#${label.color}` }))),
				)

			const addPullRequestLabel = (repository: string, number: number, label: string) =>
				ghVoid("addPullRequestLabel", ["pr", "edit", String(number), "--repo", repository, "--add-label", label])

			const removePullRequestLabel = (repository: string, number: number, label: string) =>
				ghVoid("removePullRequestLabel", ["pr", "edit", String(number), "--repo", repository, "--remove-label", label])

			const addIssueLabel = (repository: string, number: number, label: string) =>
				ghVoid("addIssueLabel", ["issue", "edit", String(number), "--repo", repository, "--add-label", label])

			const removeIssueLabel = (repository: string, number: number, label: string) =>
				ghVoid("removeIssueLabel", ["issue", "edit", String(number), "--repo", repository, "--remove-label", label])

			return GitHubService.of({
				listPullRequestPage,
				listIssuePage,
				listAllPullRequests,
				listAllIssues,
				getPullRequestDetails,
				getRepositoryDetails,
				getAuthenticatedUser,
				getPullRequestDiff,
				listWorkflowRunsForCommit,
				getWorkflowRunDetails,
				...actions,
				listPullRequestReviewComments,
				listPullRequestComments,
				listIssueComments,
				getPullRequestMergeInfo,
				getRepositoryMergeMethods,
				mergePullRequest,
				closePullRequest,
				closeIssue,
				createIssue,
				editIssue,
				reopenIssue,
				deleteIssue,
				createPullRequest,
				editPullRequest,
				reopenPullRequest,
				approvePullRequest,
				createPullRequestComment,
				createPullRequestIssueComment,
				replyToReviewComment,
				editPullRequestIssueComment,
				editReviewComment,
				deletePullRequestIssueComment,
				deleteReviewComment,
				submitPullRequestReview,
				findPendingReview,
				createPendingReview,
				addPendingReviewComment,
				submitPendingReview,
				discardPendingReview,
				toggleDraftStatus,
				listRepoLabels,
				listAssignees,
				listReviewers,
				...milestones,
				...branches,
				...deployments,
				...runners,
				...notifications,
				addPullRequestLabel,
				removePullRequestLabel,
				addIssueLabel,
				removeIssueLabel,
				listReleases,
				getRelease,
				createRelease,
				editRelease,
				deleteRelease,
			})
		}),
	)

	static readonly layer = GitHubService.layerNoDeps.pipe(Layer.provide(CommandRunner.layer))
}
