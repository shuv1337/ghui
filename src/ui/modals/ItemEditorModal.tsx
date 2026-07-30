import { TextAttributes } from "@opentui/core"
import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"
import type { ItemEditorField, ItemEditorModalState } from "./types.js"

const Field = ({ label, value, active, width }: { readonly label: string; readonly value: string; readonly active: boolean; readonly width: number }) => (
	<TextLine width={width} bg={active ? colors.selectedBg : undefined}>
		<span fg={active ? colors.accent : colors.muted} attributes={active ? TextAttributes.BOLD : 0}>
			{fitCell(label, 12)}
		</span>
		<span fg={active ? colors.selectedText : colors.text}>{fitCell(value || (active ? "│" : "—"), Math.max(1, width - 12))}</span>
	</TextLine>
)

export const ItemEditorModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	readonly state: ItemEditorModalState
	readonly modalWidth: number
	readonly modalHeight: number
	readonly offsetLeft: number
	readonly offsetTop: number
	readonly loadingIndicator: string
}) => {
	const { contentWidth } = standardModalDims(modalWidth, modalHeight)
	const active = (field: ItemEditorField) => state.focus === field
	const kind = state.kind === "issue" ? "issue" : "pull request"
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={`${state.mode === "create" ? "Create" : "Edit"} ${kind}`}
			headerRight={{ text: state.running ? `${loadingIndicator} saving` : state.repository, pending: state.running }}
			subtitle={<PlainLine text={fitCell(state.error ?? "Body text is sent to gh through stdin.", contentWidth)} fg={state.error ? colors.error : colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "tab", label: "next" },
						{ key: "space", label: "toggle draft" },
						{ key: "enter", label: "save" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			<Field label="title" value={state.title} active={active("title")} width={contentWidth} />
			<Field label="body" value={state.body.replaceAll("\n", " ↵ ")} active={active("body")} width={contentWidth} />
			{state.kind === "pullRequest" ? <Field label="base" value={state.base} active={active("base")} width={contentWidth} /> : null}
			{state.kind === "pullRequest" && state.mode === "create" ? <Field label="head" value={state.head} active={active("head")} width={contentWidth} /> : null}
			{state.kind === "pullRequest" && state.mode === "create" ? <Field label="draft" value={state.draft ? "[x]" : "[ ]"} active={active("draft")} width={contentWidth} /> : null}
			<Field label="labels" value={state.labels} active={active("labels")} width={contentWidth} />
			<Field label="assignees" value={state.assignees} active={active("assignees")} width={contentWidth} />
			{state.kind === "pullRequest" ? <Field label="reviewers" value={state.reviewers} active={active("reviewers")} width={contentWidth} /> : null}
			<Field label="milestone" value={state.milestone} active={active("milestone")} width={contentWidth} />
		</StandardModal>
	)
}
