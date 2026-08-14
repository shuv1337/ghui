import { TextAttributes } from "@opentui/core"
import { changeDisplayDescription, changeStateLabels, shortChangeId, shortCommitId, type JjChangeSummary, type WorkspaceSnapshot } from "../localDomain.js"
import type { LoadStatus } from "../domain.js"
import { colors } from "../ui/colors.js"
import { SplitPane } from "../ui/paneLayout.js"
import { fitCell, PlainLine, TextLine } from "../ui/primitives.js"

const graphGlyph = (index: number, length: number, isWorkingCopy: boolean): string => {
	if (isWorkingCopy) return "@"
	if (index === length - 1) return "└"
	return "│"
}

export const changeRowText = (change: JjChangeSummary, index: number, snapshot: WorkspaceSnapshot, width: number): string => {
	const glyph = graphGlyph(index, snapshot.stack.length, change.changeId === snapshot.workingCopy.changeId)
	const bookmarks = [...change.bookmarks, ...change.remoteBookmarks].join(" ")
	const states = changeStateLabels(change).join(" ")
	const body = [shortChangeId(change.changeId), shortCommitId(change.commitId), bookmarks, states, changeDisplayDescription(change)].filter((part) => part.length > 0).join("  ")
	return fitCell(`${glyph}  ${body}`, width)
}

export const ChangesSurface = ({
	snapshot,
	selectedIndex,
	status,
	error,
	isWideLayout,
	width,
	height,
	leftWidth,
	rightWidth,
	setSelectedIndex,
}: {
	readonly snapshot: WorkspaceSnapshot | null
	readonly selectedIndex: number
	readonly status: LoadStatus
	readonly error: string | null
	readonly isWideLayout: boolean
	readonly width: number
	readonly height: number
	readonly leftWidth: number
	readonly rightWidth: number
	readonly setSelectedIndex: (index: number) => void
}) => {
	if (status === "loading" && !snapshot) return <PlainLine text={fitCell(" Loading changes…", width)} fg={colors.muted} />
	if (status === "error" && !snapshot) return <PlainLine text={fitCell(` ${error ?? "Could not load local changes"}`, width)} fg={colors.error} />
	if (!snapshot || snapshot.stack.length === 0) return <PlainLine text={fitCell(" No local changes. Press r to retry.", width)} fg={colors.muted} />

	const selected = snapshot.stack[Math.max(0, Math.min(selectedIndex, snapshot.stack.length - 1))] ?? snapshot.workingCopy
	const list = <ChangeList snapshot={snapshot} selectedIndex={selectedIndex} width={isWideLayout ? leftWidth : width} height={height} onSelect={setSelectedIndex} />
	if (!isWideLayout) return list
	return <SplitPane height={height} leftWidth={leftWidth} rightWidth={rightWidth} left={list} right={<ChangeDetail change={selected} snapshot={snapshot} width={rightWidth} />} />
}

const ChangeList = ({
	snapshot,
	selectedIndex,
	width,
	height,
	onSelect,
}: {
	readonly snapshot: WorkspaceSnapshot
	readonly selectedIndex: number
	readonly width: number
	readonly height: number
	readonly onSelect: (index: number) => void
}) => {
	const visible = Math.max(1, height)
	const start = Math.min(Math.max(0, snapshot.stack.length - visible), Math.max(0, selectedIndex - visible + 1))
	return (
		<box width={width} height={height} flexDirection="column">
			{snapshot.stack.slice(start, start + visible).map((change, offset) => {
				const index = start + offset
				const selected = index === selectedIndex
				return (
					<TextLine key={change.changeId} width={width} bg={selected ? colors.selectedBg : undefined} onMouseDown={() => onSelect(index)}>
						<span fg={selected ? colors.selectedText : colors.text} attributes={selected ? TextAttributes.BOLD : 0}>
							{changeRowText(change, index, snapshot, width)}
						</span>
					</TextLine>
				)
			})}
		</box>
	)
}

const ChangeDetail = ({ change, snapshot, width }: { readonly change: JjChangeSummary; readonly snapshot: WorkspaceSnapshot; readonly width: number }) => {
	const lines = [
		`${shortChangeId(change.changeId)}  ${shortCommitId(change.commitId)}`,
		changeDisplayDescription(change),
		change.bookmarks.length > 0 ? `bookmarks ${change.bookmarks.join(" ")}` : null,
		change.remoteBookmarks.length > 0 ? `remote ${change.remoteBookmarks.join(" ")}` : null,
		changeStateLabels(change).length > 0 ? changeStateLabels(change).join(" · ") : "mutable local change",
		change.parentChangeIds.length > 1 ? "merge: multiple parents" : null,
		snapshot.capabilityReason,
	].filter((line): line is string => line !== null && line.length > 0)
	return (
		<box width={width} height="100%" flexDirection="column" paddingLeft={1}>
			{lines.map((line) => (
				<PlainLine key={line} text={fitCell(line, Math.max(1, width - 1))} fg={colors.muted} />
			))}
		</box>
	)
}
