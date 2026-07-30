import { colors } from "../colors.js"
import { bulkItemActions, type BulkEditorModalState, type BulkItemAction } from "./types.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"

const actionLabels = {
	addLabel: "add label",
	removeLabel: "remove label",
	addAssignee: "add assignee",
	removeAssignee: "remove assignee",
	milestone: "set milestone",
	close: "close items",
	reopen: "reopen items",
} as const satisfies Record<BulkItemAction, string>

export const BulkEditorModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	readonly state: BulkEditorModalState
	readonly modalWidth: number
	readonly modalHeight: number
	readonly offsetLeft: number
	readonly offsetTop: number
	readonly loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const needsValue = state.action !== "close" && state.action !== "reopen"
	const destructive = state.action === "close"
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={`Bulk edit ${state.targets.length} items`}
			titleFg={destructive ? colors.error : colors.accent}
			headerRight={{ text: state.running ? `${loadingIndicator} applying` : state.confirming ? "confirm again" : "bounded ×3", pending: state.running }}
			subtitle={<PlainLine text={fitCell(state.error ?? state.summary ?? "Results retain stable selection order.", contentWidth)} fg={state.error ? colors.error : colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "←→", label: "action" },
						{ key: "tab", label: "field" },
						{ key: "enter", label: state.confirming ? "confirm" : "apply" },
						{ key: "esc", label: state.running ? "cancel remaining" : "close" },
					]}
				/>
			}
		>
			<TextLine width={contentWidth} bg={state.focus === "action" ? colors.selectedBg : undefined}>
				<span fg={colors.muted}>{fitCell("action", 12)}</span>
				<span fg={state.focus === "action" ? colors.selectedText : colors.text}>{actionLabels[state.action]}</span>
			</TextLine>
			{needsValue ? (
				<TextLine width={contentWidth} bg={state.focus === "value" ? colors.selectedBg : undefined}>
					<span fg={colors.muted}>{fitCell("value", 12)}</span>
					<span fg={state.focus === "value" ? colors.selectedText : colors.text}>
						{fitCell(state.value || (state.focus === "value" ? "│" : "—"), Math.max(1, contentWidth - 12))}
					</span>
				</TextLine>
			) : null}
			{state.resultLines.length > 0
				? state.resultLines
						.slice(0, Math.max(1, bodyHeight - 2))
						.map((line, index) => (
							<PlainLine
								key={`${index}:${line}`}
								text={fitCell(line, contentWidth)}
								fg={line.startsWith("✓") ? colors.status.passing : line.startsWith("!") ? colors.error : colors.muted}
							/>
						))
				: state.targets
						.slice(0, Math.max(1, bodyHeight - 2))
						.map((target) => (
							<PlainLine key={target.url} text={fitCell(`${target.kind === "issue" ? "I" : "P"} #${target.number} ${target.title}`, contentWidth)} fg={colors.muted} />
						))}
			{state.targets.length === 0 ? <PlainLine text={`Actions: ${bulkItemActions.length}`} fg={colors.muted} /> : null}
		</StandardModal>
	)
}
