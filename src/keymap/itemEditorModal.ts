import { context } from "@ghui/keymap"
import type { ItemEditorModalState } from "../ui/modals/types.js"

export interface ItemEditorModalCtx {
	readonly state: ItemEditorModalState
	readonly close: () => void
	readonly moveFocus: (delta: 1 | -1) => void
	readonly toggleDraft: () => void
	readonly submit: () => void
}

const ItemEditor = context<ItemEditorModalCtx>()

export const itemEditorModalKeymap = ItemEditor(
	{ id: "item-editor.cancel", title: "Cancel item editor", keys: ["escape"], when: (state) => !state.state.running, run: (state) => state.close() },
	{ id: "item-editor.next", title: "Next item field", keys: ["tab"], run: (state) => state.moveFocus(1) },
	{ id: "item-editor.previous", title: "Previous item field", keys: ["shift+tab"], run: (state) => state.moveFocus(-1) },
	{
		id: "item-editor.toggle-draft",
		title: "Toggle draft pull request",
		keys: ["space"],
		when: (state) => !state.state.running && state.state.focus === "draft",
		run: (state) => state.toggleDraft(),
	},
	{ id: "item-editor.submit", title: "Save item", keys: ["return"], run: (state) => state.submit() },
)
