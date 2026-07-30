import { describe, expect, test } from "bun:test"
import type { MouseEvent } from "@opentui/core"
import { useKeyboard, usePaste } from "@opentui/react"
import { useRef, useState } from "react"
import { createParityHarness, type ParityEffectRecorder, parityTerminalSizes, withNetworkDisabled } from "./e2e/parityHarness.tsx"

// @ts-expect-error -- React's act environment flag is intentionally global.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const Probe = ({ recordEffect }: { readonly recordEffect: ParityEffectRecorder }) => {
	const [typed, setTyped] = useState("")
	const firstStroke = useRef<string | null>(null)

	useKeyboard((event) => {
		if (event.name === "x") recordEffect("command.probe.keyboard")
		if (event.name === "g") {
			if (firstStroke.current === "g") {
				recordEffect("command.probe.sequence")
				firstStroke.current = null
			} else {
				firstStroke.current = "g"
			}
		} else if (event.name.length === 1) {
			setTyped((current) => `${current}${event.name}`)
		}
	})
	usePaste((event) => recordEffect("command.probe.paste", new TextDecoder().decode(event.bytes)))

	const mouseScroll = (event: MouseEvent) => {
		if (event.type === "scroll") recordEffect("command.probe.scroll", event.scroll?.direction)
	}

	return (
		<box width="100%" height="100%" flexDirection="column" onMouseDown={() => recordEffect("command.probe.mouse")} onMouseScroll={mouseScroll}>
			<text>PARITY HARNESS READY</text>
			<text>{`typed:${typed}`}</text>
		</box>
	)
}

describe("OpenTUI parity harness", () => {
	test("renders deterministic bounded frames at every contract size without network", async () => {
		await withNetworkDisabled(async () => {
			for (const size of parityTerminalSizes) {
				const harness = await createParityHarness({
					size,
					render: (recordEffect) => <Probe recordEffect={recordEffect} />,
				})
				expect(harness.frame()).toContain("PARITY HARNESS READY")
				expect(harness.spans()).toMatchObject({ cols: size.width, rows: size.height })
				harness.destroy()
			}
		})
	})

	test("dispatches keys, sequences, typed text, paste, mouse, scroll, and resize", async () => {
		const harness = await createParityHarness({
			size: { width: 100, height: 24 },
			render: (recordEffect) => <Probe recordEffect={recordEffect} />,
		})

		await harness.pressKey({ name: "x" })
		await harness.pressSequence([{ name: "g" }, { name: "g" }])
		await harness.typeText("ab")
		await harness.pasteText("fixture paste")
		await harness.click(1, 0)
		await harness.scroll(1, 1, "down")
		await harness.resize({ width: 60, height: 16 })

		expect(harness.frame()).toContain("typed:xab")
		expect(harness.spans()).toMatchObject({ cols: 60, rows: 16 })
		expect(harness.requireEffect("command.probe.keyboard").id).toBe("command.probe.keyboard")
		expect(harness.effectCount("command.probe.sequence")).toBe(1)
		expect(harness.requireEffect("command.probe.paste").payload).toBe("fixture paste")
		expect(harness.effectCount("command.probe.mouse")).toBeGreaterThanOrEqual(1)
		expect(harness.effectCount("command.probe.scroll")).toBeGreaterThanOrEqual(1)
		harness.destroy()
	})

	test("fails on missing named command effects rather than accepting visible UI alone", async () => {
		const harness = await createParityHarness({
			size: { width: 60, height: 16 },
			render: (recordEffect) => <Probe recordEffect={recordEffect} />,
		})
		expect(harness.frame()).toContain("PARITY HARNESS READY")
		expect(() => harness.requireEffect("command.never-ran")).toThrow("Expected parity effect command.never-ran")
		harness.destroy()
	})
})
