import { context } from "@ghui/keymap"

export interface ChangePlanModalCtx {
	readonly running: boolean
	readonly close: () => void
	readonly confirm: () => void
}

const ChangePlan = context<ChangePlanModalCtx>()

export const changePlanModalKeymap = ChangePlan(
	{ id: "change-plan.cancel", title: "Cancel change plan", keys: ["escape"], when: (s) => !s.running, run: (s) => s.close() },
	{ id: "change-plan.confirm", title: "Confirm change plan", keys: ["return"], when: (s) => !s.running, run: (s) => s.confirm() },
)
