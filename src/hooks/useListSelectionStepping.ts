import type { IssueItem, PullRequestItem, ReleaseItem } from "../domain.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import type { RepositoryListItem } from "../ui/RepoList.js"

export interface UseListSelectionSteppingInput {
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly visiblePullRequests: readonly PullRequestItem[]
	readonly issues: readonly IssueItem[]
	readonly repositoryItems: readonly RepositoryListItem[]
	readonly releases: readonly ReleaseItem[]
	readonly resourceItemsLength: number
	readonly changeItemsLength: number
	readonly notificationItemsLength: number
	readonly loadMoreSlotAvailable: boolean
	readonly issueLoadMoreSlotAvailable: boolean
	readonly groupStarts: readonly number[]
	readonly getCurrentGroupIndex: (current: number) => number
	readonly setSelectedIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedIssueIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedRepositoryIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedReleaseIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedResourceIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedChangeIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedNotificationIndex: (next: number | ((current: number) => number)) => void
}

export interface ListSelectionStepping {
	readonly stepSelected: (delta: number) => void
	readonly stepSelectedDown: (count?: number) => void
	readonly stepSelectedUp: (count?: number) => void
	readonly stepSelectedDownWithLoadMore: () => void
	readonly stepSelectedUpWrap: () => void
	readonly moveSelectedToPreviousGroup: () => void
	readonly moveSelectedToNextGroup: () => void
}

/**
 * Movement helpers shared across surfaces. Each helper routes to the right
 * list (repo/issue/PR) based on `activeWorkspaceSurface`.
 *
 * For the PR list, when `loadMoreSlotAvailable` is true the valid index range
 * is `[0, visiblePullRequests.length]` — one past the last PR represents the
 * load-more pseudo-row. Stepping down past the tail lands on it; pressing
 * Enter there triggers `loadMorePullRequests` via the keymap layer (not from
 * here). j-wrap behaviour at the very bottom wraps to 0 like before.
 *
 * Up-stepping never wraps — PR/Issue lists are long and load lazily, so wrap-
 * to-bottom would jump past unloaded rows.
 */
export const useListSelectionStepping = ({
	activeWorkspaceSurface,
	visiblePullRequests,
	issues,
	repositoryItems,
	releases,
	resourceItemsLength,
	changeItemsLength,
	notificationItemsLength,
	loadMoreSlotAvailable,
	issueLoadMoreSlotAvailable,
	groupStarts,
	getCurrentGroupIndex,
	setSelectedIndex,
	setSelectedIssueIndex,
	setSelectedRepositoryIndex,
	setSelectedReleaseIndex,
	setSelectedResourceIndex,
	setSelectedChangeIndex,
	setSelectedNotificationIndex,
}: UseListSelectionSteppingInput): ListSelectionStepping => {
	const prMaxIndex = () => Math.max(0, visiblePullRequests.length - 1 + (loadMoreSlotAvailable ? 1 : 0))
	const issueMaxIndex = () => Math.max(0, issues.length - 1 + (issueLoadMoreSlotAvailable ? 1 : 0))
	const moveSelectedToPreviousGroup = () =>
		setSelectedIndex((current) => {
			if (activeWorkspaceSurface !== "pullRequests") return current
			if (visiblePullRequests.length === 0 || groupStarts.length === 0) return 0
			const currentGroup = getCurrentGroupIndex(current)
			if (currentGroup <= 0) return groupStarts[groupStarts.length - 1]!
			return groupStarts[currentGroup - 1]!
		})
	const moveSelectedToNextGroup = () =>
		setSelectedIndex((current) => {
			if (activeWorkspaceSurface !== "pullRequests") return current
			if (visiblePullRequests.length === 0 || groupStarts.length === 0) return 0
			const currentGroup = getCurrentGroupIndex(current)
			if (currentGroup >= groupStarts.length - 1) return groupStarts[0]!
			return groupStarts[currentGroup + 1]!
		})
	const stepSelected = (delta: number) =>
		activeWorkspaceSurface === "repos"
			? setSelectedRepositoryIndex((current) => {
					if (repositoryItems.length === 0) return 0
					return Math.max(0, Math.min(repositoryItems.length - 1, current + delta))
				})
			: activeWorkspaceSurface === "notifications"
				? setSelectedNotificationIndex((current) => {
						if (notificationItemsLength === 0) return 0
						return Math.max(0, Math.min(notificationItemsLength - 1, current + delta))
					})
				: activeWorkspaceSurface === "branches" || activeWorkspaceSurface === "milestones" || activeWorkspaceSurface === "environments" || activeWorkspaceSurface === "runners"
					? setSelectedResourceIndex((current) => {
							if (resourceItemsLength === 0) return 0
							return Math.max(0, Math.min(resourceItemsLength - 1, current + delta))
						})
					: activeWorkspaceSurface === "changes"
						? setSelectedChangeIndex((current) => {
								if (changeItemsLength === 0) return 0
								return Math.max(0, Math.min(changeItemsLength - 1, current + delta))
							})
						: activeWorkspaceSurface === "issues"
							? setSelectedIssueIndex((current) => {
									if (issues.length === 0) return 0
									return Math.max(0, Math.min(issueMaxIndex(), current + delta))
								})
							: activeWorkspaceSurface === "releases"
								? setSelectedReleaseIndex((current) => {
										if (releases.length === 0) return 0
										return Math.max(0, Math.min(releases.length - 1, current + delta))
									})
								: setSelectedIndex((current) => {
										if (visiblePullRequests.length === 0) return 0
										return Math.max(0, Math.min(prMaxIndex(), current + delta))
									})
	const stepSelectedDown = (count = 1) => stepSelected(count)
	const stepSelectedUp = (count = 1) => stepSelected(-count)
	const stepSelectedDownWithLoadMore = () => {
		if (activeWorkspaceSurface === "repos") {
			setSelectedRepositoryIndex((current) => {
				if (repositoryItems.length === 0) return 0
				return current >= repositoryItems.length - 1 ? 0 : current + 1
			})
			return
		}
		if (activeWorkspaceSurface === "issues") {
			setSelectedIssueIndex((current) => {
				if (issues.length === 0) return 0
				const max = issueMaxIndex()
				return current >= max ? 0 : current + 1
			})
			return
		}
		if (activeWorkspaceSurface === "notifications") {
			setSelectedNotificationIndex((current) => (notificationItemsLength === 0 || current >= notificationItemsLength - 1 ? 0 : current + 1))
			return
		}
		if (activeWorkspaceSurface === "branches" || activeWorkspaceSurface === "milestones" || activeWorkspaceSurface === "environments" || activeWorkspaceSurface === "runners") {
			setSelectedResourceIndex((current) => (resourceItemsLength === 0 || current >= resourceItemsLength - 1 ? 0 : current + 1))
			return
		}
		if (activeWorkspaceSurface === "changes") {
			setSelectedChangeIndex((current) => (changeItemsLength === 0 || current >= changeItemsLength - 1 ? 0 : current + 1))
			return
		}
		if (activeWorkspaceSurface === "releases") {
			setSelectedReleaseIndex((current) => (releases.length === 0 || current >= releases.length - 1 ? 0 : current + 1))
			return
		}
		setSelectedIndex((current) => {
			if (visiblePullRequests.length === 0) return 0
			const max = prMaxIndex()
			return current >= max ? 0 : current + 1
		})
	}
	const stepSelectedUpWrap = () =>
		activeWorkspaceSurface === "repos"
			? setSelectedRepositoryIndex((current) => Math.max(0, current - 1))
			: activeWorkspaceSurface === "notifications"
				? setSelectedNotificationIndex((current) => Math.max(0, current - 1))
				: activeWorkspaceSurface === "branches" || activeWorkspaceSurface === "milestones" || activeWorkspaceSurface === "environments" || activeWorkspaceSurface === "runners"
					? setSelectedResourceIndex((current) => Math.max(0, current - 1))
					: activeWorkspaceSurface === "changes"
						? setSelectedChangeIndex((current) => Math.max(0, current - 1))
						: activeWorkspaceSurface === "issues"
							? setSelectedIssueIndex((current) => Math.max(0, current - 1))
							: activeWorkspaceSurface === "releases"
								? setSelectedReleaseIndex((current) => Math.max(0, current - 1))
								: setSelectedIndex((current) => Math.max(0, current - 1))

	return { stepSelected, stepSelectedDown, stepSelectedUp, stepSelectedDownWithLoadMore, stepSelectedUpWrap, moveSelectedToPreviousGroup, moveSelectedToNextGroup }
}
