import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"

process.env.GHUI_MOCK_PR_COUNT = "24"
process.env.GHUI_MOCK_REPO_COUNT = "4"
process.env.GHUI_MOCK_FIXTURE_PATH = "/tmp/ghui-resource-test-no-fixture.json"
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

const step = async (app: Awaited<ReturnType<typeof setup>>) => {
	await act(async () => {
		await app.renderOnce()
		await new Promise<void>((resolve) => setTimeout(resolve, 1))
	})
}
const settle = async (app: Awaited<ReturnType<typeof setup>>, predicate: (frame: string) => boolean, attempts = 100) => {
	for (let index = 0; index < attempts; index++) {
		await step(app)
		if (predicate(app.captureCharFrame())) return true
	}
	return false
}
const setup = async (width = 100, height = 24) => {
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
const press = async (app: Awaited<ReturnType<typeof setup>>, key: string, modifiers?: { shift?: boolean; ctrl?: boolean }) => {
	act(() => {
		if (key === "return") app.mockInput.pressEnter(modifiers)
		else if (key === "escape") app.mockInput.pressEscape(modifiers)
		else if (key === "tab") app.mockInput.pressTab(modifiers)
		else if (key === "left" || key === "right") app.mockInput.pressArrow(key)
		else app.mockInput.pressKey(key, modifiers)
	})
	await step(app)
}
const typeText = async (app: Awaited<ReturnType<typeof setup>>, value: string) => {
	await act(async () => app.mockInput.typeText(value))
	await step(app)
}
const openRepository = async (app: Awaited<ReturnType<typeof setup>>) => {
	expect(await settle(app, (frame) => frame.includes("PULL REQUESTS"))).toBe(true)
	await press(app, "1")
	expect(await settle(app, (frame) => frame.includes("repo-0"))).toBe(true)
	await press(app, "return")
	expect(await settle(app, (frame) => frame.includes("PULL REQUESTS"))).toBe(true)
}

describe("Repository resource Surfaces", () => {
	test("render branches, milestones, environments, and runners at every contract size", async () => {
		for (const [width, height] of [
			[60, 16],
			[99, 24],
			[100, 24],
			[160, 40],
		] as const) {
			const app = await setup(width, height)
			await openRepository(app)
			await press(app, "5")
			expect(await settle(app, (frame) => frame.includes("feature/mock") && frame.includes("protected")), app.captureCharFrame()).toBe(true)
			await press(app, "6")
			expect(await settle(app, (frame) => frame.includes("Next") && frame.includes("% complete")), app.captureCharFrame()).toBe(true)
			await press(app, "7")
			expect(await settle(app, (frame) => frame.includes("production") && frame.includes("#101 success")), app.captureCharFrame()).toBe(true)
			await press(app, "8")
			expect(await settle(app, (frame) => frame.includes("linux-x64") && frame.includes("gpu*")), app.captureCharFrame()).toBe(true)
			expect(app.captureSpans()).toMatchObject({ cols: width, rows: height })
			act(() => app.root.unmount())
			app.renderer.destroy()
		}
	})

	test("creates and guarded-deletes branches through keyboard commands", async () => {
		const app = await setup()
		await openRepository(app)
		await press(app, "5")
		expect(await settle(app, (frame) => frame.includes("feature/mock"))).toBe(true)
		await press(app, "x")
		expect(await settle(app, (frame) => frame.includes("default branch cannot be deleted")), app.captureCharFrame()).toBe(true)
		await press(app, "c")
		expect(app.captureCharFrame()).toContain("Create branch")
		await typeText(app, "parity/m5")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("parity/m5")), app.captureCharFrame()).toBe(true)
		await press(app, "k")
		await press(app, "x")
		expect(app.captureCharFrame()).toContain("This mutation cannot be undone.")
		await press(app, "return")
		expect(await settle(app, (frame) => !frame.includes("\n parity/m5")), app.captureCharFrame()).toBe(true)
		act(() => app.root.unmount())
		app.renderer.destroy()
	})

	test("creates, edits, closes, reopens, and confirms milestone deletion", async () => {
		const app = await setup()
		await openRepository(app)
		await press(app, "6")
		expect(await settle(app, (frame) => frame.includes("Next release"))).toBe(true)
		await press(app, "c")
		await typeText(app, "Parity M5")
		await press(app, "tab")
		await typeText(app, "Resource milestone")
		await press(app, "tab")
		await typeText(app, "2026-10-01")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Parity M5")), app.captureCharFrame()).toBe(true)
		await press(app, "k")
		await press(app, "e")
		expect(app.captureCharFrame()).toContain("Edit milestone")
		await typeText(app, " updated")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Updated Parity M5 updated")), app.captureCharFrame()).toBe(true)
		await press(app, "s")
		expect(await settle(app, (frame) => frame.includes("Closed Parity M5 updated")), app.captureCharFrame()).toBe(true)
		await press(app, "s")
		expect(await settle(app, (frame) => frame.includes("Reopened Parity M5 updated"))).toBe(true)
		await press(app, "x")
		expect(app.captureCharFrame()).toContain("Delete milestone")
		await press(app, "return")
		expect(await settle(app, (frame) => !frame.includes("\n Parity M5 updated")), app.captureCharFrame()).toBe(true)
		act(() => app.root.unmount())
		app.renderer.destroy()
	})
})
