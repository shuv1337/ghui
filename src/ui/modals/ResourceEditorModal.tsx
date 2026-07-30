import { TextAttributes } from "@opentui/core"
import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"
import type { ResourceEditorField, ResourceEditorModalState } from "./types.js"

const Field = ({ label, value, active, width }: { readonly label: string; readonly value: string; readonly active: boolean; readonly width: number }) => (
	<TextLine width={width} bg={active ? colors.selectedBg : undefined}>
		<span fg={active ? colors.accent : colors.muted} attributes={active ? TextAttributes.BOLD : 0}>
			{fitCell(label, 13)}
		</span>
		<span fg={active ? colors.selectedText : colors.text}>{fitCell(value || (active ? "│" : "—"), Math.max(1, width - 13))}</span>
	</TextLine>
)

export const ResourceEditorModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	readonly state: ResourceEditorModalState
	readonly modalWidth: number
	readonly modalHeight: number
	readonly offsetLeft: number
	readonly offsetTop: number
	readonly loadingIndicator: string
}) => {
	const { contentWidth } = standardModalDims(modalWidth, modalHeight)
	const active = (field: ResourceEditorField) => state.focus === field
	const source = state.sourceBranches[state.sourceIndex]
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={`${state.mode === "create" ? "Create" : "Edit"} ${state.kind}`}
			headerRight={{ text: state.running ? `${loadingIndicator} saving` : state.repository, pending: state.running }}
			subtitle={
				<PlainLine
					text={fitCell(state.error ?? (state.kind === "branch" ? "Create from a selected repository ref." : "Due date uses YYYY-MM-DD."), contentWidth)}
					fg={state.error ? colors.error : colors.muted}
				/>
			}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "tab", label: "next" },
						{ key: "←/→", label: "change choice" },
						{ key: "enter", label: "save" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			{state.kind === "branch" ? (
				<>
					<Field label="name" value={state.branchName} active={active("name")} width={contentWidth} />
					<Field label="source" value={source ? `${source.name} · ${source.sha.slice(0, 8)}` : "No source branches"} active={active("source")} width={contentWidth} />
				</>
			) : (
				<>
					<Field label="title" value={state.title} active={active("title")} width={contentWidth} />
					<Field label="description" value={state.description.replaceAll("\n", " ↵ ")} active={active("description")} width={contentWidth} />
					<Field label="due" value={state.dueOn} active={active("dueOn")} width={contentWidth} />
					<Field label="state" value={state.state} active={active("state")} width={contentWidth} />
				</>
			)}
		</StandardModal>
	)
}
