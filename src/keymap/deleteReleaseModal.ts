import { context } from "@ghui/keymap"

export interface DeleteReleaseModalCtx {
	readonly running: boolean
	readonly close: () => void
	readonly confirm: () => void
}

const DeleteRelease = context<DeleteReleaseModalCtx>()

export const deleteReleaseModalKeymap = DeleteRelease(
	{ id: "release-delete.cancel", title: "Cancel release deletion", keys: ["escape"], when: (s) => !s.running, run: (s) => s.close() },
	{ id: "release-delete.confirm", title: "Confirm release deletion", keys: ["return"], when: (s) => !s.running, run: (s) => s.confirm() },
)
