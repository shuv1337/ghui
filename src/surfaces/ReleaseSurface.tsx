import { TextAttributes } from "@opentui/core"
import type { LoadStatus, ReleaseItem } from "../domain.js"
import { colors } from "../ui/colors.js"
import { wrapText } from "../ui/DetailsPane.js"
import { SplitPane } from "../ui/paneLayout.js"
import { Divider, fitCell, PlainLine, TextLine } from "../ui/primitives.js"

const releaseState = (release: ReleaseItem) => (release.isDraft ? "DRAFT" : release.isPrerelease ? "PRE" : "LIVE")

const ReleaseList = ({
	releases,
	selectedIndex,
	width,
	height,
	status,
	error,
	onSelect,
	visibleColumns,
}: {
	releases: readonly ReleaseItem[]
	selectedIndex: number
	width: number
	height: number
	status: LoadStatus
	error: string | null
	onSelect: (index: number) => void
	visibleColumns: readonly string[]
}) => {
	if (status === "loading" && releases.length === 0) return <PlainLine text={fitCell(" Loading releases…", width)} fg={colors.muted} />
	if (status === "error" && releases.length === 0) return <PlainLine text={fitCell(` ${error ?? "Could not load releases"}`, width)} fg={colors.error} />
	if (releases.length === 0) return <PlainLine text={fitCell(" No releases. Press c to create one.", width)} fg={colors.muted} />

	const visibleRows = Math.max(1, height)
	const start = Math.min(Math.max(0, releases.length - visibleRows), Math.max(0, selectedIndex - visibleRows + 1))
	return (
		<box width={width} height={height} flexDirection="column">
			{releases.slice(start, start + visibleRows).map((release, offset) => {
				const index = start + offset
				const selected = index === selectedIndex
				const state = releaseState(release)
				const stateVisible = visibleColumns.includes("draft") || visibleColumns.includes("prerelease")
				const stateWidth = stateVisible ? 7 : 0
				const primaryField = visibleColumns.includes("tagName") ? "tagName" : (visibleColumns[0] ?? "tagName")
				const secondaryField = visibleColumns.find((field) => field !== primaryField && field !== "draft" && field !== "prerelease") ?? "name"
				const value = (field: string) => {
					const raw = field === "draft" ? release.isDraft : field === "prerelease" ? release.isPrerelease : release[field as keyof ReleaseItem]
					return raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? "")
				}
				const primaryWidth = Math.max(8, Math.min(18, Math.floor(width * 0.34)))
				const secondaryWidth = Math.max(1, width - primaryWidth - stateWidth - 2)
				return (
					<TextLine key={`${release.repository}:${release.tagName}`} width={width} bg={selected ? colors.selectedBg : undefined} onMouseDown={() => onSelect(index)}>
						<span fg={selected ? colors.selectedText : colors.accent} attributes={selected ? TextAttributes.BOLD : 0}>
							{fitCell(` ${value(primaryField)}`, primaryWidth)}
						</span>
						<span fg={selected ? colors.selectedText : colors.text}>{fitCell(value(secondaryField), secondaryWidth)}</span>
						{stateVisible ? (
							<span fg={release.isDraft ? colors.status.review : release.isPrerelease ? colors.status.pending : colors.status.passing}>{fitCell(state, stateWidth, "right")}</span>
						) : null}
						<span> </span>
					</TextLine>
				)
			})}
		</box>
	)
}

const ReleaseDetails = ({ release, width, height }: { release: ReleaseItem | null; width: number; height: number }) => {
	const contentWidth = Math.max(1, width - 2)
	if (!release) return <PlainLine text={fitCell(" Select a release to inspect it.", width)} fg={colors.muted} />
	const published = release.publishedAt?.toISOString().slice(0, 10) ?? "not published"
	const bodyLines = wrapText(release.body || "No release notes.", contentWidth)
	return (
		<box width={width} height={height} flexDirection="column" paddingLeft={1} paddingRight={1}>
			<TextLine width={contentWidth}>
				<span fg={colors.accent} attributes={TextAttributes.BOLD}>
					{fitCell(release.name, contentWidth)}
				</span>
			</TextLine>
			<PlainLine text={fitCell(`${release.tagName}  ${releaseState(release)}  ${published}`, contentWidth)} fg={colors.muted} />
			<PlainLine text={fitCell(`target ${release.targetCommitish || "default"}  by ${release.author ?? "unknown"}`, contentWidth)} fg={colors.muted} />
			<box height={1} />
			{bodyLines.slice(0, Math.max(1, height - 5)).map((line, index) => (
				<PlainLine key={index} text={fitCell(line, contentWidth)} fg={colors.text} />
			))}
		</box>
	)
}

export interface ReleaseSurfaceProps {
	readonly releases: readonly ReleaseItem[]
	readonly selectedRelease: ReleaseItem | null
	readonly selectedReleaseIndex: number
	readonly status: LoadStatus
	readonly error: string | null
	readonly isWideLayout: boolean
	readonly detailFullView: boolean
	readonly wideBodyHeight: number
	readonly contentWidth: number
	readonly leftPaneWidth: number
	readonly rightPaneWidth: number
	readonly setSelectedReleaseIndex: (index: number) => void
	readonly visibleColumns: readonly string[]
}

export const ReleaseSurface = (props: ReleaseSurfaceProps) => {
	if (props.detailFullView) {
		return <ReleaseDetails release={props.selectedRelease} width={props.contentWidth} height={props.wideBodyHeight} />
	}
	if (props.isWideLayout) {
		return (
			<SplitPane
				height={props.wideBodyHeight}
				leftWidth={props.leftPaneWidth}
				rightWidth={props.rightPaneWidth}
				left={
					<ReleaseList
						releases={props.releases}
						selectedIndex={props.selectedReleaseIndex}
						width={props.leftPaneWidth}
						height={props.wideBodyHeight}
						status={props.status}
						error={props.error}
						onSelect={props.setSelectedReleaseIndex}
						visibleColumns={props.visibleColumns}
					/>
				}
				right={<ReleaseDetails release={props.selectedRelease} width={props.rightPaneWidth} height={props.wideBodyHeight} />}
			/>
		)
	}
	const listHeight = Math.max(3, Math.floor((props.wideBodyHeight - 1) * 0.52))
	const detailHeight = Math.max(1, props.wideBodyHeight - listHeight - 1)
	return (
		<box width={props.contentWidth} height={props.wideBodyHeight} flexDirection="column">
			<ReleaseList
				releases={props.releases}
				selectedIndex={props.selectedReleaseIndex}
				width={props.contentWidth}
				height={listHeight}
				status={props.status}
				error={props.error}
				onSelect={props.setSelectedReleaseIndex}
				visibleColumns={props.visibleColumns}
			/>
			<Divider width={props.contentWidth} />
			<ReleaseDetails release={props.selectedRelease} width={props.contentWidth} height={detailHeight} />
		</box>
	)
}
