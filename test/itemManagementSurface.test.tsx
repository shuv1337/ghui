import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"

process.env.GHUI_MOCK_PR_COUNT = "24"
process.env.GHUI_MOCK_REPO_COUNT = "4"
process.env.GHUI_MOCK_FIXTURE_PATH = "/tmp/ghui-item-management-test-no-fixture.json"
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

const press = async (app: Awaited<ReturnType<typeof setup>>, name: string, modifiers?: { readonly shift?: boolean; readonly ctrl?: boolean }) => {
	act(() => {
		if (name === "return") app.mockInput.pressEnter(modifiers)
		else if (name === "escape") app.mockInput.pressEscape(modifiers)
		else if (name === "tab") app.mockInput.pressTab(modifiers)
		else if (name === "space") app.mockInput.pressKey(" ", modifiers)
		else if (name === "down" || name === "up" || name === "left" || name === "right") app.mockInput.pressArrow(name)
		else app.mockInput.pressKey(name, modifiers)
	})
	await step(app)
}

const type = async (app: Awaited<ReturnType<typeof setup>>, text: string) => {
	await act(async () => app.mockInput.typeText(text))
	await step(app)
}

describe("Issue and Pull Request management", () => {
	test("creates and edits through the shared editor and confirms issue deletion", async () => {
		const app = await setup()
		expect(await settle(app, (frame) => frame.includes("PULL REQUESTS"))).toBe(true)

		await press(app, "1")
		expect(await settle(app, (frame) => frame.includes("Mock repository mock-org/repo-0"))).toBe(true)
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("RELEASES"))).toBe(true)

		await press(app, "n")
		expect(app.captureCharFrame()).toContain("Create pull request")
		await type(app, "Parity pull request")
		await press(app, "tab")
		await act(async () => app.mockInput.pasteBracketedText("Private PR body\nsecond line"))
		await step(app)
		await press(app, "tab")
		await type(app, "main")
		await press(app, "tab")
		await type(app, "parity/m2")
		await press(app, "tab")
		await press(app, "space")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Created pull request"))).toBe(true)
		await press(app, "r")
		expect(await settle(app, (frame) => frame.includes("Refreshed")), app.captureCharFrame()).toBe(true)

		await press(app, "e", { shift: true })
		expect(app.captureCharFrame()).toContain("Edit pull request")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Updated pull request"))).toBe(true)

		await press(app, "g")
		await press(app, "v")
		expect(await settle(app, (frame) => frame.includes("Manage reviewers")), app.captureCharFrame()).toBe(true)
		await type(app, "mock-reviewer")
		expect(app.captureCharFrame()).toContain("@mock-reviewer")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("[x] @mock-reviewer"))).toBe(true)
		await press(app, "p", { ctrl: true })
		expect(app.captureCharFrame()).toContain("Commands")
		await type(app, "Show Issues")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("ISSUES") && !frame.includes("Commands")), app.captureCharFrame()).toBe(true)
		await press(app, "n")
		expect(app.captureCharFrame()).toContain("Create issue")
		await type(app, "Parity issue")
		await press(app, "tab")
		await act(async () => app.mockInput.pasteBracketedText("Issue body"))
		await step(app)
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Created issue")), app.captureCharFrame()).toBe(true)

		await press(app, "x", { shift: true })
		expect(app.captureCharFrame()).toContain("permanently deletes the issue")
		await press(app, "escape")
		expect(app.captureCharFrame()).toContain("ISSUES")
		await press(app, "x", { shift: true })
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Deleted #")), app.captureCharFrame()).toBe(true)

		act(() => app.root.unmount())
		app.renderer.destroy()
	})
})
