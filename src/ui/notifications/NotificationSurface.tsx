import { TextAttributes } from "@opentui/core"
import type { LoadStatus, NotificationItem } from "../../domain.js"
import { colors } from "../colors.js"
import { Divider, fitCell, PlainLine, TextLine } from "../primitives.js"
import { SplitPane } from "../paneLayout.js"

const List = (props: {
	readonly items: readonly NotificationItem[]
	readonly selectedIndex: number
	readonly selectedIds: readonly string[]
	readonly status: LoadStatus
	readonly error: string | null
	readonly width: number
	readonly height: number
	readonly onSelect: (index: number) => void
	readonly visibleColumns: readonly string[]
}) => {
	if (props.status === "loading" && props.items.length === 0) return <PlainLine text={fitCell(" Loading notifications…", props.width)} fg={colors.muted} />
	if (props.status === "error" && props.items.length === 0) return <PlainLine text={fitCell(` ${props.error ?? "Could not load notifications."}`, props.width)} fg={colors.error} />
	if (props.items.length === 0) return <PlainLine text={fitCell(" No matching notifications. Press r to retry.", props.width)} fg={colors.muted} />
	const visible = Math.max(1, props.height)
	const start = Math.min(Math.max(0, props.items.length - visible), Math.max(0, props.selectedIndex - visible + 1))
	return (
		<box width={props.width} height={props.height} flexDirection="column">
			{props.items.slice(start, start + visible).map((item, offset) => {
				const index = start + offset
				const selected = index === props.selectedIndex
				const prefix = props.selectedIds.includes(item.id) ? "◉" : item.unread ? "●" : "○"
				const secondaryField = props.visibleColumns.find((field) => field !== "subject" && field !== "unread") ?? "repository"
				const secondary = secondaryField === "updatedAt" ? item.updatedAt.toISOString().slice(0, 10) : String(item[secondaryField as keyof NotificationItem] ?? "")
				const titleWidth = Math.max(12, Math.floor(props.width * 0.6))
				return (
					<TextLine key={item.id} width={props.width} bg={selected ? colors.selectedBg : undefined} onMouseDown={() => props.onSelect(index)}>
						<span fg={selected ? colors.selectedText : item.unread ? colors.accent : colors.muted} attributes={item.unread ? TextAttributes.BOLD : 0}>
							{fitCell(` ${prefix} ${item.subject}`, titleWidth)}
						</span>
						<span fg={selected ? colors.selectedText : colors.muted}>{fitCell(secondary, Math.max(1, props.width - titleWidth))}</span>
					</TextLine>
				)
			})}
		</box>
	)
}

const Details = ({ item, width, height }: { readonly item: NotificationItem | null; readonly width: number; readonly height: number }) => {
	const lines = item
		? [
				item.subject,
				`${item.unread ? "unread" : "read"} · ${item.reason} · ${item.subjectType}`,
				item.repository,
				`updated ${item.updatedAt.toISOString()}`,
				item.url ?? "Target unavailable or deleted.",
			]
		: ["Select a notification to inspect it."]
	return (
		<box width={width} height={height} flexDirection="column" paddingLeft={1} paddingRight={1}>
			{lines.slice(0, Math.max(1, height)).map((line, index) => (
				<PlainLine key={index} text={fitCell(line, Math.max(1, width - 2))} fg={index === 0 ? colors.accent : index === 1 ? colors.muted : colors.text} />
			))}
		</box>
	)
}

export const NotificationSurface = (props: {
	readonly items: readonly NotificationItem[]
	readonly selected: NotificationItem | null
	readonly selectedIndex: number
	readonly selectedIds: readonly string[]
	readonly status: LoadStatus
	readonly error: string | null
	readonly includeRead: boolean
	readonly typeFilter: string | null
	readonly filterQuery: string
	readonly visibleColumns: readonly string[]
	readonly isWideLayout: boolean
	readonly width: number
	readonly height: number
	readonly leftWidth: number
	readonly rightWidth: number
	readonly setSelectedIndex: (index: number) => void
}) => {
	const header = ` ${props.includeRead ? "all" : "unread"} · type ${props.typeFilter ?? "all"}${props.filterQuery ? ` · search ${props.filterQuery}` : ""}`
	const bodyHeight = Math.max(1, props.height - 1)
	const list = (
		<List
			items={props.items}
			selectedIndex={props.selectedIndex}
			selectedIds={props.selectedIds}
			status={props.status}
			error={props.error}
			width={props.isWideLayout ? props.leftWidth : props.width}
			height={props.isWideLayout ? bodyHeight : Math.max(2, Math.floor((bodyHeight - 1) * 0.58))}
			onSelect={props.setSelectedIndex}
			visibleColumns={props.visibleColumns}
		/>
	)
	const details = (
		<Details
			item={props.selected}
			width={props.isWideLayout ? props.rightWidth : props.width}
			height={props.isWideLayout ? bodyHeight : Math.max(1, bodyHeight - Math.max(2, Math.floor((bodyHeight - 1) * 0.58)) - 1)}
		/>
	)
	return (
		<box width={props.width} height={props.height} flexDirection="column">
			<PlainLine text={fitCell(header, props.width)} fg={colors.muted} />
			{props.isWideLayout ? (
				<SplitPane height={bodyHeight} leftWidth={props.leftWidth} rightWidth={props.rightWidth} left={list} right={details} />
			) : (
				<box width={props.width} height={bodyHeight} flexDirection="column">
					{list}
					<Divider width={props.width} />
					{details}
				</box>
			)}
		</box>
	)
}
