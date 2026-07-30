import { TextAttributes } from "@opentui/core"
import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"
import type { ReleaseEditorField, ReleaseEditorModalState } from "./types.js"

const Field = ({ label, value, active, width }: { label: string; value: string; active: boolean; width: number }) => {
	const labelWidth = 12
	return (
		<TextLine width={width} bg={active ? colors.selectedBg : undefined}>
			<span fg={active ? colors.accent : colors.muted} attributes={active ? TextAttributes.BOLD : 0}>
				{fitCell(label, labelWidth)}
			</span>
			<span fg={active ? colors.selectedText : colors.text}>{fitCell(value || (active ? "│" : "—"), Math.max(1, width - labelWidth))}</span>
		</TextLine>
	)
}

const Toggle = ({ label, checked, active, width }: { label: string; checked: boolean; active: boolean; width: number }) => (
	<TextLine width={width} bg={active ? colors.selectedBg : undefined}>
		<span fg={active ? colors.accent : colors.muted} attributes={active ? TextAttributes.BOLD : 0}>
			{fitCell(label, 12)}
		</span>
		<span fg={checked ? colors.status.passing : colors.muted}>{checked ? "[x]" : "[ ]"}</span>
	</TextLine>
)

export const ReleaseEditorModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: ReleaseEditorModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { contentWidth } = standardModalDims(modalWidth, modalHeight)
	const active = (field: ReleaseEditorField) => state.focus === field
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={state.mode === "create" ? "Create release" : `Edit ${state.tagName}`}
			headerRight={{ text: state.running ? `${loadingIndicator} saving` : state.repository, pending: state.running }}
			subtitle={<PlainLine text={fitCell(state.error ?? "Release notes are sent to gh through stdin.", contentWidth)} fg={state.error ? colors.error : colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "tab", label: "next field" },
						{ key: "space", label: "toggle" },
						{ key: "enter", label: "save" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			<Field label="tag" value={state.tagName} active={active("tagName")} width={contentWidth} />
			<Field label="name" value={state.name} active={active("name")} width={contentWidth} />
			<Field label="notes" value={state.body.replaceAll("\n", " ↵ ")} active={active("body")} width={contentWidth} />
			<Field label="target" value={state.targetCommitish} active={active("targetCommitish")} width={contentWidth} />
			<Toggle label="draft" checked={state.isDraft} active={active("isDraft")} width={contentWidth} />
			<Toggle label="prerelease" checked={state.isPrerelease} active={active("isPrerelease")} width={contentWidth} />
		</StandardModal>
	)
}
