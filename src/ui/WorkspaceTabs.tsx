import { TextAttributes } from "@opentui/core"
import { useState } from "react"
import { colors, mixHex, rowHoverBackground } from "./colors.js"
import { fitCell, TextLine } from "./primitives.js"
import { workspaceSurfaceLabels, workspaceSurfaces, type WorkspaceSurface } from "../workspaceSurfaces.js"

export type WorkspaceSurfaceCounts = Partial<Record<WorkspaceSurface, number | string>>

const tabText = (surface: WorkspaceSurface, counts: WorkspaceSurfaceCounts) => {
	const label = workspaceSurfaceLabels[surface]
	const count = counts[surface]
	return count === undefined ? ` ${label} ` : ` ${label} ${count} `
}

export interface WorkspaceTabLayout {
	readonly primary: readonly WorkspaceSurface[]
	readonly overflow: readonly WorkspaceSurface[]
	readonly overflowText: string | null
}

const overflowTabText = (activeSurface: WorkspaceSurface, overflow: readonly WorkspaceSurface[]) => {
	const activeIndex = overflow.indexOf(activeSurface)
	return activeIndex < 0 ? ` MORE +${overflow.length} ` : ` ${workspaceSurfaceLabels[activeSurface]} ${activeIndex + 1}/${overflow.length} `
}

const segmentsWidth = (texts: readonly string[]) => texts.reduce((sum, text) => sum + text.length, 0) + Math.max(0, texts.length - 1)

/**
 * Fits the leading Surface tabs into one row and reserves a compact, cycling
 * picker for everything else. The active overflow Surface is named in the
 * picker so the current route never becomes visually ambiguous.
 */
export const computeWorkspaceTabLayout = (
	activeSurface: WorkspaceSurface,
	width: number,
	counts: WorkspaceSurfaceCounts,
	surfaces: readonly WorkspaceSurface[] = workspaceSurfaces,
): WorkspaceTabLayout => {
	const available = Math.max(0, width - 1) // trailing divider
	const allTexts = surfaces.map((surface) => tabText(surface, counts))
	if (segmentsWidth(allTexts) <= available) return { primary: surfaces, overflow: [], overflowText: null }

	for (let primaryCount = Math.max(0, surfaces.length - 1); primaryCount >= 0; primaryCount -= 1) {
		const primary = surfaces.slice(0, primaryCount)
		const overflow = surfaces.slice(primaryCount)
		const overflowText = overflowTabText(activeSurface, overflow)
		if (segmentsWidth([...primary.map((surface) => tabText(surface, counts)), overflowText]) <= available) {
			return { primary, overflow, overflowText }
		}
	}

	const overflowText = overflowTabText(activeSurface, surfaces)
	return { primary: [], overflow: surfaces, overflowText: overflowText.slice(0, available) }
}

export const workspaceTabSeparatorColumns = (
	counts: WorkspaceSurfaceCounts,
	surfaces: readonly WorkspaceSurface[] = workspaceSurfaces,
	width = Number.MAX_SAFE_INTEGER,
	activeSurface: WorkspaceSurface = surfaces[0] ?? "pullRequests",
) => {
	const layout = computeWorkspaceTabLayout(activeSurface, width, counts, surfaces)
	const texts = [...layout.primary.map((surface) => tabText(surface, counts)), ...(layout.overflowText ? [layout.overflowText] : [])]
	const columns: number[] = []
	let column = 0
	for (const text of texts) {
		column += text.length
		columns.push(column)
		column += 1
	}
	return columns
}

export const WorkspaceTabs = ({
	activeSurface,
	width,
	surfaces = workspaceSurfaces,
	counts = {},
	onSelect,
}: {
	activeSurface: WorkspaceSurface
	width: number
	surfaces?: readonly WorkspaceSurface[]
	counts?: WorkspaceSurfaceCounts
	onSelect: (surface: WorkspaceSurface) => void
}) => {
	const [hoveredSurface, setHoveredSurface] = useState<WorkspaceSurface | "overflow" | null>(null)
	const activeCountColor = mixHex(colors.separator, colors.accent, 0.45)
	const layout = computeWorkspaceTabLayout(activeSurface, width, counts, surfaces)
	const rendered = layout.primary.map((surface) => {
		const active = surface === activeSurface
		const label = workspaceSurfaceLabels[surface]
		const count = counts[surface]
		const text = tabText(surface, counts)
		return { surface, active, label, count, text }
	})
	const segmentCount = rendered.length + (layout.overflowText ? 1 : 0)
	const textWidth = rendered.reduce((sum, tab) => sum + tab.text.length, 0) + (layout.overflowText?.length ?? 0) + segmentCount
	const filler = Math.max(0, width - textWidth)
	const selectNextOverflow = () => {
		if (layout.overflow.length === 0) return
		const current = layout.overflow.indexOf(activeSurface)
		onSelect(layout.overflow[(current + 1) % layout.overflow.length]!)
	}

	return (
		<box width={width} height={1} flexDirection="row">
			{rendered.flatMap((tab, index) => [
				...(index > 0
					? [
							<box key={`separator-${tab.surface}`} width={1} height={1}>
								<text wrapMode="none" truncate fg={colors.separator}>
									│
								</text>
							</box>,
						]
					: []),
				<box
					key={tab.surface}
					width={tab.text.length}
					height={1}
					onMouseDown={() => onSelect(tab.surface)}
					onMouseOver={() => setHoveredSurface(tab.surface)}
					onMouseOut={() => setHoveredSurface((current) => (current === tab.surface ? null : current))}
				>
					<text wrapMode="none" truncate>
						<span> </span>
						<span
							fg={tab.active ? colors.accent : colors.muted}
							attributes={tab.active ? TextAttributes.BOLD : 0}
							{...(hoveredSurface === tab.surface ? { bg: rowHoverBackground() } : {})}
						>
							{tab.label}
						</span>
						{tab.count === undefined ? null : (
							<>
								<span {...(hoveredSurface === tab.surface ? { bg: rowHoverBackground() } : {})}> </span>
								<span fg={tab.active ? activeCountColor : colors.separator} {...(hoveredSurface === tab.surface ? { bg: rowHoverBackground() } : {})}>
									{tab.count}
								</span>
							</>
						)}
						<span> </span>
					</text>
				</box>,
			])}
			{layout.overflowText ? (
				<>
					{rendered.length > 0 ? (
						<box width={1} height={1}>
							<text wrapMode="none" truncate fg={colors.separator}>
								│
							</text>
						</box>
					) : null}
					<box
						width={layout.overflowText.length}
						height={1}
						onMouseDown={selectNextOverflow}
						onMouseOver={() => setHoveredSurface("overflow")}
						onMouseOut={() => setHoveredSurface((current) => (current === "overflow" ? null : current))}
					>
						<text
							wrapMode="none"
							truncate
							fg={layout.overflow.includes(activeSurface) ? colors.accent : colors.muted}
							attributes={layout.overflow.includes(activeSurface) ? TextAttributes.BOLD : 0}
							{...(hoveredSurface === "overflow" ? { bg: rowHoverBackground() } : {})}
						>
							{layout.overflowText}
						</text>
					</box>
				</>
			) : null}
			<box width={1} height={1}>
				<text wrapMode="none" truncate fg={colors.separator}>
					│
				</text>
			</box>
			{filler > 0 ? <TextLine width={filler}>{fitCell("", filler)}</TextLine> : null}
		</box>
	)
}

export const IssuesPlaceholder = ({ width, height, repository }: { width: number; height: number; repository: string | null }) => {
	const rowWidth = Math.max(1, width - 2)
	const context = repository ? repository : "No repository selected"
	const fillerRows = Math.max(0, height - 8)

	return (
		<box width={width} height={height} flexDirection="column" paddingLeft={1} paddingRight={1}>
			<TextLine width={rowWidth}>
				<span fg={colors.accent} attributes={TextAttributes.BOLD}>
					ISSUES
				</span>
			</TextLine>
			<TextLine width={rowWidth}>
				<span fg={colors.muted}>Project </span>
				<span fg={colors.text}>{context}</span>
			</TextLine>
			<box height={1} />
			<TextLine width={rowWidth}>
				<span fg={colors.text}>Issue list/detail will live here.</span>
			</TextLine>
			<TextLine width={rowWidth}>
				<span fg={colors.muted}>This keeps the new workspace shell visible while PRs stay fully usable.</span>
			</TextLine>
			<box height={1} />
			<TextLine width={rowWidth}>
				<span fg={colors.count}>1</span>
				<span fg={colors.muted}> pull requests </span>
				<span fg={colors.count}>2</span>
				<span fg={colors.muted}> issues </span>
				<span fg={colors.count}>tab</span>
				<span fg={colors.muted}> switch surface</span>
			</TextLine>
			{Array.from({ length: fillerRows }, (_, index) => (
				<box key={index} height={1} />
			))}
		</box>
	)
}
