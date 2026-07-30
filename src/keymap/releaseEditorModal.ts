import { context } from "@ghui/keymap"
import type { ReleaseEditorModalState } from "../ui/modals/types.js"

export interface ReleaseEditorModalCtx {
	readonly state: ReleaseEditorModalState
	readonly close: () => void
	readonly moveFocus: (delta: 1 | -1) => void
	readonly toggleFocused: () => void
	readonly submit: () => void
}

const ReleaseEditor = context<ReleaseEditorModalCtx>()

export const releaseEditorModalKeymap = ReleaseEditor(
	{ id: "release-editor.cancel", title: "Cancel release editor", keys: ["escape"], when: (s) => !s.state.running, run: (s) => s.close() },
	{ id: "release-editor.next", title: "Next release field", keys: ["tab"], when: (s) => !s.state.running, run: (s) => s.moveFocus(1) },
	{ id: "release-editor.previous", title: "Previous release field", keys: ["shift+tab"], when: (s) => !s.state.running, run: (s) => s.moveFocus(-1) },
	{
		id: "release-editor.toggle",
		title: "Toggle release option",
		keys: ["space"],
		when: (s) => !s.state.running && (s.state.focus === "isDraft" || s.state.focus === "isPrerelease"),
		run: (s) => s.toggleFocused(),
	},
	{ id: "release-editor.submit", title: "Save release", keys: ["return"], when: (s) => !s.state.running, run: (s) => s.submit() },
)
