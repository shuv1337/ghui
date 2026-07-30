import type { CommentModalCtx } from "../commentModal.ts"

export interface BuildCommentModalCtxInput {
	readonly closeActiveModal: () => void
	readonly toggleCommentSubmitMode: () => void
	readonly toggleCommentContentKind: () => void
}

export const buildCommentModalCtx = ({ closeActiveModal, toggleCommentSubmitMode, toggleCommentContentKind }: BuildCommentModalCtxInput): CommentModalCtx => ({
	closeModal: closeActiveModal,
	toggleSubmitMode: toggleCommentSubmitMode,
	toggleContentKind: toggleCommentContentKind,
})
