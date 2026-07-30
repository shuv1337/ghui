import { Effect } from "effect"
import type { CreatePullRequestCommentInput, PendingReview, SubmitPullRequestReviewInput } from "../../domain.js"
import { parsePullRequestComment, parsePullRequestComments } from "../githubNormalize.js"
import { CommentsResponseSchema, PendingReviewSchema, PendingReviewsResponseSchema, PullRequestCommentSchema, ViewerSchema } from "../githubSchemas.js"
import { flattenPages, type GitHubClient } from "./client.js"

const reviewId = (id: string | number) => String(id)

export const makeGitHubReviews = (client: GitHubClient) => {
	const findPendingReview = (repository: string, number: number) =>
		Effect.gen(function* () {
			const viewer = yield* client.json("findPendingReviewViewer", ViewerSchema, ["api", "user"])
			const reviews = yield* client.json("findPendingReview", PendingReviewsResponseSchema, [
				"api",
				"--paginate",
				"--slurp",
				`repos/${repository}/pulls/${number}/reviews?per_page=100`,
			])
			const pending = flattenPages(reviews).find((review) => review.state.toUpperCase() === "PENDING" && review.user?.login === viewer.login)
			if (!pending) return null
			const id = reviewId(pending.id)
			const comments = yield* client.json("listPendingReviewComments", CommentsResponseSchema, [
				"api",
				"--paginate",
				"--slurp",
				`repos/${repository}/pulls/${number}/reviews/${id}/comments?per_page=100`,
			])
			return {
				id,
				repository,
				number,
				commitId: pending.commit_id ?? "",
				comments: parsePullRequestComments(comments),
			} satisfies PendingReview
		})

	const createPendingReview = (repository: string, number: number, commitId: string) =>
		client
			.json("createPendingReview", PendingReviewSchema, ["api", "--method", "POST", `repos/${repository}/pulls/${number}/reviews`, "--input", "-"], {
				stdin: JSON.stringify({ commit_id: commitId }),
			})
			.pipe(
				Effect.map(
					(review): PendingReview => ({
						id: reviewId(review.id),
						repository,
						number,
						commitId: review.commit_id ?? commitId,
						comments: [],
					}),
				),
			)

	const addPendingReviewComment = (review: Pick<PendingReview, "id" | "repository" | "number">, input: CreatePullRequestCommentInput) => {
		const body = {
			body: input.body,
			path: input.path,
			line: input.line,
			side: input.side,
			...(input.startLine === undefined ? {} : { start_line: input.startLine, start_side: input.startSide ?? input.side }),
		}
		return client
			.json(
				"addPendingReviewComment",
				PullRequestCommentSchema,
				["api", "--method", "POST", `repos/${review.repository}/pulls/${review.number}/reviews/${review.id}/comments`, "--input", "-"],
				{ stdin: JSON.stringify(body) },
			)
			.pipe(
				Effect.map(
					(comment) =>
						parsePullRequestComment(comment) ?? {
							id: reviewId(comment.id ?? `${input.path}:${input.side}:${input.line}`),
							path: input.path,
							line: input.line,
							side: input.side,
							author: comment.user?.login ?? "you",
							body: input.body,
							createdAt: comment.created_at ? new Date(comment.created_at) : null,
							url: comment.html_url ?? comment.url ?? null,
							inReplyTo: null,
						},
				),
			)
	}

	const submitPendingReview = (review: Pick<PendingReview, "id" | "repository" | "number">, event: SubmitPullRequestReviewInput["event"], body: string) =>
		client.void("submitPendingReview", ["api", "--method", "POST", `repos/${review.repository}/pulls/${review.number}/reviews/${review.id}/events`, "--input", "-"], {
			stdin: JSON.stringify({ event, body }),
		})

	const discardPendingReview = (review: Pick<PendingReview, "id" | "repository" | "number">) =>
		client.void("discardPendingReview", ["api", "--method", "DELETE", `repos/${review.repository}/pulls/${review.number}/reviews/${review.id}`])

	return { findPendingReview, createPendingReview, addPendingReviewComment, submitPendingReview, discardPendingReview } as const
}
