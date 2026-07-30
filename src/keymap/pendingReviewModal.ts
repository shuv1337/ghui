import { context } from "@ghui/keymap"

export interface PendingReviewModalCtx {
	readonly close: () => void
	readonly move: (delta: -1 | 1) => void
	readonly jump: () => void
	readonly edit: () => void
	readonly deleteComment: () => void
	readonly submit: () => void
	readonly discard: () => void
}

const Pending = context<PendingReviewModalCtx>()

export const pendingReviewModalKeymap = Pending(
	{ id: "review.pending.close", title: "Close pending review", keys: ["escape"], run: (s) => s.close() },
	{ id: "review.pending.up", title: "Previous queued comment", keys: ["k", "up"], run: (s) => s.move(-1) },
	{ id: "review.pending.down", title: "Next queued comment", keys: ["j", "down"], run: (s) => s.move(1) },
	{ id: "review.pending.jump", title: "Jump to queued comment", keys: ["return"], run: (s) => s.jump() },
	{ id: "review.pending.edit", title: "Edit queued comment", keys: ["e"], run: (s) => s.edit() },
	{ id: "review.pending.delete", title: "Delete queued comment", keys: ["x"], run: (s) => s.deleteComment() },
	{ id: "review.pending.submit", title: "Submit pending review", keys: ["shift+r"], run: (s) => s.submit() },
	{ id: "review.pending.discard", title: "Discard pending review", keys: ["shift+d"], run: (s) => s.discard() },
)
