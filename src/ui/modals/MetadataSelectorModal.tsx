import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"
import type { MetadataSelectorModalState } from "./types.js"

export const filteredMetadataOptions = (state: MetadataSelectorModalState) => {
	const query = state.query.trim().toLowerCase()
	return query ? state.options.filter((option) => `${option.label} ${option.description}`.toLowerCase().includes(query)) : state.options
}

export const MetadataSelectorModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
	onSelect,
	onToggle,
}: {
	readonly state: MetadataSelectorModalState
	readonly modalWidth: number
	readonly modalHeight: number
	readonly offsetLeft: number
	readonly offsetTop: number
	readonly loadingIndicator: string
	readonly onSelect: (index: number) => void
	readonly onToggle: (index?: number) => void
}) => {
	const { contentWidth, bodyHeight } = standardModalDims(modalWidth, modalHeight)
	const options = filteredMetadataOptions(state)
	const rows = Math.max(1, bodyHeight - 1)
	const start = Math.max(0, Math.min(state.selectedIndex - rows + 1, Math.max(0, options.length - rows)))
	const title = state.kind === "base" ? "Choose base branch" : `Manage ${state.kind}`
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={title}
			headerRight={{ text: state.loading || state.running ? `${loadingIndicator} loading` : `${options.length} options`, pending: state.loading || state.running }}
			subtitle={<PlainLine text={fitCell(state.error ?? `Search: ${state.query || "type to filter"}`, contentWidth)} fg={state.error ? colors.error : colors.muted} />}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "↑↓", label: "select" },
						{ key: "enter", label: state.kind === "assignees" || state.kind === "reviewers" ? "toggle" : "choose" },
						{ key: "esc", label: "close" },
					]}
				/>
			}
		>
			{state.loading ? (
				<PlainLine text={`${loadingIndicator} Loading ${state.kind}…`} fg={colors.muted} />
			) : options.length === 0 ? (
				<PlainLine text={state.query ? "No matching options." : "No options available."} fg={colors.muted} />
			) : (
				options.slice(start, start + rows).map((option, visibleIndex) => {
					const index = start + visibleIndex
					const selected = index === state.selectedIndex
					const checked = state.selectedIds.includes(option.id)
					return (
						<TextLine
							key={option.id}
							width={contentWidth}
							bg={selected ? colors.selectedBg : undefined}
							onMouseDown={() => {
								onSelect(index)
								onToggle(index)
							}}
						>
							<span fg={checked ? colors.status.passing : colors.muted}>{checked ? "[x] " : "[ ] "}</span>
							<span fg={selected ? colors.selectedText : colors.text}>{fitCell(option.label, Math.max(8, Math.floor(contentWidth * 0.45)))}</span>
							<span fg={colors.muted}>{fitCell(option.description, Math.max(1, contentWidth - Math.max(8, Math.floor(contentWidth * 0.45)) - 4))}</span>
						</TextLine>
					)
				})
			)}
		</StandardModal>
	)
}
