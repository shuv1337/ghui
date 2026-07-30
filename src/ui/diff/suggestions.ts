import type { DiffCommentSide } from "../../domain.js"

export class InvalidSuggestionTargetError extends Error {}

export const suggestionBlock = (replacement: string, side: DiffCommentSide): string => {
	if (side !== "RIGHT") throw new InvalidSuggestionTargetError("GitHub suggestions can only target the new side of a diff.")
	const normalized = replacement.replace(/\r\n?/g, "\n").replace(/\n$/, "")
	if (normalized.includes("```")) throw new InvalidSuggestionTargetError("Suggestion text cannot contain a triple-backtick fence.")
	return `\`\`\`suggestion\n${normalized}\n\`\`\``
}
