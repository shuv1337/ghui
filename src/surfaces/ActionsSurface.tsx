import type { RepositoryActionsViewModel } from "../hooks/useRepositoryActionsView.js"
import { PullRequestRunsPane } from "../ui/runs/RunsPane.js"

export const ActionsSurface = ({
	repository,
	view,
	contentWidth,
	height,
	loadingIndicator,
	showScrollbar,
}: {
	repository: string
	view: RepositoryActionsViewModel
	contentWidth: number
	height: number
	loadingIndicator: string
	showScrollbar: boolean
}) => (
	<PullRequestRunsPane
		pullRequest={null}
		repository={repository}
		inDetail={view.inDetail}
		runsState={view.runsState}
		detailState={view.detailState}
		runsSelection={view.runsSelection}
		detailSelection={view.detailSelection}
		detailRows={view.detailRows}
		onSelectRow={view.selectRow}
		onActivateRow={view.activateRow}
		contentWidth={contentWidth}
		height={height}
		loadingIndicator={loadingIndicator}
		showScrollbar={showScrollbar}
		logText={view.jobLog?.text ?? null}
		logLoading={view.jobLogLoading}
		logError={view.jobLogError}
		logScrollTop={view.jobLogScrollTop}
		filterSummary={view.filterSummary}
		filtersActive={view.filtersActive}
	/>
)
