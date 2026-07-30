import { describe, expect, test } from "bun:test"
import { actionLogWindow } from "../src/ui/runs/logWindow.js"

describe("Action log windowing", () => {
	test("keeps large logs bounded to the visible viewport", () => {
		const text = Array.from({ length: 20_000 }, (_, index) => `line ${index}`).join("\n")
		const first = actionLogWindow(text, 0, 24)
		const middle = actionLogWindow(text, 10_000, 24)
		const end = actionLogWindow(text, Number.MAX_SAFE_INTEGER, 24)
		expect(first.lines).toHaveLength(24)
		expect(first.lines[0]).toBe("line 0")
		expect(middle.lines).toHaveLength(24)
		expect(middle.lines[0]).toBe("line 10000")
		expect(end.lines).toHaveLength(24)
		expect(end.lines.at(-1)).toBe("line 19999")
	})

	test("normalizes CRLF and clamps short logs", () => {
		expect(actionLogWindow("a\r\nb\r\nc", 9, 10)).toEqual({ lines: ["a", "b", "c"], scrollTop: 0, totalLines: 3 })
	})
})
