import { Effect, Schema } from "effect"
import type { NotificationItem, NotificationSubjectType } from "../../domain.js"
import type { GitHubClient } from "./client.js"

const NotificationSchema = Schema.Struct({
	id: Schema.String,
	unread: Schema.Boolean,
	reason: Schema.String,
	updated_at: Schema.String,
	last_read_at: Schema.NullOr(Schema.String),
	subject: Schema.Struct({
		title: Schema.String,
		url: Schema.NullOr(Schema.String),
		latest_comment_url: Schema.NullOr(Schema.String),
		type: Schema.String,
	}),
	repository: Schema.Struct({
		full_name: Schema.String,
		html_url: Schema.String,
	}),
})
const NotificationPagesSchema = Schema.Union([Schema.Array(NotificationSchema), Schema.Array(Schema.Array(NotificationSchema))])

const flattenPages = <T>(value: readonly T[] | readonly (readonly T[])[]): readonly T[] =>
	value.length > 0 && Array.isArray(value[0]) ? (value as readonly (readonly T[])[]).flat() : (value as readonly T[])

const subjectType = (value: string): NotificationSubjectType => {
	switch (value.toLowerCase()) {
		case "issue":
			return "issue"
		case "pullrequest":
			return "pullRequest"
		case "release":
			return "release"
		case "discussion":
			return "discussion"
		case "commit":
			return "commit"
		case "repositoryinvitation":
		case "repository":
			return "repository"
		default:
			return "unknown"
	}
}

export const notificationTargetUrl = (apiUrl: string | null, repositoryUrl: string, type: NotificationSubjectType): string | null => {
	if (!apiUrl) return type === "repository" ? repositoryUrl : null
	const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(issues|pulls|commits)\/([^/?#]+)$/.exec(apiUrl)
	if (!match) return null
	const [, repository, kind, id] = match
	const webKind = kind === "pulls" ? "pull" : kind === "commits" ? "commit" : "issues"
	return `https://github.com/${repository}/${webKind}/${id}`
}

export const makeGitHubNotifications = (client: GitHubClient) => {
	const listNotifications = (includeRead = false) =>
		client
			.json("listNotifications", NotificationPagesSchema, ["api", "--paginate", "--slurp", `notifications?all=${includeRead ? "true" : "false"}&participating=false&per_page=100`])
			.pipe(
				Effect.map((pages): readonly NotificationItem[] =>
					flattenPages(pages).map((thread) => {
						const type = subjectType(thread.subject.type)
						return {
							id: thread.id,
							unread: thread.unread,
							reason: thread.reason,
							subjectType: type,
							subject: thread.subject.title,
							repository: thread.repository.full_name,
							updatedAt: new Date(thread.updated_at),
							lastReadAt: thread.last_read_at ? new Date(thread.last_read_at) : null,
							url: notificationTargetUrl(thread.subject.url, thread.repository.html_url, type),
						}
					}),
				),
			)

	const markNotificationRead = (threadId: string) => client.void("markNotificationRead", ["api", "--method", "PATCH", `notifications/threads/${encodeURIComponent(threadId)}`])

	return { listNotifications, markNotificationRead } as const
}
