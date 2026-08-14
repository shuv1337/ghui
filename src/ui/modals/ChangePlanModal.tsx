import { colors } from "../colors.js"
import { Filler, fitCell, HintRow, PlainLine, standardModalDims, StandardModal } from "../primitives.js"
import type { ChangePlanModalState } from "./types.js"

export const ChangePlanModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: ChangePlanModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const top = Math.max(0, Math.floor((bodyHeight - Math.max(1, state.lines.length)) / 2))
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={state.title}
			headerRight={{ text: state.running ? `${loadingIndicator} running` : "preview", pending: state.running }}
			subtitle={
				<PlainLine text={fitCell(state.kind === "workspace-handoff" ? "Current working copy stays put." : "Stored as ghui metadata only.", contentWidth)} fg={colors.muted} />
			}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "enter", label: state.confirmLabel, disabled: state.running },
						{ key: "esc", label: "cancel", disabled: state.running },
					]}
				/>
			}
		>
			{state.error ? <PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} /> : <Filler rows={top} prefix="change-plan" />}
			{state.lines.map((line) => (
				<PlainLine key={line} text={fitCell(line, contentWidth)} fg={colors.text} />
			))}
		</StandardModal>
	)
}
