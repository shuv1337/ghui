import type { PendingReview } from "../../domain.js"
import { colors } from "../colors.js"
import { Divider, fitCell, HintRow, ModalFrame, PaddedRow, PlainLine, standardModalDims, TextLine } from "../primitives.js"
import type { PendingReviewModalState } from "./types.js"

export const PendingReviewModal = ({
	state,
	review,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: PendingReviewModalState
	review: PendingReview | null
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { innerWidth, contentWidth } = standardModalDims(modalWidth, modalHeight)
	const comments = review?.comments ?? []
	const selectedIndex = Math.max(0, Math.min(state.selectedIndex, comments.length - 1))
	const footerRows = state.error ? 3 : 2
	const bodyHeight = Math.max(1, modalHeight - 2 - 2 - footerRows)
	const start = Math.max(0, Math.min(selectedIndex - Math.floor(bodyHeight / 2), comments.length - bodyHeight))
	return (
		<ModalFrame left={offsetLeft} top={offsetTop} width={modalWidth} height={modalHeight} junctionRows={[1, modalHeight - footerRows - 2]}>
			<PaddedRow>
				<TextLine>
					<span fg={colors.accent}>Pending review</span>
					<span fg={colors.muted}>{` · ${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}</span>
				</TextLine>
			</PaddedRow>
			<Divider width={innerWidth} />
			<box height={bodyHeight} flexDirection="column" paddingLeft={1} paddingRight={1}>
				{comments.length === 0 ? (
					<PlainLine text="No queued comments." fg={colors.muted} />
				) : (
					comments.slice(start, start + bodyHeight).map((comment, visibleIndex) => {
						const index = start + visibleIndex
						const selected = index === selectedIndex
						const location = `${comment.path}:${comment.line}`
						const prefix = `${selected ? "›" : " "} ${index + 1}/${comments.length} ${location}  `
						return (
							<TextLine key={comment.id} bg={selected ? colors.selectedBg : undefined}>
								<span fg={selected ? colors.selectedText : colors.accent}>{fitCell(prefix, Math.min(contentWidth, Math.max(14, Math.floor(contentWidth * 0.46))))}</span>
								<span fg={selected ? colors.selectedText : colors.muted}>{fitCell(comment.body.replace(/\s+/g, " "), Math.max(1, contentWidth - prefix.length))}</span>
							</TextLine>
						)
					})
				)}
			</box>
			<Divider width={innerWidth} />
			{state.error ? (
				<PaddedRow>
					<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
				</PaddedRow>
			) : null}
			<PaddedRow>
				<HintRow
					items={
						state.confirmingDiscard
							? [
									{ key: "shift+d", label: "confirm discard" },
									{ key: "esc", label: "cancel" },
								]
							: [
									{ key: "↑↓", label: "select" },
									{ key: "enter", label: "jump" },
									{ key: "e", label: "edit" },
									{ key: "x", label: "delete" },
									{ key: "shift+r", label: "submit" },
									{ key: "shift+d", label: "discard" },
								]
					}
				/>
			</PaddedRow>
		</ModalFrame>
	)
}
