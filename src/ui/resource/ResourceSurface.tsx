import { TextAttributes } from "@opentui/core"
import type { BranchItem, DeploymentItem, EnvironmentItem, LoadStatus, MilestoneIssue, MilestoneItem, RepositoryRunner } from "../../domain.js"
import { milestoneProgressPercent } from "../../services/github/milestones.js"
import type { WorkspaceSurface } from "../../workspaceSurfaces.js"
import { colors } from "../colors.js"
import { SplitPane } from "../paneLayout.js"
import { Divider, fitCell, PlainLine, TextLine } from "../primitives.js"

type ResourceItem = BranchItem | MilestoneItem | EnvironmentItem | RepositoryRunner

const itemKey = (item: ResourceItem) =>
	"name" in item && "sha" in item
		? `branch:${item.name}`
		: "number" in item
			? `milestone:${item.number}`
			: "protectionRules" in item
				? `environment:${item.id}`
				: `runner:${item.id}`
const itemTitle = (item: ResourceItem) => ("title" in item ? item.title : item.name)
const itemMeta = (surface: ResourceSurfaceProps["surface"], item: ResourceItem, visibleColumns: readonly string[]) => {
	const secondary = visibleColumns.find((field) => field !== "name" && field !== "title") ?? visibleColumns[0]
	if ("sha" in item) {
		if (secondary === "default") return item.isDefault ? "default" : "not default"
		if (secondary === "protected") return item.protected ? "protected" : "unprotected"
		return item.sha.slice(0, 8)
	}
	if ("openIssues" in item) {
		if (secondary === "progress") return `${milestoneProgressPercent(item)}% · ${item.closedIssues}/${item.closedIssues + item.openIssues}`
		if (secondary === "dueOn") return item.dueOn?.toISOString().slice(0, 10) ?? "no due date"
		return item.state
	}
	if ("protectionRules" in item) {
		if (secondary === "protectionRules") return `${item.protectionRules} protection rule${item.protectionRules === 1 ? "" : "s"}`
		if (secondary === "ref") return item.latestDeployment?.ref ?? "no deployment"
		return item.latestDeployment?.state ?? "no deployment"
	}
	if (secondary === "busy") return item.busy ? "busy" : "idle"
	if (secondary === "labels") return item.labels.map((label) => label.name).join(", ") || "no labels"
	if (secondary === "os") return item.os
	return surface === "runners" ? item.status : ""
}

const ResourceList = ({
	items,
	selectedIndex,
	width,
	height,
	status,
	error,
	label,
	onSelect,
	visibleColumns,
	surface,
}: {
	readonly items: readonly ResourceItem[]
	readonly selectedIndex: number
	readonly width: number
	readonly height: number
	readonly status: LoadStatus
	readonly error: string | null
	readonly label: string
	readonly onSelect: (index: number) => void
	readonly visibleColumns: readonly string[]
	readonly surface: ResourceSurfaceProps["surface"]
}) => {
	if (status === "loading" && items.length === 0) return <PlainLine text={fitCell(` Loading ${label}…`, width)} fg={colors.muted} />
	if (status === "error" && items.length === 0) return <PlainLine text={fitCell(` ${error ?? `Could not load ${label}`}`, width)} fg={colors.error} />
	if (items.length === 0) return <PlainLine text={fitCell(` No ${label}. Press r to retry.`, width)} fg={colors.muted} />
	const visible = Math.max(1, height)
	const start = Math.min(Math.max(0, items.length - visible), Math.max(0, selectedIndex - visible + 1))
	return (
		<box width={width} height={height} flexDirection="column">
			{items.slice(start, start + visible).map((item, offset) => {
				const index = start + offset
				const selected = index === selectedIndex
				const titleWidth = Math.max(10, Math.floor(width * 0.48))
				return (
					<TextLine key={itemKey(item)} width={width} bg={selected ? colors.selectedBg : undefined} onMouseDown={() => onSelect(index)}>
						<span fg={selected ? colors.selectedText : colors.accent} attributes={selected ? TextAttributes.BOLD : 0}>
							{fitCell(` ${itemTitle(item)}`, titleWidth)}
						</span>
						<span fg={selected ? colors.selectedText : colors.muted}>{fitCell(itemMeta(surface, item, visibleColumns), Math.max(1, width - titleWidth - 1))}</span>
					</TextLine>
				)
			})}
		</box>
	)
}

const DetailLines = ({
	surface,
	item,
	milestoneIssues,
	deployments,
}: {
	readonly surface: Extract<WorkspaceSurface, "branches" | "milestones" | "environments" | "runners">
	readonly item: ResourceItem | null
	readonly milestoneIssues: readonly MilestoneIssue[]
	readonly deployments: readonly DeploymentItem[]
}): readonly string[] => {
	if (!item) return ["Select an item to inspect it."]
	if (surface === "branches") {
		const branch = item as BranchItem
		return [branch.name, `SHA ${branch.sha}`, `default ${branch.isDefault ? "yes" : "no"} · protected ${branch.protected ? "yes" : "no"}`]
	}
	if (surface === "milestones") {
		const milestone = item as MilestoneItem
		return [
			milestone.title,
			`${milestone.state} · ${milestoneProgressPercent(milestone)}% complete · ${milestone.closedIssues}/${milestone.closedIssues + milestone.openIssues} issues`,
			`due ${milestone.dueOn?.toISOString().slice(0, 10) ?? "none"}`,
			milestone.description || "No description.",
			"",
			...milestoneIssues.map((issue) => `#${issue.number} ${issue.state} · ${issue.title}`),
		]
	}
	if (surface === "environments") {
		const environment = item as EnvironmentItem
		return [
			environment.name,
			`${environment.protectionRules} protection rule${environment.protectionRules === 1 ? "" : "s"}`,
			environment.latestDeployment ? `latest ${environment.latestDeployment.state} · ${environment.latestDeployment.ref}` : "No deployments.",
			"",
			...deployments.map((deployment) => `#${deployment.id} ${deployment.state} · ${deployment.ref} · ${deployment.createdAt.toISOString().slice(0, 10)}`),
		]
	}
	const runner = item as RepositoryRunner
	return [
		runner.name,
		`${runner.status} · ${runner.busy ? "busy" : "idle"} · ${runner.os}`,
		`id ${runner.id}`,
		"",
		`labels ${runner.labels.map((label) => `${label.name}${label.type === "custom" ? "*" : ""}`).join(", ") || "none"}`,
		"Repository runner management is read-only in ghui.",
	]
}

const ResourceDetails = (props: {
	readonly surface: Extract<WorkspaceSurface, "branches" | "milestones" | "environments" | "runners">
	readonly item: ResourceItem | null
	readonly milestoneIssues: readonly MilestoneIssue[]
	readonly deployments: readonly DeploymentItem[]
	readonly width: number
	readonly height: number
}) => {
	const lines = DetailLines(props)
	return (
		<box width={props.width} height={props.height} flexDirection="column" paddingLeft={1} paddingRight={1}>
			{lines.slice(0, Math.max(1, props.height)).map((line, index) => (
				<PlainLine key={index} text={fitCell(line, Math.max(1, props.width - 2))} fg={index === 0 ? colors.accent : index === 1 ? colors.muted : colors.text} />
			))}
		</box>
	)
}

export interface ResourceSurfaceProps {
	readonly surface: Extract<WorkspaceSurface, "branches" | "milestones" | "environments" | "runners">
	readonly items: readonly ResourceItem[]
	readonly selectedItem: ResourceItem | null
	readonly selectedIndex: number
	readonly status: LoadStatus
	readonly error: string | null
	readonly milestoneIssues: readonly MilestoneIssue[]
	readonly deployments: readonly DeploymentItem[]
	readonly isWideLayout: boolean
	readonly width: number
	readonly height: number
	readonly leftWidth: number
	readonly rightWidth: number
	readonly setSelectedIndex: (index: number) => void
	readonly visibleColumns: readonly string[]
}

export const ResourceSurface = (props: ResourceSurfaceProps) => {
	const label = props.surface
	const list = (
		<ResourceList
			items={props.items}
			selectedIndex={props.selectedIndex}
			width={props.isWideLayout ? props.leftWidth : props.width}
			height={props.isWideLayout ? props.height : Math.max(3, Math.floor((props.height - 1) * 0.52))}
			status={props.status}
			error={props.error}
			label={label}
			onSelect={props.setSelectedIndex}
			visibleColumns={props.visibleColumns}
			surface={props.surface}
		/>
	)
	const details = (
		<ResourceDetails
			surface={props.surface}
			item={props.selectedItem}
			milestoneIssues={props.milestoneIssues}
			deployments={props.deployments}
			width={props.isWideLayout ? props.rightWidth : props.width}
			height={props.isWideLayout ? props.height : Math.max(1, props.height - Math.max(3, Math.floor((props.height - 1) * 0.52)) - 1)}
		/>
	)
	return props.isWideLayout ? (
		<SplitPane height={props.height} leftWidth={props.leftWidth} rightWidth={props.rightWidth} left={list} right={details} />
	) : (
		<box width={props.width} height={props.height} flexDirection="column">
			{list}
			<Divider width={props.width} />
			{details}
		</box>
	)
}
