import { colors } from "../colors.js"
import { Divider, HintRow, ModalFrame, PaddedRow, PlainLine, standardModalDims, TextLine } from "../primitives.js"
import type { RunActionModalState } from "./types.js"

export const RunActionModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: RunActionModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { innerWidth, contentWidth } = standardModalDims(modalWidth, modalHeight)
	const verb = state.action === "cancel" ? "Cancel" : state.failedOnly ? "Retry failed jobs in" : "Retry"
	return (
		<ModalFrame left={offsetLeft} top={offsetTop} width={modalWidth} height={modalHeight} junctionRows={[1, modalHeight - 4]}>
			<PaddedRow>
				<PlainLine text={`${verb} run #${state.runId}?`} fg={state.action === "cancel" ? colors.error : colors.accent} bold />
			</PaddedRow>
			<Divider width={innerWidth} />
			<PaddedRow>
				<PlainLine text={state.title} fg={colors.text} />
			</PaddedRow>
			<PaddedRow>
				<TextLine>
					<span fg={colors.muted}>{state.action === "cancel" ? "This stops the active workflow run." : "GitHub creates another attempt for this run."}</span>
				</TextLine>
			</PaddedRow>
			{state.error ? (
				<PaddedRow>
					<PlainLine text={state.error.slice(0, contentWidth)} fg={colors.error} />
				</PaddedRow>
			) : null}
			<box flexGrow={1} />
			<Divider width={innerWidth} />
			<PaddedRow>
				<HintRow
					items={[
						{ key: "enter", label: state.running ? "working" : "confirm" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			</PaddedRow>
		</ModalFrame>
	)
}
