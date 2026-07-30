import type { ScrollBoxRenderable, DiffRenderable } from "@opentui/core"
import type { MutableRefObject } from "react"
import type { DiffCommentSide, IssueItem, LoadStatus, PullRequestComment, PullRequestItem, PullRequestReviewComment, ReleaseItem, RepositoryDetails } from "../domain.js"
import type { ThemeId } from "../ui/colors.js"
import type { DetailCommentsStatus, DetailPlaceholderContent } from "../ui/DetailsPane.js"
import type { DiffFilePatch, DiffView, DiffWhitespaceMode, DiffWrapMode, PullRequestDiffState, StackedDiffCommentAnchor, StackedDiffFilePatch } from "../ui/diff.js"
import type { ChangedFileSearchResult } from "../ui/modals/shared.js"
import type { OrderedComment } from "../ui/CommentsPane.js"
import type { CommentLoadState } from "../ui/comments/loadState.js"
import type { RepositoryListItem } from "../ui/RepoList.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import type { WorkspaceLayout } from "../workspace/layout.js"
import type { WorkspaceDerivations } from "../workspace/derivations.js"
import { IssueSurface } from "./IssueSurface.js"
import { PullRequestSurface } from "./PullRequestSurface.js"
import type { RunsViewModel } from "../hooks/useRunsView.js"
import { RepoSurface } from "./RepoSurface.js"
import { ReleaseSurface } from "./ReleaseSurface.js"
import { ActionsSurface } from "./ActionsSurface.js"
import type { RepositoryActionsViewModel } from "../hooks/useRepositoryActionsView.js"
import type { RepositoryResourcesModel } from "./resource/useResourceSurfaces.js"
import { ResourceSurface } from "../ui/resource/ResourceSurface.js"
import type { NotificationSurfaceModel } from "./notification/useNotificationSurface.js"
import { NotificationSurface } from "../ui/notifications/NotificationSurface.js"
import type { SurfaceViewConfig } from "../configStore.js"

export interface WorkspaceContentProps {
	readonly showScrollbars: boolean
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly commentsViewActive: boolean
	readonly diffFullView: boolean
	readonly runsView: RunsViewModel
	readonly actionsView: RepositoryActionsViewModel
	readonly resourcesView: RepositoryResourcesModel
	readonly notificationsView: NotificationSurfaceModel
	readonly detailFullView: boolean
	readonly layout: WorkspaceLayout
	readonly derivations: WorkspaceDerivations
	readonly issueActiveFilterLabel: string | null
	readonly pullRequestActiveFilterLabel: string | null
	readonly selectedRepositoryItem: RepositoryListItem | null
	readonly selectedRepository: string | null
	readonly selectedRepositoryDetails: RepositoryDetails | null
	readonly selectedIssue: IssueItem | null
	readonly selectedPullRequest: PullRequestItem | null
	readonly selectedItemUrls: readonly string[]
	readonly toggleItemSelection: (url: string) => void
	readonly releases: readonly ReleaseItem[]
	readonly selectedRelease: ReleaseItem | null
	readonly selectedReleaseIndex: number
	readonly releaseStatus: LoadStatus
	readonly releaseError: string | null
	readonly releaseView: SurfaceViewConfig
	readonly setSelectedReleaseIndex: (index: number) => void
	readonly selectedComments: readonly PullRequestComment[]
	readonly selectedCommentsStatus: DetailCommentsStatus
	readonly selectedCommentsLoadState: CommentLoadState
	readonly detailPlaceholderContent: DetailPlaceholderContent
	readonly isSelectedPullRequestDetailLoading: boolean
	readonly isSelectedPullRequestDetailError: boolean
	readonly selectedPullRequestDetailError: string | null
	readonly commentsViewSelection: number
	readonly orderedComments: readonly OrderedComment[]
	readonly selectedCommentSubject: IssueItem | PullRequestItem | null
	readonly displayedDiffState: PullRequestDiffState | undefined
	readonly stackedDiffFiles: readonly StackedDiffFilePatch[]
	readonly diffScrollTop: number
	readonly effectiveDiffRenderView: DiffView
	readonly diffWhitespaceMode: DiffWhitespaceMode
	readonly diffWrapMode: DiffWrapMode
	readonly selectedDiffCommentAnchor: StackedDiffCommentAnchor | null
	readonly selectedDiffCommentLabel: string | null
	readonly selectedDiffCommentThread: readonly PullRequestReviewComment[]
	readonly pendingReviewCount: number
	readonly selectDiffCommentLine: (renderLine: number, side: DiffCommentSide | null) => void
	readonly setDiffRenderableRef: (index: number, diff: DiffRenderable | null) => void
	readonly loadingIndicator: string
	readonly themeId: ThemeId
	readonly systemThemeGeneration: number
	readonly scrollRefs: {
		readonly prListScrollRef: MutableRefObject<ScrollBoxRenderable | null>
		readonly detailScrollRef: MutableRefObject<ScrollBoxRenderable | null>
		readonly detailPreviewScrollRef: MutableRefObject<ScrollBoxRenderable | null>
		readonly diffScrollRef: MutableRefObject<ScrollBoxRenderable | null>
		readonly issueListScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	}
	readonly openInlineLink: (url: string) => void
	readonly diffFilePanel: DiffFilePanelBundle
}

export interface DiffFilePanelBundle {
	readonly visible: boolean
	readonly width: number
	readonly diffPaneWidth: number
	readonly files: readonly DiffFilePatch[]
	readonly currentFileIndex: number
	readonly pickerActive: boolean
	readonly pickerQuery: string
	readonly pickerSelectedIndex: number
	readonly pickerResults: readonly ChangedFileSearchResult[]
	readonly onSelectFile: (index: number) => void
}

export const WorkspaceContent = (props: WorkspaceContentProps) => {
	const { activeWorkspaceSurface, commentsViewActive, diffFullView, detailFullView, layout, derivations } = props
	if (activeWorkspaceSurface === "repos" && !commentsViewActive && !diffFullView && !detailFullView) {
		return (
			<RepoSurface
				showScrollbars={props.showScrollbars}
				isWideLayout={layout.isWideLayout}
				wideBodyHeight={layout.wideBodyHeight}
				contentWidth={layout.contentWidth}
				leftPaneWidth={layout.leftPaneWidth}
				rightPaneWidth={layout.rightPaneWidth}
				leftContentWidth={layout.leftContentWidth}
				fullscreenContentWidth={layout.fullscreenContentWidth}
				sectionPadding={layout.sectionPadding}
				narrowRepoListHeight={derivations.narrowRepoListHeight}
				narrowRepoDetailHeight={derivations.narrowRepoDetailHeight}
				repoListNeedsScroll={derivations.repoListNeedsScroll}
				narrowRepoListNeedsScroll={derivations.narrowRepoListNeedsScroll}
				repoListProps={derivations.repoListProps}
				selectedRepositoryItem={props.selectedRepositoryItem}
				selectedRepositoryDetails={props.selectedRepositoryDetails}
				detailPreviewScrollRef={props.scrollRefs.detailPreviewScrollRef}
			/>
		)
	}
	if (activeWorkspaceSurface === "issues" && !commentsViewActive && !diffFullView) {
		return (
			<IssueSurface
				showScrollbars={props.showScrollbars}
				isWideLayout={layout.isWideLayout}
				wideBodyHeight={layout.wideBodyHeight}
				contentWidth={layout.contentWidth}
				leftPaneWidth={layout.leftPaneWidth}
				rightPaneWidth={layout.rightPaneWidth}
				leftContentWidth={layout.leftContentWidth}
				fullscreenContentWidth={layout.fullscreenContentWidth}
				sectionPadding={layout.sectionPadding}
				narrowIssueListHeight={derivations.narrowIssueListHeight}
				narrowIssueDetailHeight={derivations.narrowIssueDetailHeight}
				issueListNeedsScroll={derivations.issueListNeedsScroll}
				narrowIssueListNeedsScroll={derivations.narrowIssueListNeedsScroll}
				activeFilterLabel={props.issueActiveFilterLabel}
				issueJunctions={derivations.issueJunctions}
				issueListProps={{
					...derivations.issueListProps,
					bulkSelectedUrls: props.selectedItemUrls,
					onToggleIssueSelection: props.toggleItemSelection,
				}}
				selectedIssue={props.selectedIssue}
				issueListScrollRef={props.scrollRefs.issueListScrollRef}
				detailScrollRef={props.scrollRefs.detailScrollRef}
				detailPreviewScrollRef={props.scrollRefs.detailPreviewScrollRef}
				detailFullView={detailFullView}
				onLinkOpen={props.openInlineLink}
			/>
		)
	}
	if (activeWorkspaceSurface === "releases" && !commentsViewActive && !diffFullView) {
		return (
			<ReleaseSurface
				releases={props.releases}
				selectedRelease={props.selectedRelease}
				selectedReleaseIndex={props.selectedReleaseIndex}
				status={props.releaseStatus}
				error={props.releaseError}
				visibleColumns={props.releaseView.visibleColumns ?? []}
				isWideLayout={layout.isWideLayout}
				detailFullView={detailFullView}
				wideBodyHeight={layout.wideBodyHeight}
				contentWidth={layout.contentWidth}
				leftPaneWidth={layout.leftPaneWidth}
				rightPaneWidth={layout.rightPaneWidth}
				setSelectedReleaseIndex={props.setSelectedReleaseIndex}
			/>
		)
	}
	if (activeWorkspaceSurface === "actions" && props.selectedRepository) {
		return (
			<ActionsSurface
				repository={props.selectedRepository}
				view={props.actionsView}
				contentWidth={layout.fullscreenContentWidth}
				height={layout.wideBodyHeight}
				loadingIndicator={props.loadingIndicator}
				showScrollbar={props.showScrollbars}
			/>
		)
	}
	if (
		(activeWorkspaceSurface === "branches" || activeWorkspaceSurface === "milestones" || activeWorkspaceSurface === "environments" || activeWorkspaceSurface === "runners") &&
		props.resourcesView.active
	) {
		return (
			<ResourceSurface
				surface={props.resourcesView.active.surface}
				items={props.resourcesView.active.items}
				selectedItem={props.resourcesView.active.selectedItem}
				selectedIndex={props.resourcesView.active.selectedIndex}
				status={props.resourcesView.active.status}
				error={props.resourcesView.active.error}
				visibleColumns={props.resourcesView.active.view.visibleColumns ?? []}
				milestoneIssues={props.resourcesView.milestoneIssues}
				deployments={props.resourcesView.deployments}
				isWideLayout={layout.isWideLayout}
				width={layout.contentWidth}
				height={layout.wideBodyHeight}
				leftWidth={layout.leftPaneWidth}
				rightWidth={layout.rightPaneWidth}
				setSelectedIndex={props.resourcesView.active.setSelectedIndex}
			/>
		)
	}
	if (activeWorkspaceSurface === "notifications") {
		return (
			<NotificationSurface
				items={props.notificationsView.items}
				selected={props.notificationsView.selected}
				selectedIndex={props.notificationsView.selectedIndex}
				selectedIds={props.notificationsView.selectedIds}
				status={props.notificationsView.status}
				error={props.notificationsView.error}
				includeRead={props.notificationsView.includeRead}
				typeFilter={props.notificationsView.typeFilter}
				filterQuery={props.notificationsView.filterQuery}
				visibleColumns={props.notificationsView.view.visibleColumns ?? []}
				isWideLayout={layout.isWideLayout}
				width={layout.contentWidth}
				height={layout.wideBodyHeight}
				leftWidth={layout.leftPaneWidth}
				rightWidth={layout.rightPaneWidth}
				setSelectedIndex={props.notificationsView.setSelectedIndex}
			/>
		)
	}
	return (
		<PullRequestSurface
			showScrollbars={props.showScrollbars}
			isWideLayout={layout.isWideLayout}
			contentWidth={layout.contentWidth}
			leftPaneWidth={layout.leftPaneWidth}
			rightPaneWidth={layout.rightPaneWidth}
			leftContentWidth={layout.leftContentWidth}
			rightContentWidth={layout.rightContentWidth}
			fullscreenContentWidth={layout.fullscreenContentWidth}
			sectionPadding={layout.sectionPadding}
			wideBodyHeight={layout.wideBodyHeight}
			wideDetailHeaderHeight={derivations.wideDetailHeaderHeight}
			wideDetailBodyScrollable={derivations.wideDetailBodyScrollable}
			wideDetailLines={layout.wideDetailLines}
			fullscreenDetailHeaderHeight={derivations.fullscreenDetailHeaderHeight}
			fullscreenDetailBodyScrollable={derivations.fullscreenDetailBodyScrollable}
			fullscreenBodyLines={layout.fullscreenBodyLines}
			widePullRequestListHeight={derivations.widePullRequestListHeight}
			widePullRequestListNeedsScroll={derivations.widePullRequestListNeedsScroll}
			narrowPullRequestListHeight={derivations.narrowPullRequestListHeight}
			narrowPullRequestRowsHeight={derivations.narrowPullRequestRowsHeight}
			narrowPullRequestListNeedsScroll={derivations.narrowPullRequestListNeedsScroll}
			narrowDetailsPaneHeight={derivations.narrowDetailsPaneHeight}
			narrowPreviewBodyHeight={derivations.narrowPreviewBodyHeight}
			narrowPreviewBodyScrollable={derivations.narrowPreviewBodyScrollable}
			activeFilterLabel={props.pullRequestActiveFilterLabel}
			detailJunctions={derivations.detailJunctions}
			prListProps={{
				...derivations.prListProps,
				bulkSelectedUrls: props.selectedItemUrls,
				onTogglePullRequestSelection: props.toggleItemSelection,
			}}
			selectedPullRequest={props.selectedPullRequest}
			selectedComments={props.selectedComments}
			selectedCommentsStatus={props.selectedCommentsStatus}
			selectedCommentsLoadState={props.selectedCommentsLoadState}
			detailPlaceholderContent={props.detailPlaceholderContent}
			isSelectedPullRequestDetailLoading={props.isSelectedPullRequestDetailLoading}
			isSelectedPullRequestDetailError={props.isSelectedPullRequestDetailError}
			selectedPullRequestDetailError={props.selectedPullRequestDetailError}
			commentsViewActive={commentsViewActive}
			commentsViewSelection={props.commentsViewSelection}
			orderedComments={props.orderedComments}
			commentSubject={props.selectedCommentSubject}
			diffFullView={diffFullView}
			runsView={props.runsView}
			displayedDiffState={props.displayedDiffState}
			stackedDiffFiles={props.stackedDiffFiles}
			diffScrollTop={props.diffScrollTop}
			effectiveDiffRenderView={props.effectiveDiffRenderView}
			diffWhitespaceMode={props.diffWhitespaceMode}
			diffWrapMode={props.diffWrapMode}
			selectedDiffCommentAnchor={props.selectedDiffCommentAnchor}
			selectedDiffCommentLabel={props.selectedDiffCommentLabel}
			selectedDiffCommentThread={props.selectedDiffCommentThread}
			pendingReviewCount={props.pendingReviewCount}
			selectDiffCommentLine={props.selectDiffCommentLine}
			setDiffRenderableRef={props.setDiffRenderableRef}
			detailFullView={detailFullView}
			loadingIndicator={props.loadingIndicator}
			themeId={props.themeId}
			systemThemeGeneration={props.systemThemeGeneration}
			prListScrollRef={props.scrollRefs.prListScrollRef}
			detailScrollRef={props.scrollRefs.detailScrollRef}
			detailPreviewScrollRef={props.scrollRefs.detailPreviewScrollRef}
			diffScrollRef={props.scrollRefs.diffScrollRef}
			onLinkOpen={props.openInlineLink}
			diffFilePanel={props.diffFilePanel}
		/>
	)
}
