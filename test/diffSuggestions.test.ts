import { describe, expect, test } from "bun:test"
import { InvalidSuggestionTargetError, suggestionBlock } from "../src/ui/diff/suggestions.ts"

describe("diff suggestions", () => {
	test("serializes single and multi-line replacements exactly", () => {
		expect(suggestionBlock("const answer = 42", "RIGHT")).toBe("```suggestion\nconst answer = 42\n```")
		expect(suggestionBlock("first\r\nsecond\r\n", "RIGHT")).toBe("```suggestion\nfirst\nsecond\n```")
	})

	test("supports empty replacement and trims only one terminal newline", () => {
		expect(suggestionBlock("", "RIGHT")).toBe("```suggestion\n\n```")
		expect(suggestionBlock("first\nsecond\n\n", "RIGHT")).toBe("```suggestion\nfirst\nsecond\n\n```")
	})

	test("rejects deleted-side targets and nested fences before mutation", () => {
		expect(() => suggestionBlock("replacement", "LEFT")).toThrow(InvalidSuggestionTargetError)
		expect(() => suggestionBlock("before\n```\nafter", "RIGHT")).toThrow("triple-backtick")
	})
})
