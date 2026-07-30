import { context } from "@ghui/keymap"

export interface ActionsModalCtx {
	readonly mode: "runAction" | "dispatch" | "artifact"
	readonly running: boolean
	readonly close: () => void
	readonly confirm: () => void
	readonly moveDispatchFocus: (delta: -1 | 1) => void
	readonly cycleDispatchValue: (delta: -1 | 1) => void
	readonly toggleArtifactFocus: () => void
	readonly moveArtifactSelection: (delta: -1 | 1) => void
}

const ActionsModal = context<ActionsModalCtx>()

export const actionsModalKeymap = ActionsModal(
	{ id: "actions.modal.close", title: "Close Actions dialog", keys: ["escape"], when: (s) => !s.running, run: (s) => s.close() },
	{ id: "actions.modal.confirm", title: "Confirm Actions operation", keys: ["return"], when: (s) => !s.running, run: (s) => s.confirm() },
	{
		id: "actions.dispatch.previous-field",
		title: "Previous dispatch field",
		keys: ["up", "shift+tab"],
		when: (s) => s.mode === "dispatch" && !s.running,
		run: (s) => s.moveDispatchFocus(-1),
	},
	{
		id: "actions.dispatch.next-field",
		title: "Next dispatch field",
		keys: ["down", "tab"],
		when: (s) => s.mode === "dispatch" && !s.running,
		run: (s) => s.moveDispatchFocus(1),
	},
	{
		id: "actions.dispatch.previous-value",
		title: "Previous workflow or input value",
		keys: ["left"],
		when: (s) => s.mode === "dispatch" && !s.running,
		run: (s) => s.cycleDispatchValue(-1),
	},
	{
		id: "actions.dispatch.next-value",
		title: "Next workflow or input value",
		keys: ["right"],
		when: (s) => s.mode === "dispatch" && !s.running,
		run: (s) => s.cycleDispatchValue(1),
	},
	{
		id: "actions.artifact.toggle-focus",
		title: "Switch artifact field",
		keys: ["tab", "shift+tab"],
		when: (s) => s.mode === "artifact" && !s.running,
		run: (s) => s.toggleArtifactFocus(),
	},
	{
		id: "actions.artifact.previous",
		title: "Previous artifact",
		keys: ["up", "k"],
		when: (s) => s.mode === "artifact" && !s.running,
		run: (s) => s.moveArtifactSelection(-1),
	},
	{
		id: "actions.artifact.next",
		title: "Next artifact",
		keys: ["down", "j"],
		when: (s) => s.mode === "artifact" && !s.running,
		run: (s) => s.moveArtifactSelection(1),
	},
)
