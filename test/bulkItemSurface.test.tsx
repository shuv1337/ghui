import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"

process.env.GHUI_MOCK_PR_COUNT = "24"
process.env.GHUI_MOCK_REPO_COUNT = "4"
process.env.GHUI_MOCK_FIXTURE_PATH = "/tmp/ghui-bulk-item-test-no-fixture.json"
process.env.GHUI_MOCK_WORKSPACE_PREFERENCES_PATH = "off"
process.env.GHUI_PR_PAGE_SIZE = "100"

const loadApp = async () => {
	const { createTestRenderer } = await import("@opentui/core/testing")
	const { createRoot } = await import("@opentui/react")
	const { RegistryProvider } = await import("@effect/atom-react")
	const { App } = await import("../src/App.tsx")
	return { createTestRenderer, createRoot, RegistryProvider, App }
}

let cached: Awaited<ReturnType<typeof loadApp>>

beforeAll(async () => {
	// @ts-expect-error -- React's act environment flag is intentionally global.
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
	cached = await loadApp()
})

const setup = async () => {
	const rendererSetup = await cached.createTestRenderer({ width: 100, height: 24 })
	const root = cached.createRoot(rendererSetup.renderer)
	act(() => {
		root.render(
			<cached.RegistryProvider>
				<cached.App />
			</cached.RegistryProvider>,
		)
	})
	return { ...rendererSetup, root }
}

const step = async (app: Awaited<ReturnType<typeof setup>>) => {
	await act(async () => {
		await app.renderOnce()
		await Bun.sleep(1)
	})
}

const settle = async (app: Awaited<ReturnType<typeof setup>>, predicate: (frame: string) => boolean, attempts = 100) => {
	for (let index = 0; index < attempts; index++) {
		await step(app)
		if (predicate(app.captureCharFrame())) return true
	}
	return false
}

const press = async (app: Awaited<ReturnType<typeof setup>>, name: string) => {
	act(() => {
		if (name === "return") app.mockInput.pressEnter()
		else if (name === "escape") app.mockInput.pressEscape()
		else if (name === "tab") app.mockInput.pressTab()
		else if (name === "space") app.mockInput.pressKey(" ")
		else if (name === "down" || name === "up" || name === "left" || name === "right") app.mockInput.pressArrow(name)
		else app.mockInput.pressKey(name)
	})
	await step(app)
}

const type = async (app: Awaited<ReturnType<typeof setup>>, text: string) => {
	await act(async () => app.mockInput.typeText(text))
	await step(app)
}

describe("bulk item operations", () => {
	test("multi-selects, applies metadata in stable order, and double-confirms close", async () => {
		const app = await setup()
		expect(await settle(app, (frame) => frame.includes("PULL REQUESTS"))).toBe(true)

		await press(app, "1")
		expect(await settle(app, (frame) => frame.includes("Mock repository mock-org/repo-0")), app.captureCharFrame()).toBe(true)
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("RELEASES")), app.captureCharFrame()).toBe(true)
		await press(app, "2")
		expect(await settle(app, (frame) => frame.includes("fix: custom provider dialog")), app.captureCharFrame()).toBe(true)

		await act(async () => app.mockMouse.click(3, 4, 0, { modifiers: { ctrl: true } }))
		await step(app)
		expect(app.captureCharFrame()).toContain("1 item selected")
		expect(app.captureCharFrame()).toContain("◆")
		await press(app, "down")
		await press(app, "space")
		expect(app.captureCharFrame()).toContain("2 items selected")
		await press(app, "b")
		expect(await settle(app, (frame) => frame.includes("Bulk edit 2 items")), app.captureCharFrame()).toBe(true)
		await press(app, "tab")
		await type(app, "parity-bulk")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("2 succeeded · 0 failed · 0 skipped · 0 retryable")), app.captureCharFrame()).toBe(true)
		await press(app, "escape")
		expect(await settle(app, (frame) => frame.includes("ISSUES") && !frame.includes("Bulk edit")), app.captureCharFrame()).toBe(true)

		await press(app, "space")
		await press(app, "b")
		expect(await settle(app, (frame) => frame.includes("Bulk edit 1 items")), app.captureCharFrame()).toBe(true)
		for (let index = 0; index < 5; index++) await press(app, "right")
		expect(app.captureCharFrame()).toContain("close items")
		await press(app, "return")
		expect(app.captureCharFrame()).toContain("Press Enter again to close all eligible selected items.")
		expect(app.captureCharFrame()).toContain("confirm again")
		await press(app, "escape")

		act(() => app.root.unmount())
		app.renderer.destroy()
	})
})
