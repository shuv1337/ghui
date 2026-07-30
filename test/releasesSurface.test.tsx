import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"

process.env.GHUI_MOCK_PR_COUNT = "24"
process.env.GHUI_MOCK_REPO_COUNT = "4"
process.env.GHUI_MOCK_FIXTURE_PATH = "/tmp/ghui-release-test-no-fixture.json"
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

const step = async (setup: Awaited<ReturnType<typeof setup>>) => {
	await act(async () => {
		await setup.renderOnce()
		await new Promise<void>((resolve) => setTimeout(resolve, 1))
	})
}

const settle = async (setup: Awaited<ReturnType<typeof setup>>, predicate: (frame: string) => boolean, attempts = 100) => {
	for (let index = 0; index < attempts; index++) {
		await step(setup)
		if (predicate(setup.captureCharFrame())) return true
	}
	return false
}

const setup = async (width: number, height: number) => {
	const rendererSetup = await cached.createTestRenderer({ width, height })
	const root = cached.createRoot(rendererSetup.renderer)
	act(() => {
		root.render(
			<cached.RegistryProvider>
				<cached.App />
			</cached.RegistryProvider>,
		)
	})
	await step({ ...rendererSetup, root })
	return { ...rendererSetup, root }
}

const press = async (setup: Awaited<ReturnType<typeof setup>>, name: string, modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean }) => {
	act(() => {
		if (name === "return") setup.mockInput.pressEnter(modifiers)
		else if (name === "escape") setup.mockInput.pressEscape(modifiers)
		else if (name === "tab") setup.mockInput.pressTab(modifiers)
		else if (name === "space") setup.mockInput.pressKey(" ", modifiers)
		else if (name === "backspace") setup.mockInput.pressBackspace(modifiers)
		else setup.mockInput.pressKey(name, modifiers)
	})
	await step(setup)
}

const type = async (setup: Awaited<ReturnType<typeof setup>>, text: string) => {
	await act(async () => setup.mockInput.typeText(text))
	await step(setup)
}

describe("Releases Surface", () => {
	test("supports repository navigation, create/edit/delete guards, mouse, and resize", async () => {
		const app = await setup(100, 24)
		expect(await settle(app, (frame) => frame.includes("PULL REQUESTS"))).toBe(true)

		await press(app, "1")
		expect(await settle(app, (frame) => frame.includes("Mock repository mock-org/repo-0")), app.captureCharFrame()).toBe(true)
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("RELEASES")), app.captureCharFrame()).toBe(true)
		await press(app, "3")
		expect(await settle(app, (frame) => frame.includes("Deterministic mock release notes"))).toBe(true)
		expect(app.captureCharFrame()).toContain("v1.0.0")

		await press(app, "c")
		expect(app.captureCharFrame()).toContain("Create release")
		await type(app, "v9.9.9")
		await press(app, "tab")
		await type(app, "Parity release")
		await press(app, "tab")
		await act(async () => app.mockInput.pasteBracketedText("Release notes from deterministic paste"))
		await step(app)
		await press(app, "tab")
		await type(app, "main")
		await press(app, "tab")
		await press(app, "space")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("v9.9.9"))).toBe(true)
		expect(app.captureCharFrame()).toContain("DRAFT")

		await press(app, "e")
		expect(app.captureCharFrame()).toContain("Edit v9.9.9")
		await press(app, "escape")
		expect(await settle(app, (frame) => !frame.includes("Edit v9.9.9")), app.captureCharFrame()).toBe(true)

		await press(app, "x")
		expect(app.captureCharFrame()).toContain("The release is deleted; its Git tag is preserved.")
		await press(app, "escape")
		expect(app.captureCharFrame()).toContain("v9.9.9")

		await press(app, "x")
		await press(app, "return")
		expect(await settle(app, (frame) => !frame.includes("\n v9.9.9")), app.captureCharFrame()).toBe(true)

		act(() => app.resize(60, 16))
		await step(app)
		expect(app.captureSpans()).toMatchObject({ cols: 60, rows: 16 })
		expect(app.captureCharFrame()).toContain("RELEASES")

		await act(async () => app.mockMouse.click(3, 4))
		await step(app)
		expect(app.captureCharFrame()).toContain("Release")

		act(() => app.root.unmount())
		app.renderer.destroy()
	})
})
