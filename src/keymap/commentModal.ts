import { context } from "@ghui/keymap"

export interface CommentModalCtx {
	readonly closeModal: () => void
	readonly toggleSubmitMode: () => void
	readonly toggleContentKind: () => void
}

const Comment = context<CommentModalCtx>()

export const commentModalKeymap = Comment(
	{ id: "comment.escape", title: "Cancel", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "comment.toggle-submit-mode", title: "Toggle post / queue", keys: ["ctrl+q"], run: (s) => s.toggleSubmitMode() },
	{ id: "comment.toggle-content-kind", title: "Toggle comment / suggestion", keys: ["ctrl+g"], run: (s) => s.toggleContentKind() },
)
