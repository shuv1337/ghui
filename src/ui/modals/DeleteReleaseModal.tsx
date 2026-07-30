import { colors } from "../colors.js"
import { Filler, fitCell, HintRow, PlainLine, standardModalDims, StandardModal } from "../primitives.js"
import type { DeleteReleaseModalState } from "./types.js"

export const DeleteReleaseModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
}: {
	state: DeleteReleaseModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
	loadingIndicator: string
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const top = Math.max(0, Math.floor((bodyHeight - 2) / 2))
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={`Delete ${state.tagName}`}
			titleFg={colors.error}
			headerRight={{ text: state.running ? `${loadingIndicator} deleting` : "confirm", pending: state.running }}
			subtitle={<PlainLine text={fitCell("The release is deleted; its Git tag is preserved.", contentWidth)} fg={colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "enter", label: "delete release" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			{state.error ? (
				<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
			) : (
				<>
					<Filler rows={top} prefix="release-delete" />
					<PlainLine text={fitCell(state.name, contentWidth)} fg={colors.text} bold />
					<PlainLine text={fitCell(state.repository, contentWidth)} fg={colors.muted} />
				</>
			)}
		</StandardModal>
	)
}
