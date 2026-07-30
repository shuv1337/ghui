import { colors } from "../colors.js"
import { Filler, fitCell, HintRow, PlainLine, standardModalDims, StandardModal } from "../primitives.js"
import type { DeleteResourceModalState } from "./types.js"

export const DeleteResourceModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	readonly state: DeleteResourceModalState
	readonly modalWidth: number
	readonly modalHeight: number
	readonly offsetLeft: number
	readonly offsetTop: number
	readonly loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={`Delete ${state.kind}`}
			titleFg={colors.error}
			headerRight={{ text: state.running ? `${loadingIndicator} deleting` : "confirm", pending: state.running }}
			subtitle={<PlainLine text={fitCell("This mutation cannot be undone.", contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "enter", label: `delete ${state.kind}` },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			{state.error ? (
				<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
			) : (
				<>
					<Filler rows={Math.max(0, Math.floor((bodyHeight - 2) / 2))} prefix="resource-delete" />
					<PlainLine text={fitCell(state.title, contentWidth)} fg={colors.text} bold />
					<PlainLine text={fitCell(state.repository, contentWidth)} fg={colors.muted} />
				</>
			)}
		</StandardModal>
	)
}
