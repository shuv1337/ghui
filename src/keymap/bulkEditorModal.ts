import { context } from "@ghui/keymap"
import type { BulkEditorModalState } from "../ui/modals/types.js"

export interface BulkEditorModalCtx {
	readonly state: BulkEditorModalState
	readonly closeOrCancel: () => void
	readonly moveAction: (delta: 1 | -1) => void
	readonly toggleFocus: () => void
	readonly submit: () => void
}

const BulkEditor = context<BulkEditorModalCtx>()

export const bulkEditorModalKeymap = BulkEditor(
	{ id: "bulk-editor.close", title: "Close or cancel bulk operation", keys: ["escape"], run: (state) => state.closeOrCancel() },
	{ id: "bulk-editor.previous-action", title: "Previous bulk action", keys: ["left", "h"], when: (state) => !state.state.running, run: (state) => state.moveAction(-1) },
	{ id: "bulk-editor.next-action", title: "Next bulk action", keys: ["right", "l"], when: (state) => !state.state.running, run: (state) => state.moveAction(1) },
	{ id: "bulk-editor.toggle-field", title: "Toggle bulk editor field", keys: ["tab", "shift+tab"], when: (state) => !state.state.running, run: (state) => state.toggleFocus() },
	{ id: "bulk-editor.submit", title: "Apply bulk operation", keys: ["return"], when: (state) => !state.state.running, run: (state) => state.submit() },
)
