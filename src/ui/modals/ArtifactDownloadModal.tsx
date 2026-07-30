import { colors } from "../colors.js"
import { Divider, fitCell, HintRow, ModalFrame, PaddedRow, PlainLine, standardModalDims, TextLine } from "../primitives.js"
import type { ArtifactDownloadModalState } from "./types.js"

export const ArtifactDownloadModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: ArtifactDownloadModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { innerWidth, contentWidth } = standardModalDims(modalWidth, modalHeight)
	return (
		<ModalFrame left={offsetLeft} top={offsetTop} width={modalWidth} height={modalHeight} junctionRows={[1, modalHeight - 4]}>
			<PaddedRow>
				<PlainLine text={`Download artifact · run #${state.runId}`} fg={colors.accent} bold />
			</PaddedRow>
			<Divider width={innerWidth} />
			<box flexDirection="column" paddingLeft={1} paddingRight={1}>
				{state.loading ? <PlainLine text="Loading artifacts…" fg={colors.muted} /> : null}
				{!state.loading && state.artifacts.length === 0 ? <PlainLine text="No downloadable artifacts." fg={colors.muted} /> : null}
				{state.artifacts.map((artifact, index) => {
					const selected = state.focus === "artifact" && index === state.selectedIndex
					return (
						<TextLine key={artifact.id} bg={selected ? colors.selectedBg : undefined}>
							<span fg={artifact.expired ? colors.error : selected ? colors.selectedText : colors.text}>
								{selected ? "› " : "  "}
								{fitCell(artifact.name, contentWidth - 14)}
							</span>
							<span fg={colors.muted}>{`${Math.ceil(artifact.sizeInBytes / 1024)} KiB`}</span>
						</TextLine>
					)
				})}
				<TextLine bg={state.focus === "destination" ? colors.selectedBg : undefined}>
					<span fg={colors.muted}>Destination </span>
					<span fg={colors.text}>{fitCell(state.destination || "type a directory", contentWidth - 12)}</span>
				</TextLine>
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
						{ key: "tab", label: "focus" },
						{ key: "↑↓", label: "artifact" },
						{ key: "enter", label: state.running ? "downloading" : "download" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			</PaddedRow>
		</ModalFrame>
	)
}
