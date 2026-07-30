import { colors } from "../colors.js"
import { Divider, fitCell, HintRow, ModalFrame, PaddedRow, PlainLine, standardModalDims, TextLine } from "../primitives.js"
import type { WorkflowDispatchModalState } from "./types.js"

export const WorkflowDispatchModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: WorkflowDispatchModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { innerWidth, contentWidth } = standardModalDims(modalWidth, modalHeight)
	const workflow = state.workflows[state.workflowIndex]
	const rows = [
		{ label: "Workflow", value: workflow?.name ?? (state.workflows.length === 0 ? "No dispatchable workflows" : "") },
		{ label: "Ref", value: state.ref },
		...state.inputs.map((input) => ({
			label: `${input.name}${input.required ? " *" : ""}`,
			value: String(state.values[input.name] ?? input.defaultValue ?? ""),
		})),
	]
	return (
		<ModalFrame left={offsetLeft} top={offsetTop} width={modalWidth} height={modalHeight} junctionRows={[1, modalHeight - 4]}>
			<PaddedRow>
				<PlainLine text="Dispatch workflow" fg={colors.accent} bold />
			</PaddedRow>
			<Divider width={innerWidth} />
			<box flexDirection="column" paddingLeft={1} paddingRight={1}>
				{rows.map((row, index) => {
					const selected = index === state.focusIndex
					return (
						<TextLine key={`${row.label}-${index}`} bg={selected ? colors.selectedBg : undefined}>
							<span fg={selected ? colors.selectedText : colors.muted}>{fitCell(row.label, Math.min(22, Math.floor(contentWidth * 0.35)))}</span>
							<span fg={selected ? colors.selectedText : colors.text}> {fitCell(row.value, Math.max(1, contentWidth - 23))}</span>
						</TextLine>
					)
				})}
				{state.loadingInputs ? <PlainLine text="Loading workflow inputs…" fg={colors.muted} /> : null}
			</box>
			{state.error ? (
				<PaddedRow>
					<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
				</PaddedRow>
			) : null}
			<box flexGrow={1} />
			<Divider width={innerWidth} />
			<PaddedRow>
				<HintRow
					items={[
						{ key: "↑↓", label: "field" },
						{ key: "←→", label: "choice" },
						{ key: "enter", label: state.running ? "dispatching" : "dispatch" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			</PaddedRow>
		</ModalFrame>
	)
}
