import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { NotificationItem } from "../../domain.js"
import { CacheService } from "../../services/CacheService.js"
import { GitHubService } from "../../services/GitHubService.js"
import { githubRuntime } from "../../services/runtime.js"

export const notificationItemsAtom = Atom.make<readonly NotificationItem[]>([]).pipe(Atom.keepAlive)
export const notificationSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)
// The visible notification list can be searched, filtered, grouped, and
// sorted independently from the raw service response. Keep the command
// boundary pointed at the actual visible selection rather than re-indexing
// the raw array with a view-relative index.
export const selectedNotificationAtom = Atom.make<NotificationItem | null>(null).pipe(Atom.keepAlive)
export const notificationSelectedIdsAtom = Atom.make<readonly string[]>([]).pipe(Atom.keepAlive)
export const notificationIncludeReadAtom = Atom.make(false).pipe(Atom.keepAlive)
export const notificationTypeFilterAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)

export const loadNotificationsAtom = githubRuntime.fn<boolean>()((includeRead) =>
	Effect.gen(function* () {
		const github = yield* GitHubService
		const cache = yield* CacheService
		const viewer = yield* github.getAuthenticatedUser()
		const cached = yield* cache.readNotificationSummaries(viewer, includeRead).pipe(Effect.catch(() => Effect.succeed(null)))
		return yield* github.listNotifications(includeRead).pipe(
			Effect.tap((data) => cache.writeNotificationSummaries(viewer, includeRead, { repository: viewer, data, fetchedAt: new Date() })),
			Effect.catch((cause) => {
				if (!cached || Date.now() - cached.fetchedAt.getTime() > 5 * 60_000) return Effect.fail(cause)
				return Effect.succeed(cached.data.map((item) => ({ ...item, subject: "Cached notification" })))
			}),
		)
	}),
)
export const markNotificationReadAtom = githubRuntime.fn<string>()((threadId) =>
	Effect.gen(function* () {
		const github = yield* GitHubService
		const viewer = yield* github.getAuthenticatedUser()
		yield* github.markNotificationRead(threadId)
		yield* CacheService.use((cache) => cache.invalidateNotificationSummaries(viewer))
	}),
)
