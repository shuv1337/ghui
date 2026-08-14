import { RegistryContext, useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useRenderer, useTerminalDimensions } from "@opentui/react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useContext, useEffect, useRef, useState } from "react"
import type { AppCommand } from "../commands.js"
import { parseRepositoryInput } from "../pullRequestViews.js"
import { errorMessage } from "../errors.js"

import { colors } from "../ui/colors.js"
import { workspaceSurfaceAtom, workspaceTabSurfacesAtom } from "../workspace/atoms.js"
import { useRepoSurface } from "../surfaces/repo/useRepoSurface.js"
import { usePullRequestSurface } from "../surfaces/pullRequest/usePullRequestSurface.js"
import { computeLayout, diffFilePanelWidthFor, isTerminalTooSmall } from "../workspace/layout.js"
import { getDetailPlaceholderContent, reviewStatusAfterSubmit } from "../workspace/placeholders.js"
import { computeModalLayouts } from "../workspace/modalLayouts.js"
import { computeWorkspaceDerivations } from "../workspace/derivations.js"
import { computeFooterProps } from "../workspace/footerProps.js"
import { computeHeaderDerivations, groupIndexAt } from "../workspace/headerDerivations.js"
import { useWorkspacePreferencesPersistence } from "../workspace/useWorkspacePreferencesPersistence.js"
import { commentsRowCountAtom, orderedCommentsAtom, pullRequestCommentsAtom, pullRequestCommentsLoadedAtom, selectedOrderedCommentAtom } from "../ui/comments/atoms.js"
import { useIssueSurface } from "../surfaces/issue/useIssueSurface.js"
import { filterDraftAtom, filterModeAtom, filterQueryAtom } from "../ui/filter/atoms.js"
import { selectedIndexAtom } from "../ui/listSelection/atoms.js"
import { noticeAtom } from "../ui/notice/atoms.js"
import { useFlashNotice } from "../ui/notice/useFlashNotice.js"
import { useCommentMutations } from "../ui/comments/useCommentMutations.js"
import { pullRequestDetailKey, queueSelectionAtom, usernameAtom } from "../ui/pullRequests/atoms.js"

import { useGitHubActions } from "./useGitHubActions.js"
import { useImperativeActions } from "./useImperativeActions.js"
import { useScrollRefs } from "./useScrollRefs.js"
import { useCommentsLoader } from "./useCommentsLoader.js"
import { useCommentsViewActions } from "./useCommentsViewActions.js"
import { useDiffLoader } from "./useDiffLoader.js"
import { useRunsView } from "./useRunsView.js"
import { useParitySurfaces } from "./useParitySurfaces.js"
import { useActionsSurfaceShell } from "./useActionsSurfaceShell.js"
import { useLinkNavigation } from "./useLinkNavigation.js"
import { useLoadingStatus } from "./useLoadingStatus.js"
import { useCommandRegistry } from "./useCommandRegistry.js"
import { useListSelectionStepping } from "./useListSelectionStepping.js"
import { useModalSelectionMovers } from "./useModalSelectionMovers.js"
import { useAppKeymap } from "./useAppKeymap.js"
import { useModalStack } from "./useModalStack.js"
import { useItemMutations } from "../item/useItemMutations.js"
import { BulkSkipError, runBulkItems } from "../item/bulk.js"
import { lastBulkRetrySpecAtom, lastBulkRetryUrlsAtom, selectedItemUrlsAtom } from "../item/selection.js"
import { bulkItemActions } from "../ui/modals/types.js"
import { useSelectionDerivations } from "./useSelectionDerivations.js"
import { useStartupTasks } from "./useStartupTasks.js"
import { usePasteRouter } from "./usePasteRouter.js"
import { useWorkspaceNavigation } from "./useWorkspaceNavigation.js"
import { useDiffSelectionSync } from "./useDiffSelectionSync.js"
import { useDiffViewState } from "./useDiffViewState.js"
import { useViewModeState } from "./useViewModeState.js"
import { useFilterModal } from "../ui/filter/useFilterModal.js"
import {
	DIFF_FILE_PANEL_AUTO_THRESHOLD,
	diffFilePanelOverrideAtom,
	selectedDiffKeyAtom,
	selectedDiffStateAtom,
	selectedPendingReviewAtom,
	submitPendingReviewAtom,
	discardPendingReviewAtom,
} from "../ui/diff/atoms.js"
import { runsFullViewAtom } from "../ui/runs/atoms.js"
import { diffCommentThreadMapKey } from "../ui/diff/comments.js"
import { diffCommentLocationKey } from "../ui/diff.js"
import { useDiffLineColors } from "../ui/diff/useDiffLineColors.js"
import { useDiffLocationPreservation } from "../ui/diff/useDiffLocationPreservation.js"
import { useDiffPrefetch } from "../ui/diff/useDiffPrefetch.js"
import { showScrollbarsAtom, themeIdAtom } from "../ui/theme/atoms.js"
import { useThemeModal } from "../ui/theme/useThemeModal.js"
import { useMergeFlow } from "../ui/merge/useMergeFlow.js"
import { filteredMetadataOptions, initialCommentModalState, submitReviewOptions } from "../ui/modals.js"
import { useClampedIndex } from "../ui/useClampedIndex.js"
import { useCommandHandoffs } from "./useCommandHandoffs.js"
import { useDiffCommentDerivations } from "./useDiffCommentDerivations.js"
import { useDiffCommentNavigator } from "./useDiffCommentNavigator.js"
import { useItemModalActions } from "../item/useItemModalActions.js"
import { workspaceSurfaceLabelFor, type WorkspaceSurface } from "../workspaceSurfaces.js"
import { detectedRepository, mockRepositoryCatalog, mockWorkspacePreferencesPath, repositoryContext } from "../services/runtime.js"
import { useChangesSurface } from "../surfaces/changes/useChangesSurface.js"
import { formatJjHeaderStatus } from "../localDomain.js"
import { jjLocalStateConnected } from "../workspace/jjAvailability.js"

export interface UseAppShellInput {
	readonly systemThemeGeneration: number
}

export const useAppShell = ({ systemThemeGeneration }: UseAppShellInput) => {
	const renderer = useRenderer()
	const { width, height } = useTerminalDimensions()
	const registry = useContext(RegistryContext)

	const setQueueSelection = useAtomSet(queueSelectionAtom)
	const [selectedIndex, setSelectedIndex] = useAtom(selectedIndexAtom)
	const [notice, setNotice] = useAtom(noticeAtom)
	// Every notice auto-expires, regardless of who set it — command-side writers
	// (`Atom.set(noticeAtom, …)`) don't go through `useFlashNotice`'s timer, so
	// without this they'd linger until the next overwrite. ~2.5s matches the hook.
	useEffect(() => {
		if (notice === null) return
		const handle = globalThis.setTimeout(() => setNotice((current) => (current === notice ? null : current)), 2500)
		return () => globalThis.clearTimeout(handle)
	}, [notice, setNotice])
	const [filterQuery, setFilterQuery] = useAtom(filterQueryAtom)
	const [filterDraft, setFilterDraft] = useAtom(filterDraftAtom)
	const [filterMode, setFilterMode] = useAtom(filterModeAtom)
	const [selectedItemUrls, setSelectedItemUrls] = useAtom(selectedItemUrlsAtom)
	const setLastBulkRetryUrls = useAtomSet(lastBulkRetryUrlsAtom)
	const setLastBulkRetrySpec = useAtomSet(lastBulkRetrySpecAtom)
	const bulkAbortRef = useRef<AbortController | null>(null)
	const {
		detailFullView,
		setDetailFullView,
		setDetailScrollOffset,
		diffFullView,
		setDiffFullView,
		commentsViewActive,
		setCommentsViewActive,
		commentsViewSelection,
		setCommentsViewSelection,
	} = useViewModeState()
	const {
		diffFileIndex,
		setDiffFileIndex,
		diffScrollTop,
		setDiffScrollTop,
		diffRenderView,
		setDiffRenderView,
		diffWrapMode,
		diffWhitespaceMode,
		diffCommentAnchorIndex,
		setDiffCommentAnchorIndex,
		diffPreferredSide,
		setDiffPreferredSide,
		diffCommentRangeStartIndex,
		setDiffCommentRangeStartIndex,
		diffCommentThreads,
		setDiffCommentThreads,
		setDiffCommentsLoaded,
		setPullRequestDiffCache,
		setPendingReviewByDiffKey,
		setPendingReviewLoaded,
	} = useDiffViewState()
	const setPullRequestComments = useAtomSet(pullRequestCommentsAtom)
	const setPullRequestCommentsLoaded = useAtomSet(pullRequestCommentsLoadedAtom)
	const themeId = useAtomValue(themeIdAtom)
	const showScrollbars = useAtomValue(showScrollbarsAtom)
	const {
		activeModal,
		closeActiveModal,
		labelModalActive,
		closeModalActive,
		itemEditorModalActive,
		metadataSelectorModalActive,
		pullRequestStateModalActive,
		mergeModalActive,
		commentModalActive,
		deleteCommentModalActive,
		commentThreadModalActive,
		changedFilesModalActive,
		bulkEditorModalActive,
		filterModalActive,
		submitReviewModalActive,
		pendingReviewModalActive,
		runActionModalActive,
		workflowDispatchModalActive,
		artifactDownloadModalActive,
		themeModalActive,
		commandPaletteActive,
		releaseEditorModalActive,
		deleteReleaseModalActive,
		openRepositoryModalActive,
		labelModal,
		closeModal,
		itemEditorModal,
		metadataSelectorModal,
		bulkEditorModal,
		pullRequestStateModal,
		mergeModal,
		commentModal,
		deleteCommentModal,
		changedFilesModal,
		filterModal,
		submitReviewModal,
		pendingReviewModal,
		runActionModal,
		workflowDispatchModal,
		artifactDownloadModal,
		themeModal,
		commandPalette,
		openRepositoryModal,
		releaseEditorModal,
		deleteReleaseModal,
		resourceEditorModal,
		deleteResourceModal,
		setLabelModal,
		setItemEditorModal,
		setMetadataSelectorModal,
		setPullRequestStateModal,
		setMergeModal,
		setCommentModal,
		setDeleteCommentModal,
		setCommentThreadModal,
		setChangedFilesModal,
		setBulkEditorModal,
		setFilterModal,
		setSubmitReviewModal,
		setPendingReviewModal,
		setRunActionModal,
		setWorkflowDispatchModal,
		setArtifactDownloadModal,
		setThemeModal,
		setCommandPalette,
		setOpenRepositoryModal,
		setReleaseEditorModal,
		setDeleteReleaseModal,
		setResourceEditorModal,
		setDeleteResourceModal,
	} = useModalStack()
	const [startupLoadComplete, setStartupLoadComplete] = useState(false)
	const [homeCrumbHovered, setHomeCrumbHovered] = useState(false)
	const usernameResult = useAtomValue(usernameAtom)
	const {
		addPullRequestLabel,
		removePullRequestLabel,
		addIssueLabel,
		removeIssueLabel,
		toggleDraftStatus,
		listPullRequestComments,
		listIssueComments,
		readWorkspacePreferences,
		writeWorkspacePreferences,
		pruneCache,
		prewarmRepositoryDetails,
		closePullRequest,
		closeIssue,
		createIssue,
		editIssue,
		reopenIssue,
		deleteIssue,
		createPullRequest,
		editPullRequest,
		reopenPullRequest,
		refreshIssues,
		submitPullRequestReview,
		openUrl,
		readRepoRollup,
	} = useGitHubActions()
	const terminalWidth = width ?? 100
	const terminalHeight = height ?? 24
	const terminalTooSmall = isTerminalTooSmall(terminalWidth, terminalHeight)
	const runsFullView = useAtomValue(runsFullViewAtom)
	const showWorkspaceTabs = !detailFullView && !diffFullView && !runsFullView && !commentsViewActive
	const diffFilePanelOverride = useAtomValue(diffFilePanelOverrideAtom)
	const setDiffFilePanelOverride = useAtomSet(diffFilePanelOverrideAtom)
	// Effective panel visibility: the override (true/false) wins if set, else
	// auto-show whenever the terminal has room. Either way it only matters in
	// diffFullView — the panel doesn't exist outside of the diff surface.
	const diffFilePanelAutoVisible = terminalWidth >= DIFF_FILE_PANEL_AUTO_THRESHOLD
	const diffFilePanelVisible = diffFullView && (diffFilePanelOverride ?? diffFilePanelAutoVisible)
	const layout = computeLayout({
		terminalWidth,
		terminalHeight,
		showWorkspaceTabs,
		showDiffFilePanel: diffFilePanelVisible,
		diffFilePanelWidth: diffFilePanelWidthFor(terminalWidth),
	})
	const {
		contentWidth,
		isWideLayout,
		leftPaneWidth,
		rightPaneWidth,
		rightContentWidth,
		dividerJunctionAt,
		wideBodyHeight,
		headerFooterWidth,
		fullscreenContentWidth,
		diffFilePanelEffectiveWidth,
		diffPaneWidth,
	} = layout
	const refreshGenerationRef = useRef(0)
	const {
		detailScrollRef,
		detailPreviewScrollRef,
		diffScrollRef,
		prListScrollRef,
		issueListScrollRef,
		prListScrollPersistedRef,
		issueListScrollPersistedRef,
		suppressNextDiffCommentScrollRef,
	} = useScrollRefs()

	const flashNotice = useFlashNotice()

	useEffect(() => {
		renderer.setBackgroundColor(colors.background)
	}, [renderer, themeId, systemThemeGeneration])

	const themeModalActions = useThemeModal({ themeModal, setThemeModal, closeActiveModal, flashNotice })

	useEffect(
		() => () => {
			refreshGenerationRef.current += 1
		},
		[],
	)

	const [activeWorkspaceSurface, setActiveWorkspaceSurface] = useAtom(workspaceSurfaceAtom)
	const visibleFilterText = filterMode ? filterDraft : filterQuery
	const username = AsyncResult.isSuccess(usernameResult) ? usernameResult.value : null

	const prSurface = usePullRequestSurface({
		renderer,
		refreshGenerationRef,
		username,
		selectedIndex,
		setSelectedIndex,
		setQueueSelection,
		visibleFilterText,
		activeWorkspaceSurface,
		detailFullView,
		diffFullView,
		commentsViewActive,
		flashNotice,
		prListScrollRef,
		prListScrollPersistedRef,
	})
	const {
		pullRequestResult,
		pullRequestStatus,
		pullRequestError,
		activeView,
		setActiveView,
		activeViews,
		currentQueueCacheKey,
		pullRequestLoad,
		hasMorePullRequests,
		loadedPullRequestCount,
		loadMoreRowSelected,
		loadMoreSlotAvailable,
		pullRequests,
		visiblePullRequests,
		visibleGroups,
		groupStarts,
		selectedPullRequest,
		selectedRepository,
		pullRequestActiveFilterLabel,
		compactPullRequestRows,
		pullRequestListRows,
		setPullRequestOverrides,
		setRecentlyCompletedPullRequests,
		retryProgress: pullRequestRetryProgress,
		loadMorePullRequests,
		isLoadingMorePullRequests,
		resetLoadingMore,
		cancelRefreshToast,
		refreshPullRequests,
		detailHydrationState,
		resetHydration,
		selectPullRequestByUrl,
		selectNewestPullRequest,
	} = prSurface
	const isInitialLoading = !startupLoadComplete && pullRequestStatus === "loading" && pullRequests.length === 0

	const issueSurface = useIssueSurface({
		username,
		activeWorkspaceSurface,
		detailFullView,
		diffFullView,
		commentsViewActive,
		refreshGenerationRef,
		flashNotice,
		issueListScrollRef,
		issueListScrollPersistedRef,
	})
	const {
		issues,
		allIssues,
		issueLoad,
		issuesStatus,
		issuesError,
		selectedIssue,
		selectedIssueIndex,
		setSelectedIssueIndex,
		activeIssueView,
		setActiveIssueView,
		hasMoreIssues,
		loadedIssueCount,
		loadMoreIssueRowSelected,
		issueLoadMoreSlotAvailable,
		issueFetchInFlight,
		retryProgress: issueRetryProgress,
		issueActiveFilterLabel,
		setIssueOverrides,
		showIssueRepositoryGroups,
		loadMoreIssues,
		isLoadingMoreIssues,
		resetLoadingMoreIssues,
		selectNewestIssue,
	} = issueSurface
	const retryProgress = activeWorkspaceSurface === "issues" ? issueRetryProgress : pullRequestRetryProgress
	const refreshIssuesIfIdle = () => {
		if (!issueFetchInFlight && !isLoadingMoreIssues) refreshIssues()
	}
	const { releaseSurface, releaseActions, resourcesView, resourceActions, notificationsView } = useParitySurfaces({
		repository: selectedRepository,
		activeSurface: activeWorkspaceSurface,
		filterText: visibleFilterText,
		releaseEditor: releaseEditorModal,
		deleteRelease: deleteReleaseModal,
		resourceEditor: resourceEditorModal,
		deleteResource: deleteResourceModal,
		setReleaseEditor: setReleaseEditorModal,
		setDeleteRelease: setDeleteReleaseModal,
		setResourceEditor: setResourceEditorModal,
		setDeleteResource: setDeleteResourceModal,
		closeModal: closeActiveModal,
		notify: flashNotice,
		openUrl,
	})
	const { releases, selectedRelease, selectedReleaseIndex, setSelectedReleaseIndex, status: releaseStatus, error: releaseError, view: releaseView } = releaseSurface
	const changesView = useChangesSurface(selectedRepository, renderer)
	const splitMetadata = (value: string): readonly string[] => [
		...new Set(
			value
				.split(",")
				.map((entry) => entry.trim())
				.filter(Boolean),
		),
	]
	const moveItemEditorFocus = (delta: -1 | 1) => {
		setItemEditorModal((current) => {
			const fields: readonly (typeof current.focus)[] =
				current.kind === "issue"
					? (["title", "body", "labels", "assignees", "milestone"] as const)
					: current.mode === "create"
						? (["title", "body", "base", "head", "draft", "labels", "assignees", "reviewers", "milestone"] as const)
						: (["title", "body", "base", "labels", "assignees", "reviewers", "milestone"] as const)
			const index = Math.max(0, fields.indexOf(current.focus as (typeof fields)[number]))
			return { ...current, focus: fields[(index + delta + fields.length) % fields.length]! }
		})
	}
	const toggleItemEditorDraft = () => {
		setItemEditorModal((current) => (current.kind === "pullRequest" && current.mode === "create" && current.focus === "draft" ? { ...current, draft: !current.draft } : current))
	}
	const submitItemEditor = () => {
		const state = itemEditorModal
		const title = state.title.trim()
		if (!title) {
			setItemEditorModal((current) => ({ ...current, error: "Title is required.", focus: "title" }))
			return
		}
		if (state.kind === "pullRequest" && (!state.base.trim() || (state.mode === "create" && !state.head.trim()))) {
			setItemEditorModal((current) => ({ ...current, error: "Base and head branches are required.", focus: !current.base.trim() ? "base" : "head" }))
			return
		}
		const labels = splitMetadata(state.labels)
		const assignees = splitMetadata(state.assignees)
		const reviewers = splitMetadata(state.reviewers)
		const milestone = state.milestone.trim() || null
		setItemEditorModal((current) => ({ ...current, running: true, error: null }))

		const previousIssue = state.url ? (allIssues.find((issue) => issue.url === state.url) ?? null) : null
		const previousPullRequest = state.url ? (pullRequests.find((pullRequest) => pullRequest.url === state.url) ?? null) : null
		const previousLabels = (previousIssue ?? previousPullRequest)?.labels.map((label) => label.name) ?? []
		const addLabels = labels.filter((label) => !previousLabels.includes(label))
		const removeLabels = previousLabels.filter((label) => !labels.includes(label))
		if (previousIssue) updateIssue(previousIssue.url, (issue) => ({ ...issue, title, body: state.body, labels: labels.map((name) => ({ name, color: null })) }))
		if (previousPullRequest) {
			updatePullRequest(previousPullRequest.url, (pullRequest) => ({
				...pullRequest,
				title,
				body: state.body,
				baseRefName: state.base.trim(),
				labels: labels.map((name) => ({ name, color: null })),
			}))
		}

		const request =
			state.kind === "issue"
				? state.mode === "create"
					? createIssue({ repository: state.repository, title, body: state.body, labels, assignees, milestone })
					: editIssue({
							repository: state.repository,
							number: state.number!,
							title,
							body: state.body,
							addLabels,
							removeLabels,
							addAssignees: assignees,
							milestone,
						})
				: state.mode === "create"
					? createPullRequest({
							repository: state.repository,
							title,
							body: state.body,
							base: state.base.trim(),
							head: state.head.trim(),
							draft: state.draft,
							labels,
							assignees,
							reviewers,
							milestone,
						})
					: editPullRequest({
							repository: state.repository,
							number: state.number!,
							title,
							body: state.body,
							base: state.base.trim(),
							addLabels,
							removeLabels,
							addAssignees: assignees,
							addReviewers: reviewers,
							milestone,
						})

		void request
			.then(() => {
				closeActiveModal()
				if (state.mode === "create") {
					if (state.kind === "issue") selectNewestIssue()
					else selectNewestPullRequest()
				}
				if (state.kind === "issue") refreshIssuesIfIdle()
				else refreshPullRequests()
				flashNotice(`${state.mode === "create" ? "Created" : "Updated"} ${state.kind === "issue" ? "issue" : "pull request"}`)
			})
			.catch((error) => {
				if (previousIssue) updateIssue(previousIssue.url, () => previousIssue)
				if (previousPullRequest) updatePullRequest(previousPullRequest.url, () => previousPullRequest)
				setItemEditorModal((current) => ({ ...current, running: false, error: errorMessage(error) }))
			})
	}
	const moveMetadataSelector = (delta: -1 | 1) => {
		setMetadataSelectorModal((current) => {
			const length = filteredMetadataOptions(current).length
			return length === 0 ? current : { ...current, selectedIndex: (current.selectedIndex + delta + length) % length }
		})
	}
	const toggleMetadataSelector = (forcedIndex?: number) => {
		const state = metadataSelectorModal
		if (state.loading || state.running) return
		const index = forcedIndex ?? state.selectedIndex
		const option = filteredMetadataOptions(state)[index]
		if (!option) return
		if (forcedIndex !== undefined && forcedIndex !== state.selectedIndex) setMetadataSelectorModal((current) => ({ ...current, selectedIndex: forcedIndex }))
		const selected = state.selectedIds.includes(option.id)
		setMetadataSelectorModal((current) => ({ ...current, running: true, error: null }))
		const target = state.target
		const request =
			state.kind === "assignees"
				? target.kind === "issue"
					? editIssue({
							repository: target.repository,
							number: target.number,
							...(selected ? { removeAssignees: [option.id] } : { addAssignees: [option.id] }),
						})
					: editPullRequest({
							repository: target.repository,
							number: target.number,
							...(selected ? { removeAssignees: [option.id] } : { addAssignees: [option.id] }),
						})
				: state.kind === "reviewers"
					? editPullRequest({
							repository: target.repository,
							number: target.number,
							...(selected ? { removeReviewers: [option.id] } : { addReviewers: [option.id] }),
						})
					: state.kind === "milestone"
						? target.kind === "issue"
							? editIssue({ repository: target.repository, number: target.number, milestone: option.id })
							: editPullRequest({ repository: target.repository, number: target.number, milestone: option.id })
						: editPullRequest({ repository: target.repository, number: target.number, base: option.id })
		void request
			.then(() => {
				if (state.kind === "assignees" || state.kind === "reviewers") {
					setMetadataSelectorModal((current) => ({
						...current,
						running: false,
						selectedIds: selected ? current.selectedIds.filter((id) => id !== option.id) : [...current.selectedIds, option.id],
					}))
				} else {
					if (state.kind === "base") {
						updatePullRequest(target.url, (pullRequest) => ({ ...pullRequest, baseRefName: option.id }))
						refreshPullRequests()
					} else if (target.kind === "issue") refreshIssuesIfIdle()
					else refreshPullRequests()
					closeActiveModal()
				}
				flashNotice(`${selected ? "Removed" : "Applied"} ${option.label}`)
			})
			.catch((error) => setMetadataSelectorModal((current) => ({ ...current, running: false, error: errorMessage(error) })))
	}
	const moveBulkAction = (delta: -1 | 1) => {
		setBulkEditorModal((current) => {
			const index = bulkItemActions.indexOf(current.action)
			const action = bulkItemActions[(index + delta + bulkItemActions.length) % bulkItemActions.length]!
			return { ...current, action, focus: action === "close" || action === "reopen" ? "action" : current.focus, confirming: false, summary: null, resultLines: [] }
		})
	}
	const toggleBulkEditorFocus = () => {
		setBulkEditorModal((current) => (current.action === "close" || current.action === "reopen" ? current : { ...current, focus: current.focus === "action" ? "value" : "action" }))
	}
	const toggleItemSelection = (url: string) => {
		const next = selectedItemUrls.includes(url) ? selectedItemUrls.filter((selectedUrl) => selectedUrl !== url) : [...selectedItemUrls, url]
		setSelectedItemUrls(next)
		setNotice(`${next.length} item${next.length === 1 ? "" : "s"} selected`)
	}
	const closeOrCancelBulkEditor = () => {
		if (bulkEditorModal.running) {
			bulkAbortRef.current?.abort()
			setBulkEditorModal((current) => ({ ...current, cancelRequested: true, summary: "Cancellation requested; finishing in-flight items." }))
			return
		}
		closeActiveModal()
	}
	const submitBulkEditor = () => {
		const state = bulkEditorModal
		if (state.running || state.targets.length === 0) return
		const needsValue = state.action !== "close" && state.action !== "reopen"
		const value = state.value.trim()
		if (needsValue && !value) {
			setBulkEditorModal((current) => ({ ...current, focus: "value", error: "Enter a metadata value." }))
			return
		}
		if (state.action === "close" && !state.confirming) {
			setBulkEditorModal((current) => ({ ...current, confirming: true, error: null, summary: "Press Enter again to close all eligible selected items." }))
			return
		}
		const controller = new AbortController()
		bulkAbortRef.current = controller
		setBulkEditorModal((current) => ({ ...current, running: true, confirming: false, cancelRequested: false, error: null, summary: null, resultLines: [] }))
		void runBulkItems(
			state.targets,
			async (target) => {
				if (state.action === "close") {
					if (target.state !== "open") throw new BulkSkipError("Already closed or merged.")
					await (target.kind === "issue"
						? closeIssue({ repository: target.repository, number: target.number })
						: closePullRequest({ repository: target.repository, number: target.number }))
					return
				}
				if (state.action === "reopen") {
					if (target.state !== "closed") throw new BulkSkipError("Item is not closed.")
					await (target.kind === "issue"
						? reopenIssue({ repository: target.repository, number: target.number })
						: reopenPullRequest({ repository: target.repository, number: target.number }))
					return
				}
				if (target.kind === "issue") {
					await editIssue({
						repository: target.repository,
						number: target.number,
						...(state.action === "addLabel"
							? { addLabels: [value] }
							: state.action === "removeLabel"
								? { removeLabels: [value] }
								: state.action === "addAssignee"
									? { addAssignees: [value] }
									: state.action === "removeAssignee"
										? { removeAssignees: [value] }
										: { milestone: value }),
					})
					return
				}
				await editPullRequest({
					repository: target.repository,
					number: target.number,
					...(state.action === "addLabel"
						? { addLabels: [value] }
						: state.action === "removeLabel"
							? { removeLabels: [value] }
							: state.action === "addAssignee"
								? { addAssignees: [value] }
								: state.action === "removeAssignee"
									? { removeAssignees: [value] }
									: { milestone: value }),
				})
			},
			{ concurrency: 3, signal: controller.signal },
		)
			.then((result) => {
				const retryUrls = result.results.filter((entry) => entry.status === "failed" && entry.retryable).map((entry) => entry.item.url)
				setLastBulkRetryUrls(retryUrls)
				setLastBulkRetrySpec(retryUrls.length > 0 ? { urls: retryUrls, action: state.action, value } : null)
				setSelectedItemUrls(result.results.filter((entry) => entry.status !== "succeeded").map((entry) => entry.item.url))
				setBulkEditorModal((current) => ({
					...current,
					running: false,
					summary: `${result.succeeded} succeeded · ${result.failed} failed · ${result.skipped} skipped · ${result.retryable} retryable`,
					resultLines: result.results.map(
						(entry) =>
							`${entry.status === "succeeded" ? "✓" : entry.status === "failed" ? "!" : "–"} #${entry.item.number} ${entry.status}${entry.error ? ` · ${entry.error}` : ""}`,
					),
				}))
				refreshIssuesIfIdle()
				refreshPullRequests()
			})
			.catch((error) => setBulkEditorModal((current) => ({ ...current, running: false, error: errorMessage(error) })))
			.finally(() => {
				if (bulkAbortRef.current === controller) bulkAbortRef.current = null
			})
	}

	const workspaceTabSurfaces: readonly WorkspaceSurface[] = useAtomValue(workspaceTabSurfacesAtom)
	useEffect(() => {
		if (!workspaceTabSurfaces.includes(activeWorkspaceSurface)) setActiveWorkspaceSurface("pullRequests")
	}, [activeWorkspaceSurface, setActiveWorkspaceSurface, workspaceTabSurfaces])
	const repo = useRepoSurface({
		pullRequests,
		allIssues,
		visibleFilterText,
		activeWorkspaceSurface,
		detectedRepository,
		mockRepositoryCatalog,
		flashNotice,
	})
	const {
		repositoryItems,
		selectedRepositoryItem,
		selectedRepositoryDetails,
		selectedRepositoryIndex,
		setSelectedRepositoryIndex,
		favoriteRepositories,
		setFavoriteRepositories,
		recentRepositories,
		setRecentRepositories,
		setRepoRollup,
	} = repo
	const { toggleFavoriteRepository, removeSelectedRepository } = repo.actions
	const pullRequestComments = useAtomValue(pullRequestCommentsAtom)
	const selectedDiffKey = useAtomValue(selectedDiffKeyAtom)
	const selectedDiffState = useAtomValue(selectedDiffStateAtom)
	const selectedPendingReview = useAtomValue(selectedPendingReviewAtom)
	const submitPendingReview = useAtomSet(submitPendingReviewAtom, { mode: "promise" })
	const discardPendingReview = useAtomSet(discardPendingReviewAtom, { mode: "promise" })
	const {
		selectedCommentSubject,
		selectedCommentKey,
		selectedItemLabels,
		selectedComments,
		selectedCommentsStatus,
		selectedCommentsLoadState,
		effectiveDiffRenderView,
		readyDiffFiles,
		changedFileResults,
	} = useSelectionDerivations({
		diffRenderView,
		contentWidth,
		changedFilesModalActive,
		changedFilesQuery: changedFilesModal.query,
	})
	const {
		displayedDiffState,
		stackedDiffFiles,
		diffCommentAnchors,
		selectedDiffCommentAnchorIndex,
		selectedDiffCommentAnchor,
		diffCommentRangeStartAnchor,
		selectedDiffCommentRangeAnchors,
		diffCommentRangeActive,
		selectedDiffCommentLabel,
		selectedDiffCommentThread,
		diffLineColorContextKey,
		diffCommentThreadAnchors,
		pendingReviewAnchors,
	} = useDiffCommentDerivations({
		selectedDiffState,
		readyDiffFiles,
		effectiveDiffRenderView,
		diffWrapMode,
		diffWhitespaceMode,
		// When the docked file panel takes a slice, the diff renders at
		// `diffPaneWidth` — pass that so the split-view's OLD/NEW columns are
		// halved on the actual diff width, not the full terminal width.
		diffPaneWidth: diffFilePanelVisible ? diffPaneWidth : contentWidth,
		diffFullView,
		diffCommentAnchorIndex,
		diffCommentRangeStartIndex,
		selectedDiffKey,
		diffCommentThreads,
		pendingReviewComments: selectedPendingReview?.comments ?? [],
	})
	const getCurrentGroupIndex = (current: number) => groupIndexAt(groupStarts, current)
	const jjStatusBudget = Math.max(0, headerFooterWidth - (username ? username.length + 3 : 0) - 24)
	const { headerRight, headerLeftWidth, footerNotice, homeCrumb, breadcrumbSeparatorText, headerRepoWidth } = computeHeaderDerivations({
		username,
		notice,
		headerFooterWidth,
		selectedRepository,
		localStatus: changesView.snapshot && jjLocalStateConnected(repositoryContext) ? formatJjHeaderStatus(changesView.snapshot, jjStatusBudget) : null,
	})
	const { updatePullRequest, updateIssue, markPullRequestCompleted, restoreOptimisticPullRequest } = useItemMutations({
		pullRequests,
		issues,
		setPullRequestOverrides,
		setIssueOverrides,
		setRecentlyCompletedPullRequests,
	})

	const { switchViewTo, switchQueueMode, switchWorkspaceSurface, cycleWorkspaceSurface, goUpWorkspaceScope } = useWorkspaceNavigation({
		registry,
		activeView,
		activeViews,
		currentQueueCacheKey,
		selectedIndex,
		setSelectedIndex,
		setSelectedIssueIndex,
		setQueueSelection,
		setActiveView,
		setActiveIssueView,
		setDetailFullView,
		setDiffFullView,
		setCommentsViewActive,
		setDiffCommentRangeStartIndex,
		setFilterDraft,
		setFilterMode,
		setNotice,
		cancelRefreshToast,
		filterQuery,
		filterMode,
		setRecentlyCompletedPullRequests,
		setActiveWorkspaceSurface,
		activeWorkspaceSurface,
		workspaceTabSurfaces,
		selectedRepository,
		refreshGenerationRef,
		resetHydration,
		resetLoadingMore,
	})
	const openSelectedRepository = () => {
		if (!selectedRepositoryItem) return
		switchViewTo({ _tag: "Repository", repository: selectedRepositoryItem.repository })
	}
	const { openFilterModal, moveFilterSelection, applySelectedFilter } = useFilterModal({
		activeWorkspaceSurface,
		activeView,
		activeIssueView,
		selectedRepository,
		filterModal,
		setFilterModal,
		switchViewTo,
		setActiveIssueView,
		closeActiveModal,
		setSelectedIssueIndex,
		resetLoadingMoreIssues,
		bumpRefreshGeneration: () => {
			refreshGenerationRef.current += 1
		},
	})
	const { loadPullRequestComments, loadIssueComments } = useCommentsLoader({
		refreshGenerationRef,
		readCommentsLoadState: () => registry.get(pullRequestCommentsLoadedAtom),
		setPullRequestComments,
		setPullRequestCommentsLoaded,
		listPullRequestComments,
		listIssueComments,
		flashNotice,
	})
	// View-change refetch is now driven by `pullRequestsAtom`'s reactive
	// dependency on `activeViewAtom`. Display derivations read the in-memory
	// cache first, so the user sees the previous list instantly while the new
	// view's fetch lands.

	useClampedIndex(visiblePullRequests.length + (loadMoreSlotAvailable ? 1 : 0), setSelectedIndex)

	useWorkspacePreferencesPersistence({
		username,
		favoriteRepositories,
		recentRepositories,
		mockPath: mockWorkspacePreferencesPath,
		readPreferences: readWorkspacePreferences,
		writePreferences: writeWorkspacePreferences,
		setFavoriteRepositories,
		setRecentRepositories,
	})

	useStartupTasks({
		username,
		recentRepositories,
		favoriteRepositories,
		detectedRepository,
		pullRequestLoad,
		issueLoad,
		currentQueueCacheKey,
		selectedIndex,
		persistQueueSelection: !filterMode && filterQuery.length === 0,
		readRepoRollup,
		setRepoRollup,
		prewarmRepositoryDetails,
		pruneCache,
		setQueueSelection,
		issues,
		pullRequests,
	})

	// Keep list scroll position when toggling between surfaces. Each list's
	// scrollbox remounts on surface switch; without persistence it starts at
	// scrollTop=0 and useScrollFollowSelected snaps it back to the selected
	// row — reads as a jump.

	useDiffSelectionSync({
		selectedIndex,
		selectedIssueIndex,
		selectedRepositoryIndex,
		readyDiffFiles,
		diffCommentAnchors,
		diffFullView,
		selectedDiffCommentAnchor,
		detailPreviewScrollRef,
		setDiffFileIndex,
		setDiffScrollTop,
		setDiffCommentAnchorIndex,
		setDiffPreferredSide,
		setDiffCommentRangeStartIndex,
	})

	useDiffLocationPreservation({
		diffFullView,
		selectedDiffCommentAnchor,
		diffCommentAnchors,
		diffWhitespaceMode,
		diffScrollRef,
		wideBodyHeight,
		suppressNextDiffCommentScrollRef,
		setDiffCommentAnchorIndex,
		setDiffFileIndex,
		syncDiffScrollState: () => syncDiffScrollState(),
	})

	const { setDiffRenderableRef, resetDiffLineColors } = useDiffLineColors({
		diffLineColorContextKey,
		effectiveDiffRenderView,
		selectedDiffCommentAnchor,
		selectedDiffCommentRangeAnchors,
		diffCommentThreadAnchors,
		pendingReviewAnchors,
		suppressNextDiffCommentScrollRef,
		ensureDiffLineVisible: (line) => ensureDiffLineVisible(line),
	})

	// Scroll the selected line into view when the diff view is opened. Previously
	// opentui's `focused` scrollbox did this auto-scroll on mount; with the keymap
	// migration the scrollbox is `focusable={false}` so we have to scroll explicitly.
	useEffect(() => {
		if (!diffFullView) return
		if (!selectedDiffCommentAnchor) return
		ensureDiffLineVisible(selectedDiffCommentAnchor.renderLine)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [diffFullView])
	const selectedPullRequestDetailKey = selectedPullRequest ? pullRequestDetailKey(selectedPullRequest) : null
	const { selectedPullRequestDetailError, isActiveSurfaceLoading, loadingFrame, loadingIndicator } = useLoadingStatus({
		selectedPullRequestDetailKey,
		detailHydrationState,
		pullRequestResult,
		pullRequestLoad,
		pullRequestStatus,
		issuesStatus,
		releaseStatus,
		notificationStatus: notificationsView.status,
		changeStatus: changesView.status,
		isLoadingMorePullRequests,
		issueFetchInFlight,
		isLoadingMoreIssues,
		activeWorkspaceSurface,
		selectedCommentsStatus,
		selectedDiffState,
		labelModal,
		closeModal,
		pullRequestStateModal,
		mergeModal,
		submitReviewModal,
		isInitialLoading,
		startupLoadComplete,
		setStartupLoadComplete,
		selectedPullRequest,
		loadPullRequestComments,
	})

	const detailPlaceholderContent = getDetailPlaceholderContent({
		status: pullRequestStatus,
		retryProgress: pullRequestRetryProgress,
		loadingIndicator,
		visibleCount: visiblePullRequests.length,
		filterText: visibleFilterText,
	})
	const isSelectedPullRequestDetailLoading = selectedPullRequest !== null && !selectedPullRequest.detailLoaded && selectedPullRequestDetailError === null
	const isSelectedPullRequestDetailError = selectedPullRequest !== null && !selectedPullRequest.detailLoaded && selectedPullRequestDetailError !== null
	const halfPage = Math.max(1, Math.floor(wideBodyHeight / 2))

	const runsView = useRunsView(selectedPullRequest, halfPage)
	const { view: actionsView, modalActions: actionsModalActions } = useActionsSurfaceShell({
		renderer,
		repository: selectedRepository,
		active: activeWorkspaceSurface === "actions",
		halfPage,
		filterText: visibleFilterText,
		runActionModal,
		workflowDispatchModal,
		artifactDownloadModal,
		setRunActionModal,
		setWorkflowDispatchModal,
		setArtifactDownloadModal,
		closeModal: closeActiveModal,
		notify: flashNotice,
	})

	const { loadPullRequestDiff } = useDiffLoader({
		registry,
		setPullRequestDiffCache,
		setDiffCommentsLoaded,
		setDiffCommentThreads,
		setPendingReviewByDiffKey,
		setPendingReviewLoaded,
		flashNotice,
	})

	useDiffPrefetch({
		pullRequest: selectedPullRequest,
		skip: diffFullView,
		onPrefetch: (pr) => loadPullRequestDiff(pr),
	})

	// j/k navigates the *visual* (threaded) order, not the raw load order — so
	// the comment under the cursor is the one immediately below the previously
	// highlighted row, regardless of where it lives in the flat array. Derived
	// in `ui/comments/atoms.ts` and read here as plain atom values.
	const orderedComments = useAtomValue(orderedCommentsAtom)
	const selectedOrderedComment = useAtomValue(selectedOrderedCommentAtom)
	const commentsRowCount = useAtomValue(commentsRowCountAtom)
	const { scrollDetailPreviewBy, scrollDetailPreviewTo, scrollDetailFullViewBy, scrollDetailFullViewTo, setCommentEditorValue, editSubmitReview, openDiffView } =
		useImperativeActions({
			contentWidth,
			detailScrollRef,
			detailPreviewScrollRef,
			diffScrollRef,
			setDetailScrollOffset,
			setCommentModal,
			setSubmitReviewModal,
			setDiffFullView,
			setDetailFullView,
			setCommentsViewActive,
			setDiffFileIndex,
			setDiffScrollTop,
			setDiffCommentAnchorIndex,
			setDiffPreferredSide,
			setDiffCommentRangeStartIndex,
			setDiffRenderView,
			selectedPullRequest,
			resetDiffLineColors,
			loadPullRequestDiff,
		})

	const diffNav = useDiffCommentNavigator({
		diffFullView,
		diffFileIndex,
		setDiffFileIndex,
		setDiffScrollTop,
		diffCommentAnchorIndex,
		setDiffCommentAnchorIndex,
		diffPreferredSide,
		setDiffPreferredSide,
		diffCommentRangeStartAnchor,
		setDiffCommentRangeStartIndex,
		diffCommentAnchors,
		diffCommentThreadAnchors,
		selectedDiffCommentAnchor,
		selectedDiffCommentAnchorIndex,
		selectedDiffCommentThread,
		diffCommentRangeActive,
		stackedDiffFiles,
		readyDiffFiles,
		wideBodyHeight,
		diffScrollRef,
		suppressNextDiffCommentScrollRef,
		selectedPullRequest,
		changedFilesModal,
		changedFileResults,
		closeActiveModal,
		setChangedFilesModal,
		setCommentModal,
		setCommentThreadModal,
		initialCommentModalState,
		flashNotice,
	})
	const {
		syncDiffScrollState,
		ensureDiffLineVisible,
		jumpDiffFile,
		selectDiffFile,
		openChangedFilesModal,
		selectChangedFile,
		moveDiffCommentAnchor,
		moveDiffCommentToBoundary,
		alignSelectedDiffCommentAnchor,
		selectDiffCommentSide,
		selectDiffCommentLine,
		openDiffCommentModal,
		openDiffSuggestionModal,
		openSelectedDiffComment,
		toggleDiffCommentRange,
		moveDiffCommentThread,
	} = diffNav

	const { submitCommentModal, openNewIssueCommentModal, openReplyToSelectedComment, openEditSelectedComment, openDeleteSelectedComment, confirmDeleteComment } =
		useCommentMutations({
			selectedCommentSubject,
			selectedCommentKey,
			selectedOrderedComment,
			selectedComments,
			username,
			activeWorkspaceSurface,
			selectedIssue,
			pullRequestComments,
			diffCommentThreads,
			commentModal,
			deleteCommentModal,
			setCommentModal,
			setDeleteCommentModal,
			setPullRequestComments,
			setDiffCommentThreads,
			setDiffCommentRangeStartIndex,
			closeActiveModal,
			flashNotice,
			updateIssue,
			diffCommentThreadMapKey,
		})

	const { openCommentsView, closeCommentsView, moveCommentsSelection, setCommentsSelection, confirmCommentSelection, openSelectedCommentInBrowser, refreshSelectedComments } =
		useCommentsViewActions({
			activeWorkspaceSurface,
			selectedIssue,
			selectedPullRequest,
			selectedComments,
			orderedComments,
			commentsViewSelection,
			commentsRowCount,
			selectedOrderedComment,
			setCommentsViewActive,
			setDetailFullView,
			setDiffFullView,
			setCommentsViewSelection,
			loadPullRequestComments,
			loadIssueComments,
			openNewIssueCommentModal,
			openReplyToSelectedComment,
			openUrl,
			flashNotice,
		})

	const { movePullRequestStateSelection, confirmPullRequestStateChange, confirmCloseModal, toggleLabelAtIndex, confirmSubmitReview } = useItemModalActions({
		pullRequestStateModal,
		setPullRequestStateModal,
		closeModal,
		labelModal,
		setLabelModal,
		submitReviewModal,
		setSubmitReviewModal,
		submitReviewOptions,
		reviewStatusAfterSubmit,
		pullRequests,
		allIssues,
		closeActiveModal,
		flashNotice,
		updatePullRequest,
		updateIssue,
		setIssueOverrides,
		markPullRequestCompleted,
		restoreOptimisticPullRequest,
		refreshPullRequests,
		refreshIssues: refreshIssuesIfIdle,
		toggleDraftStatus,
		closePullRequest,
		closeIssue,
		deleteIssue,
		submitPullRequestReview,
		pendingReview: selectedPendingReview,
		submitPendingReview,
		setPendingReviewByDiffKey,
		addPullRequestLabel,
		removePullRequestLabel,
		addIssueLabel,
		removeIssueLabel,
	})

	const selectedQueuedComment = selectedPendingReview?.comments[Math.max(0, Math.min(pendingReviewModal.selectedIndex, selectedPendingReview.comments.length - 1))] ?? null
	const movePendingReviewSelection = (delta: -1 | 1) => {
		const count = selectedPendingReview?.comments.length ?? 0
		setPendingReviewModal((current) => ({
			...current,
			confirmingDiscard: false,
			selectedIndex: count > 0 ? (current.selectedIndex + delta + count) % count : 0,
		}))
	}
	const jumpPendingReviewComment = () => {
		if (!selectedQueuedComment) return
		const index = diffCommentAnchors.findIndex((anchor) => diffCommentLocationKey(anchor) === diffCommentLocationKey(selectedQueuedComment))
		if (index < 0) {
			setPendingReviewModal((current) => ({ ...current, error: "Queued line is not present in this diff revision." }))
			return
		}
		setDiffCommentAnchorIndex(index)
		setDiffFileIndex(diffCommentAnchors[index]!.fileIndex)
		closeActiveModal()
	}
	const pendingCommentSubject = () =>
		selectedPullRequest && selectedDiffKey
			? {
					key: selectedDiffKey,
					repository: selectedPullRequest.repository,
					number: selectedPullRequest.number,
					issueUrl: null,
				}
			: null
	const editPendingReviewComment = () => {
		const subject = pendingCommentSubject()
		if (!subject || !selectedQueuedComment) return
		setCommentModal({
			...initialCommentModalState,
			body: selectedQueuedComment.body,
			cursor: selectedQueuedComment.body.length,
			target: {
				kind: "edit",
				subject,
				commentId: selectedQueuedComment.id,
				commentTag: "review-comment",
				anchorLabel: `Editing queued ${selectedQueuedComment.path}:${selectedQueuedComment.line}`,
			},
		})
	}
	const deletePendingReviewComment = () => {
		const subject = pendingCommentSubject()
		if (!subject || !selectedQueuedComment) return
		const firstLine = selectedQueuedComment.body.split("\n").find((line) => line.trim().length > 0) ?? ""
		setDeleteCommentModal({
			subject,
			commentId: selectedQueuedComment.id,
			commentTag: "review-comment",
			author: selectedQueuedComment.author,
			preview: firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine,
			running: false,
			error: null,
		})
	}
	const submitPendingReviewFromPane = () => {
		if (!selectedPendingReview) return
		const selectedIndex = Math.max(
			0,
			submitReviewOptions.findIndex((option) => option.event === "APPROVE"),
		)
		setSubmitReviewModal({
			repository: selectedPendingReview.repository,
			number: selectedPendingReview.number,
			focus: "action",
			selectedIndex,
			body: "",
			cursor: 0,
			running: false,
			error: null,
		})
	}
	const discardPendingReviewFromPane = () => {
		if (!selectedPendingReview || pendingReviewModal.running) return
		if (!pendingReviewModal.confirmingDiscard) {
			setPendingReviewModal((current) => ({ ...current, confirmingDiscard: true, error: null }))
			return
		}
		setPendingReviewModal((current) => ({ ...current, running: true, error: null }))
		void discardPendingReview(selectedPendingReview)
			.then(() => {
				if (selectedDiffKey) setPendingReviewByDiffKey((current) => ({ ...current, [selectedDiffKey]: null }))
				closeActiveModal()
				flashNotice("Pending review discarded")
			})
			.catch((error) => setPendingReviewModal((current) => ({ ...current, running: false, error: errorMessage(error) })))
	}

	const { openInlineLink } = useLinkNavigation({
		issues,
		allIssues,
		pullRequests,
		selectedRepository,
		setActiveWorkspaceSurface,
		setSelectedIssueIndex,
		setDetailFullView,
		setFilterQuery,
		setFilterDraft,
		setFilterMode,
		selectPullRequestByUrl,
		switchViewTo,
		openUrl,
		flashNotice,
	})

	const { openThemeModal, closeThemeModal, moveThemeSelection, updateThemeQuery, toggleThemeTone, toggleThemeMode, editThemeQuery } = themeModalActions

	const { openMergeModal, cancelOrCloseMergeModal, confirmMergeAction, cycleMergeMethod, moveMergeSelection } = useMergeFlow({
		mergeModal,
		setMergeModal,
		selectedPullRequest,
		pullRequests,
		closeActiveModal,
		flashNotice,
		updatePullRequest,
		markPullRequestCompleted,
		restoreOptimisticPullRequest,
		refreshPullRequests,
	})

	const openRepositoryPicker = () => {
		setOpenRepositoryModal({ query: selectedRepository ?? "", error: null })
	}
	const openRepositoryFromInput = () => {
		const repository = parseRepositoryInput(openRepositoryModal.query)
		if (!repository) {
			setOpenRepositoryModal((current) => ({ ...current, error: "Enter a repository as owner/name or a GitHub URL." }))
			return
		}
		closeActiveModal()
		switchViewTo({ _tag: "Repository", repository })
		flashNotice(`Opened ${repository}`)
	}
	usePasteRouter({
		renderer,
		commandPaletteActive,
		openRepositoryModalActive,
		themeModalActive,
		themeModal,
		commentModalActive,
		submitReviewModalActive,
		labelModalActive,
		changedFilesModalActive,
		filterMode,
		itemEditorModalActive,
		itemEditorModal,
		metadataSelectorModalActive,
		metadataSelectorModal,
		bulkEditorModalActive,
		bulkEditorModal,
		workflowDispatchModalActive,
		artifactDownloadModalActive,
		workflowDispatchModal,
		artifactDownloadModal,
		releaseEditorModalActive,
		releaseEditorModal,
		setCommandPalette,
		setOpenRepositoryModal,
		editThemeQuery,
		setSubmitReviewModal,
		setLabelModal,
		setChangedFilesModal,
		setFilterDraft,
		setItemEditorModal,
		setMetadataSelectorModal,
		setBulkEditorModal,
		setWorkflowDispatchModal,
		setArtifactDownloadModal,
		setReleaseEditorModal,
	})

	const { commandPaletteCommands, selectedCommandIndex, selectedCommand, runCommand, runCommandById } = useCommandRegistry({
		commandPaletteActive,
		commandPalette,
		selectedRepository,
		switchViewTo,
		commentsViewActive,
		diffFullView,
		detailFullView,
		runtimeSnapshot: {
			readyDiffFileCount: readyDiffFiles.length,
			diffFileIndex,
			selectedDiffCommentAnchorLabel: selectedDiffCommentLabel,
			selectedDiffCommentThreadCount: selectedDiffCommentThread.length,
			hasDiffCommentThreads: diffCommentThreadAnchors.length > 0,
			diffRangeActive: diffCommentRangeActive,
			selectedCommentsStatus,
			selectedOrderedComment,
			username,
		},
		closeActiveModal,
		flashNotice,
	})

	useCommandHandoffs({
		renderer,
		selectedPullRequest,
		selectedRepository,
		refreshPullRequests,
		refreshIssues: refreshIssuesIfIdle,
		loadMorePullRequests,
		loadPullRequestDiff,
		flashNotice,
		switchViewTo,
		openThemeModal,
		openMergeModal,
		openCommentsView,
		openDiffView,
		openChangedFilesModal,
		toggleDiffFilePanel: () => {
			// Flip whatever the user currently sees: if it's auto-on, set
			// explicit-off (and vice versa). Sticky from there.
			const currentlyVisible = diffFilePanelOverride ?? diffFilePanelAutoVisible
			setDiffFilePanelOverride(!currentlyVisible)
		},
		jumpDiffFile,
		moveDiffCommentThread,
		openSelectedDiffComment,
		toggleDiffCommentRange,
		openDiffCommentModal,
		openDiffSuggestionModal,
		openReplyToSelectedComment,
		openEditSelectedComment,
		openDeleteSelectedComment,
	})

	// === Helpers used by the keymap layers ===
	const { scrollCommentThread, moveLabelSelection, moveChangedFileSelection, moveSubmitReviewActionSelection, moveCommandPaletteSelection, selectCommandPaletteIndex } =
		useModalSelectionMovers({
			labelModal,
			commandPaletteCommands,
			changedFileResultsLength: changedFileResults.length,
			submitReviewOptionsLength: submitReviewOptions.length,
			setCommentThreadModal,
			setLabelModal,
			setChangedFilesModal,
			setSubmitReviewModal,
			setCommandPalette,
		})
	const runCommandPaletteCommand = (command: AppCommand) => {
		runCommand(command, { notifyDisabled: true, closePalette: true })
	}
	const toggleCommentSubmitMode = () => {
		setCommentModal((current) => (current.target.kind === "diff" ? { ...current, submitMode: current.submitMode === "post" ? "queue" : "post", error: null } : current))
	}
	const toggleCommentContentKind = () => {
		setCommentModal((current) =>
			current.target.kind === "diff" ? { ...current, contentKind: current.contentKind === "comment" ? "suggestion" : "comment", error: null } : current,
		)
	}
	const { stepSelected, stepSelectedDown, stepSelectedUp, stepSelectedDownWithLoadMore, stepSelectedUpWrap, moveSelectedToPreviousGroup, moveSelectedToNextGroup } =
		useListSelectionStepping({
			activeWorkspaceSurface,
			visiblePullRequests,
			issues,
			repositoryItems,
			releases,
			resourceItemsLength: resourcesView.active?.items.length ?? 0,
			changeItemsLength: changesView.snapshot?.stack.length ?? 0,
			notificationItemsLength: notificationsView.items.length,
			loadMoreSlotAvailable,
			issueLoadMoreSlotAvailable,
			groupStarts,
			getCurrentGroupIndex,
			setSelectedIndex,
			setSelectedIssueIndex,
			setSelectedRepositoryIndex,
			setSelectedReleaseIndex,
			setSelectedResourceIndex: (next) => resourcesView.active?.setSelectedIndex(next),
			setSelectedChangeIndex: changesView.setSelectedIndex,
			setSelectedNotificationIndex: notificationsView.setSelectedIndex,
		})
	const handleQuitOrClose = () => {
		if (themeModalActive) {
			closeThemeModal(false)
			return
		}
		if (activeModal._tag !== "None") {
			closeActiveModal()
			return
		}
		runCommandById("app.quit")
	}

	useAppKeymap({
		disabled: terminalTooSmall,
		closeModalActive,
		itemEditorModalActive,
		metadataSelectorModalActive,
		bulkEditorModalActive,
		pullRequestStateModalActive,
		mergeModalActive,
		commentThreadModalActive,
		changedFilesModalActive,
		filterModalActive,
		submitReviewModalActive,
		pendingReviewModalActive,
		labelModalActive,
		themeModalActive,
		openRepositoryModalActive,
		commentModalActive,
		deleteCommentModalActive,
		commandPaletteActive,
		releaseEditorModalActive,
		deleteReleaseModalActive,
		resourceEditorModalActive: activeModal._tag === "ResourceEditor",
		deleteResourceModalActive: activeModal._tag === "DeleteResource",
		runActionModalActive,
		workflowDispatchModalActive,
		artifactDownloadModalActive,
		filterMode,
		diffFullView,
		runsFullView: runsView.runsFullView || activeWorkspaceSurface === "actions",
		runsViewCtx: activeWorkspaceSurface === "actions" ? { ...actionsView.ctx, repositoryActions: true, runCommandById } : runsView.ctx,
		detailFullView,
		commentsViewActive,
		themeModal,
		submitReviewModal,
		mergeModal,
		commandPaletteSelectedCommand: selectedCommand,
		releaseEditorModal,
		itemEditorModal,
		metadataSelectorModal,
		bulkEditorModal,
		deleteReleaseModalRunning: deleteReleaseModal.running,
		runActionModal,
		workflowDispatchModal,
		artifactDownloadModal,
		resourceEditorModal,
		deleteResourceModalRunning: deleteResourceModal.running,
		activeWorkspaceSurface,
		workspaceTabSurfaces,
		closeActiveModal,
		confirmCloseModal,
		confirmPullRequestStateChange,
		movePullRequestStateSelection,
		cancelOrCloseMergeModal,
		confirmMergeAction,
		cycleMergeMethod,
		moveMergeSelection,
		openDiffCommentModal,
		scrollCommentThread,
		changedFileResultsLength: changedFileResults.length,
		selectChangedFile,
		moveChangedFileSelection,
		applySelectedFilter,
		moveFilterSelection,
		setSubmitReviewModal,
		confirmSubmitReview,
		movePendingReviewSelection,
		jumpPendingReviewComment,
		editPendingReviewComment,
		deletePendingReviewComment,
		submitPendingReviewFromPane,
		discardPendingReviewFromPane,
		editSubmitReview,
		moveSubmitReviewActionSelection,
		toggleLabelAtIndex,
		moveLabelSelection,
		closeThemeModal,
		updateThemeQuery,
		toggleThemeMode,
		toggleThemeTone,
		moveThemeSelection,
		openRepositoryFromInput,
		confirmDeleteComment,
		toggleCommentSubmitMode,
		toggleCommentContentKind,
		runCommandPaletteCommand,
		moveCommandPaletteSelection,
		moveReleaseEditorFocus: releaseActions.moveFocus,
		toggleReleaseEditorFocused: releaseActions.toggleFocused,
		submitReleaseEditor: releaseActions.submit,
		confirmDeleteRelease: releaseActions.confirmDelete,
		confirmRunAction: actionsModalActions.confirmRunAction,
		moveWorkflowDispatchFocus: actionsModalActions.moveWorkflowDispatchFocus,
		cycleWorkflowDispatchValue: actionsModalActions.cycleWorkflowDispatchValue,
		confirmWorkflowDispatch: actionsModalActions.confirmWorkflowDispatch,
		toggleArtifactFocus: actionsModalActions.toggleArtifactFocus,
		moveArtifactSelection: actionsModalActions.moveArtifactSelection,
		confirmArtifactDownload: actionsModalActions.confirmArtifactDownload,
		moveResourceEditorFocus: resourceActions.moveFocus,
		cycleResourceEditorChoice: resourceActions.cycleChoice,
		submitResourceEditor: resourceActions.submit,
		confirmDeleteResource: resourceActions.confirmDelete,
		moveItemEditorFocus,
		toggleItemEditorDraft,
		submitItemEditor,
		moveMetadataSelector,
		toggleMetadataSelector,
		closeOrCancelBulkEditor,
		moveBulkAction,
		toggleBulkEditorFocus,
		submitBulkEditor,
		setFilterDraft,
		setFilterMode,
		setFilterQuery,
		filterQuery,
		filterDraft,
		halfPage,
		diffCommentRangeActive,
		setDiffCommentRangeStartIndex,
		runCommandById,
		openSelectedDiffComment,
		moveDiffCommentAnchor,
		moveDiffCommentToBoundary,
		alignSelectedDiffCommentAnchor,
		selectDiffCommentSide,
		scrollDetailFullViewBy,
		scrollDetailFullViewTo,
		commentsRowCount,
		selectedOrderedComment,
		username,
		moveCommentsSelection,
		setCommentsSelection,
		closeCommentsView,
		openSelectedCommentInBrowser,
		refreshSelectedComments,
		confirmCommentSelection,
		visiblePullRequestsLength: visiblePullRequests.length,
		issuesLength: issues.length,
		repositoryItemsLength: repositoryItems.length,
		releasesLength: releases.length,
		resourceItemsLength: resourcesView.active?.items.length ?? 0,
		changeItemsLength: changesView.snapshot?.stack.length ?? 0,
		notificationItemsLength: notificationsView.items.length,
		selectedRepository,
		selectedPullRequest,
		selectedIssue,
		selectedRepositoryItem,
		selectedRelease,
		selectedResourceItem: resourcesView.active?.selectedItem ?? null,
		selectedNotification: notificationsView.selected,
		isWideLayout,
		loadMoreRowSelected,
		loadMoreIssueRowSelected,
		loadMorePullRequests,
		loadMoreIssues,
		openSelectedRepository,
		openRepositoryPicker,
		toggleFavoriteRepository,
		removeSelectedRepository,
		openFilterModal,
		goUpWorkspaceScope,
		switchQueueMode,
		switchWorkspaceSurface,
		cycleWorkspaceSurface,
		scrollDetailPreviewBy,
		scrollDetailPreviewTo,
		stepSelected,
		stepSelectedUp,
		stepSelectedDown,
		stepSelectedUpWrap,
		stepSelectedDownWithLoadMore,
		moveSelectedToPreviousGroup,
		moveSelectedToNextGroup,
		setSelectedIndex,
		setSelectedIssueIndex,
		setSelectedRepositoryIndex,
		setSelectedReleaseIndex,
		setSelectedResourceIndex: (next) => resourcesView.active?.setSelectedIndex(next),
		setSelectedChangeIndex: changesView.setSelectedIndex,
		setSelectedNotificationIndex: notificationsView.setSelectedIndex,
		handleQuitOrClose,
		setCommandPalette,
		setOpenRepositoryModal,
		setChangedFilesModal,
		setLabelModal,
		setReleaseEditorModal,
		setItemEditorModal,
		setMetadataSelectorModal,
		setBulkEditorModal,
		setWorkflowDispatchModal,
		setArtifactDownloadModal,
		setResourceEditorModal,
		editThemeQuery,
	})

	if (isInitialLoading) {
		return { isInitialLoading: true as const, terminalTooSmall, terminalWidth, terminalHeight, contentWidth, detailPlaceholderContent, loadingFrame }
	}

	const derivations = computeWorkspaceDerivations({
		contentWidth,
		isWideLayout,
		leftPaneWidth,
		rightPaneWidth,
		rightContentWidth,
		fullscreenContentWidth,
		wideBodyHeight,
		dividerJunctionAt,
		showWorkspaceTabs,
		detailFullView,
		diffFullView,
		runsFullView,
		commentsViewActive,
		activeWorkspaceSurface,
		workspaceTabSurfaces,
		selectedPullRequest,
		selectedIssue,
		selectedRepository,
		selectedComments,
		selectedCommentsStatus,
		isSelectedPullRequestDetailLoading,
		pullRequestStatus,
		pullRequestError,
		pullRequestActiveFilterLabel,
		compactPullRequestRows,
		issueActiveFilterLabel,
		pullRequestListRows,
		visibleGroups,
		visiblePullRequests,
		issues,
		showIssueRepositoryGroups,
		issuesStatus,
		issuesError,
		repositoryItems,
		releaseCount: releases.length,
		actionRunCount: actionsView.runsState.status === "ready" ? actionsView.runsState.value.length : 0,
		changeCount: changesView.snapshot?.stack.length ?? 0,
		branchCount: resourcesView.branches.length,
		milestoneCount: resourcesView.milestones.length,
		environmentCount: resourcesView.environments.length,
		runnerCount: resourcesView.runners.length,
		notificationCount: notificationsView.items.filter((item) => item.unread).length,
		selectedIssueIndex,
		selectedRepositoryIndex,
		hasMorePullRequests,
		pullRequestLoadMoreSlotAvailable: loadMoreSlotAvailable,
		isLoadingMorePullRequests,
		loadedPullRequestCount,
		loadingIndicator,
		filterMode,
		visibleFilterText,
		selectPullRequestByUrl,
		setSelectedIssueIndex,
		setSelectedRepositoryIndex,
		loadMoreSelected: loadMoreRowSelected,
		onSelectLoadMore: () => {
			if (loadMorePullRequests()) setSelectedIndex(visiblePullRequests.length)
		},
		hasMoreIssues,
		issueLoadMoreSlotAvailable,
		isLoadingMoreIssues,
		loadedIssueCount,
		loadMoreIssueRowSelected,
		onSelectLoadMoreIssues: () => {
			if (loadMoreIssues()) setSelectedIssueIndex(issues.length)
		},
		diffFilePanelDividerColumn: diffFilePanelVisible ? diffFilePanelEffectiveWidth : null,
	})
	const { showPaneSplit, workspaceTabCounts, filterPlaceholder, workspaceTopDividerJunctions, workspaceBottomDividerJunctions, preFooterDividerJunctions } = derivations

	const modalLayouts = computeModalLayouts({
		contentWidth,
		terminalHeight,
		longestLabelName: labelModal.availableLabels.reduce((max, label) => Math.max(max, label.name.length), 0),
		longestDiffFileName: changedFilesModalActive ? readyDiffFiles.reduce((max, file) => Math.max(max, file.name.length), 0) : 0,
		changedFilesModalActive,
	})
	const commentAnchorLabel = ((): string => {
		if (commentModalActive) {
			if (commentModal.target.kind === "issue") return selectedCommentSubject ? `New comment on #${selectedCommentSubject.number}` : "New comment"
			if (commentModal.target.kind === "reply") return `Reply on ${commentModal.target.anchorLabel}`
			if (commentModal.target.kind === "edit") return commentModal.target.anchorLabel
		}
		return selectedDiffCommentAnchor && selectedDiffCommentLabel ? `${selectedDiffCommentAnchor.path} ${selectedDiffCommentLabel}` : "No diff line selected"
	})()
	const footerProps = computeFooterProps({
		footerNotice,
		filterMode,
		visibleFilterText,
		filterPlaceholder,
		filterQuery,
		detailFullView,
		diffFullView,
		diffCommentRangeActive,
		runsFullView,
		runsInDetail: runsView.inDetail,
		commentsViewActive,
		selectedCommentsStatus,
		selectedOrderedComment,
		username,
		selectedCommentsLength: selectedComments.length,
		selectedItemCount: selectedItemUrls.length,
		selectedCommentSubject,
		activeWorkspaceSurface,
		selectedRepositoryItem,
		selectedRepository,
		selectedPullRequest,
		pullRequestStatus,
		issuesStatus,
		releaseStatus,
		changeStatus: changesView.status,
		selectedRelease,
		isActiveSurfaceLoading,
		closeModal,
		pullRequestStateModal,
		mergeModal,
		submitReviewModal,
		loadingIndicator,
		retryProgress,
	})
	return {
		isInitialLoading: false as const,
		terminalTooSmall,
		terminalWidth,
		terminalHeight,
		contentWidth,
		headerFooterWidth,
		headerRight,
		showWorkspaceTabs,
		workspaceTabSurfaces,
		workspaceTabLabels: Object.fromEntries(workspaceTabSurfaces.map((surface) => [surface, workspaceSurfaceLabelFor(surface, jjLocalStateConnected(repositoryContext))])),
		workspaceTabCounts,
		activeWorkspaceSurface,
		switchWorkspaceSurface,
		workspaceTopDividerJunctions,
		workspaceBottomDividerJunctions,
		preFooterDividerJunctions,
		showPaneSplit,
		dividerJunctionAt,
		layout,
		derivations,
		headerProps: { selectedRepository, homeCrumb, breadcrumbSeparatorText, headerLeftWidth, headerRepoWidth, homeCrumbHovered, setHomeCrumbHovered, goUpWorkspaceScope },
		contentProps: {
			showScrollbars,
			activeWorkspaceSurface,
			commentsViewActive,
			diffFullView,
			runsView,
			actionsView,
			resourcesView,
			notificationsView,
			changesView,
			detailFullView,
			layout,
			derivations,
			issueActiveFilterLabel,
			pullRequestActiveFilterLabel,
			selectedRepositoryItem,
			selectedRepository,
			selectedRepositoryDetails,
			selectedIssue,
			selectedPullRequest,
			selectedItemUrls,
			toggleItemSelection,
			releases,
			selectedRelease,
			selectedReleaseIndex,
			releaseStatus,
			releaseError,
			releaseView,
			setSelectedReleaseIndex,
			selectedComments,
			selectedCommentsStatus,
			selectedCommentsLoadState,
			detailPlaceholderContent,
			isSelectedPullRequestDetailLoading,
			isSelectedPullRequestDetailError,
			selectedPullRequestDetailError,
			commentsViewSelection,
			orderedComments,
			selectedCommentSubject,
			displayedDiffState,
			stackedDiffFiles,
			diffScrollTop,
			effectiveDiffRenderView,
			diffWhitespaceMode,
			diffWrapMode,
			selectedDiffCommentAnchor,
			selectedDiffCommentLabel,
			selectedDiffCommentThread,
			pendingReviewCount: selectedPendingReview?.comments.length ?? 0,
			selectDiffCommentLine,
			setDiffRenderableRef,
			loadingIndicator,
			themeId,
			systemThemeGeneration,
			scrollRefs: { prListScrollRef, detailScrollRef, detailPreviewScrollRef, diffScrollRef, issueListScrollRef },
			openInlineLink,
			diffFilePanel: {
				visible: diffFilePanelVisible,
				width: diffFilePanelEffectiveWidth,
				diffPaneWidth,
				files: readyDiffFiles,
				currentFileIndex: diffFileIndex,
				pickerActive: changedFilesModalActive,
				pickerQuery: changedFilesModal.query,
				pickerSelectedIndex: changedFilesModal.selectedIndex,
				pickerResults: changedFileResults,
				onSelectFile: selectDiffFile,
			},
		},
		footerProps,
		modalsProps: {
			activeModal,
			loadingIndicator,
			selectedItemLabels,
			commentAnchorLabel,
			selectedDiffCommentThread,
			pendingReviewCount: selectedPendingReview?.comments.length ?? 0,
			pendingReview: selectedPendingReview,
			changedFileResults,
			readyDiffFileCount: readyDiffFiles.length,
			commandPaletteCommands,
			selectedCommandIndex,
			onSelectCommandIndex: selectCommandPaletteIndex,
			onRunCommand: runCommandPaletteCommand,
			onCommentChange: setCommentEditorValue,
			onCommentSubmit: submitCommentModal,
			onSelectMetadataOption: (index: number) => setMetadataSelectorModal((current) => ({ ...current, selectedIndex: index })),
			onToggleMetadataOption: toggleMetadataSelector,
			layouts: modalLayouts,
			// Picker takes over the docked panel when visible; suppressing the
			// modal here keeps both presentations from rendering at once.
			suppressChangedFilesModal: diffFilePanelVisible,
		},
	}
}
