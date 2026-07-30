import { context } from "@ghui/keymap"
import { countedVerticalBindings } from "./helpers.ts"

// The runs view has two sub-modes that share one keymap layer:
//   - list (A): no run selected — `enter` opens a run, ↑↓ walks runs
//   - detail (B): a run selected — `enter` expands a step log, ↑↓ walks job/step rows
// `inDetail` switches which sub-mode the shared keys act on.

export interface RunsViewCtx {
	readonly halfPage: number
	readonly inDetail: boolean
	readonly handleEscape: () => void // back from detail → list, or close runs view
	readonly moveSelection: (delta: number) => void
	readonly moveSelectionToBoundary: (boundary: "first" | "last") => void
	readonly openSelected: () => void // list: open run; detail: expand/collapse step log
	readonly nextFailure: () => void
	readonly previousFailure: () => void
	readonly refresh: () => void
	readonly openInBrowser: () => void
	readonly repositoryActions?: boolean
	readonly runCommandById?: (id: string, options?: { readonly notifyDisabled?: boolean }) => boolean
}

const Runs = context<RunsViewCtx>()

export const runsViewKeymap = Runs(
	{ id: "runs.escape", title: "Back / close runs", keys: ["escape"], run: (s) => s.handleEscape() },
	{ id: "runs.open", title: "Open run / expand log", keys: ["return", "right", "l"], run: (s) => s.openSelected() },

	{ id: "runs.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.moveSelection(-s.halfPage) },
	{ id: "runs.half-down", title: "Half page down", keys: ["pagedown", "ctrl+d"], run: (s) => s.moveSelection(s.halfPage) },

	...countedVerticalBindings<RunsViewCtx>((s, delta) => s.moveSelection(delta)),

	{ id: "runs.up", title: "Up", keys: ["up", "k"], run: (s) => s.moveSelection(-1) },
	{ id: "runs.down", title: "Down", keys: ["down", "j"], run: (s) => s.moveSelection(1) },

	{ id: "runs.next-failure", title: "Next failure", keys: ["n"], run: (s) => s.nextFailure() },
	{ id: "runs.previous-failure", title: "Previous failure", keys: ["p"], run: (s) => s.previousFailure() },

	{ id: "runs.first", title: "First", keys: ["g g"], run: (s) => s.moveSelectionToBoundary("first") },
	{ id: "runs.last", title: "Last", keys: ["shift+g"], run: (s) => s.moveSelectionToBoundary("last") },

	{ id: "runs.refresh", title: "Refresh runs", keys: ["r"], run: (s) => s.refresh() },
	{ id: "runs.open-browser", title: "Open in browser", keys: ["o"], run: (s) => s.openInBrowser() },
	{
		id: "actions.retry",
		title: "Retry workflow run",
		keys: ["shift+r"],
		when: (s) => s.repositoryActions === true,
		run: (s) => s.runCommandById?.("actions.retry", { notifyDisabled: true }),
	},
	{
		id: "actions.cancel",
		title: "Cancel workflow run",
		keys: ["x"],
		when: (s) => s.repositoryActions === true,
		run: (s) => s.runCommandById?.("actions.cancel", { notifyDisabled: true }),
	},
	{
		id: "actions.dispatch",
		title: "Dispatch workflow",
		keys: ["d"],
		when: (s) => s.repositoryActions === true,
		run: (s) => s.runCommandById?.("actions.dispatch", { notifyDisabled: true }),
	},
	{
		id: "actions.download-artifact",
		title: "Download workflow artifact",
		keys: ["a"],
		when: (s) => s.repositoryActions === true,
		run: (s) => s.runCommandById?.("actions.downloadArtifact", { notifyDisabled: true }),
	},
	{
		id: "actions.cycle-status-filter",
		title: "Cycle run status filter",
		keys: ["f"],
		when: (s) => s.repositoryActions === true,
		run: (s) => s.runCommandById?.("actions.cycleStatusFilter", { notifyDisabled: true }),
	},
	{
		id: "actions.cycle-workflow-filter",
		title: "Cycle workflow filter",
		keys: ["w"],
		when: (s) => s.repositoryActions === true,
		run: (s) => s.runCommandById?.("actions.cycleWorkflowFilter", { notifyDisabled: true }),
	},
	{
		id: "actions.search",
		title: "Search workflow runs",
		keys: ["/"],
		when: (s) => s.repositoryActions === true,
		run: (s) => s.runCommandById?.("filter.open", { notifyDisabled: true }),
	},
)
