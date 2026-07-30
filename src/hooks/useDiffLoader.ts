import { Effect } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { PendingReview, PullRequestItem, PullRequestReviewComment } from "../domain.js"
import { errorMessage } from "../errors.js"
import { capRecord } from "../recordCap.js"
import {
	diffCommentsLoadedAtom,
	pendingReviewForRevision,
	pendingReviewLoadedAtom,
	pullRequestDiffCacheAtom,
	pullRequestDiffForRevision,
	pullRequestReviewCommentsForRevision,
} from "../ui/diff/atoms.js"
import { PullRequestDiffState, pullRequestDiffKey, splitPatchFiles, type PullRequestDiffState as PullRequestDiffStateType } from "../ui/diff.js"
import { groupDiffCommentThreads, isLocalDiffComment } from "../ui/diff/comments.js"
import { pullRequestRevisionAtomKey } from "../ui/pullRequests/atoms.js"

// Cap of the in-memory diff/threads caches. One entry per PR-revision
// (url + headRefOid) ever opened — without a cap, day-long sessions
// accumulate every diff the user has ever scrolled through.
const DIFF_CACHE_CAP = 32

type LoadStatus = "loading" | "ready"

export interface UseDiffLoaderInput {
	readonly registry: AtomRegistry.AtomRegistry
	readonly setPullRequestDiffCache: (next: (prev: Record<string, PullRequestDiffStateType>) => Record<string, PullRequestDiffStateType>) => void
	readonly setDiffCommentsLoaded: (next: (prev: Record<string, LoadStatus>) => Record<string, LoadStatus>) => void
	readonly setDiffCommentThreads: (next: (prev: Record<string, readonly PullRequestReviewComment[]>) => Record<string, readonly PullRequestReviewComment[]>) => void
	readonly setPendingReviewByDiffKey: (next: (prev: Record<string, PendingReview | null>) => Record<string, PendingReview | null>) => void
	readonly setPendingReviewLoaded: (next: (prev: Record<string, "loading" | "ready" | "error">) => Record<string, "loading" | "ready" | "error">) => void
	readonly flashNotice: (msg: string) => void
}

export interface DiffLoader {
	readonly loadPendingReview: (pullRequest: PullRequestItem, force?: boolean) => void
	readonly loadPullRequestReviewComments: (pullRequest: PullRequestItem, force?: boolean) => void
	readonly loadPullRequestDiff: (pullRequest: PullRequestItem, options?: { readonly force?: boolean; readonly includeComments?: boolean }) => void
}

/**
 * Loads the patch text for a PR (via `pullRequestDiffAtom`, a
 * `runtime.fn`) and its review-comment threads. Threads are merged so
 * optimistic local comments survive a server refresh; the local-comment
 * heuristic is `isLocalDiffComment(comment)`. Both loaders dedupe via
 * the cache state — cached Loading/Ready is reused unless `force` is
 * set.
 */
export const useDiffLoader = ({
	registry,
	setPullRequestDiffCache,
	setDiffCommentsLoaded,
	setDiffCommentThreads,
	setPendingReviewByDiffKey,
	setPendingReviewLoaded,
	flashNotice,
}: UseDiffLoaderInput): DiffLoader => {
	const loadPendingReview = (pullRequest: PullRequestItem, force = false) => {
		const key = pullRequestDiffKey(pullRequest)
		const previous = registry.get(pendingReviewLoadedAtom)[key]
		if (!force && previous === "ready") return
		setPendingReviewLoaded((current) => capRecord({ ...current, [key]: "loading" }, DIFF_CACHE_CAP))
		const pendingAtom = pendingReviewForRevision(pullRequestRevisionAtomKey(pullRequest))
		if (force) registry.refresh(pendingAtom)
		void Effect.runPromise(AtomRegistry.getResult(registry, pendingAtom, { suspendOnWaiting: true }))
			.then((review) => {
				setPendingReviewByDiffKey((current) => capRecord({ ...current, [key]: review }, DIFF_CACHE_CAP))
				setPendingReviewLoaded((current) => capRecord({ ...current, [key]: "ready" }, DIFF_CACHE_CAP))
			})
			.catch((error) => {
				setPendingReviewLoaded((current) => capRecord({ ...current, [key]: "error" }, DIFF_CACHE_CAP))
				flashNotice(errorMessage(error))
			})
	}

	const loadPullRequestReviewComments = (pullRequest: PullRequestItem, force = false) => {
		const key = pullRequestDiffKey(pullRequest)
		const previousLoadState = registry.get(diffCommentsLoadedAtom)[key]
		if (!force && previousLoadState) return
		setDiffCommentsLoaded((current) => capRecord({ ...current, [key]: "loading" }, DIFF_CACHE_CAP))
		const commentsAtom = pullRequestReviewCommentsForRevision(pullRequestRevisionAtomKey(pullRequest))
		if (force) registry.refresh(commentsAtom)
		void Effect.runPromise(AtomRegistry.getResult(registry, commentsAtom, { suspendOnWaiting: true }))
			.then((comments) => {
				setDiffCommentsLoaded((current) => capRecord({ ...current, [key]: "ready" }, DIFF_CACHE_CAP))
				setDiffCommentThreads((current) => {
					const prefix = `${key}:`
					const threads = groupDiffCommentThreads(pullRequest, comments)
					const next: Record<string, readonly PullRequestReviewComment[]> = Object.fromEntries(Object.entries(current).filter(([threadKey]) => !threadKey.startsWith(prefix)))
					for (const [threadKey, threadComments] of Object.entries(current)) {
						if (!threadKey.startsWith(prefix)) continue
						const localComments = threadComments.filter(isLocalDiffComment)
						if (localComments.length > 0) {
							next[threadKey] = [...(threads[threadKey] ?? []), ...localComments]
						}
					}
					for (const [threadKey, threadComments] of Object.entries(threads)) {
						if (!next[threadKey]) next[threadKey] = threadComments
					}
					// `diffCommentThreads` is keyed by `pullRequestDiffKey(pr):lineRef`
					// — one entry per thread. Cap to ~16 PRs worth of threads
					// (assume up to a few dozen threads per PR).
					return capRecord(next, DIFF_CACHE_CAP * 32)
				})
			})
			.catch((error) => {
				setDiffCommentsLoaded((current) => {
					if (previousLoadState === "ready") return { ...current, [key]: previousLoadState }
					const next = { ...current }
					delete next[key]
					return next
				})
				flashNotice(errorMessage(error))
			})
	}

	const loadPullRequestDiff = (pullRequest: PullRequestItem, options: { readonly force?: boolean; readonly includeComments?: boolean } = {}) => {
		const force = options.force ?? false
		const includeComments = options.includeComments ?? false
		const key = pullRequestDiffKey(pullRequest)
		const existing = registry.get(pullRequestDiffCacheAtom)[key]
		if (includeComments) {
			loadPullRequestReviewComments(pullRequest, force)
			loadPendingReview(pullRequest, force)
		}
		if (!force && existing && (existing._tag === "Ready" || existing._tag === "Loading")) return

		setPullRequestDiffCache((current) => capRecord({ ...current, [key]: PullRequestDiffState.Loading() }, DIFF_CACHE_CAP))
		const diffAtom = pullRequestDiffForRevision(pullRequestRevisionAtomKey(pullRequest))
		if (force) registry.refresh(diffAtom)
		void Effect.runPromise(AtomRegistry.getResult(registry, diffAtom, { suspendOnWaiting: true }))
			.then((patch) => {
				setPullRequestDiffCache((current) =>
					capRecord(
						{
							...current,
							[key]: PullRequestDiffState.Ready({ patch, files: splitPatchFiles(patch) }),
						},
						DIFF_CACHE_CAP,
					),
				)
			})
			.catch((error) => {
				setPullRequestDiffCache((current) =>
					capRecord(
						{
							...current,
							[key]: PullRequestDiffState.Error({ error: errorMessage(error) }),
						},
						DIFF_CACHE_CAP,
					),
				)
				flashNotice(errorMessage(error))
			})
	}

	return { loadPendingReview, loadPullRequestReviewComments, loadPullRequestDiff }
}
