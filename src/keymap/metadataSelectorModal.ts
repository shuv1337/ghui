import { context } from "@ghui/keymap"

export interface MetadataSelectorModalCtx {
	readonly close: () => void
	readonly move: (delta: 1 | -1) => void
	readonly toggle: () => void
}

const MetadataSelector = context<MetadataSelectorModalCtx>()

export const metadataSelectorModalKeymap = MetadataSelector(
	{ id: "metadata-selector.cancel", title: "Close metadata selector", keys: ["escape"], run: (state) => state.close() },
	{ id: "metadata-selector.up", title: "Previous metadata option", keys: ["up", "k"], run: (state) => state.move(-1) },
	{ id: "metadata-selector.down", title: "Next metadata option", keys: ["down", "j"], run: (state) => state.move(1) },
	{ id: "metadata-selector.toggle", title: "Apply metadata option", keys: ["return"], run: (state) => state.toggle() },
)
