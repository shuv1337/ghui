import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"

process.env.GHUI_MOCK_PR_COUNT = "24"
process.env.GHUI_MOCK_REPO_COUNT = "4"
process.env.GHUI_MOCK_FIXTURE_PATH = "/tmp/ghui-notifications-test-no-fixture.json"
process.env.GHUI_MOCK_WORKSPACE_PREFERENCES_PATH = "off"

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
	act(() =>
		root.render(
			<cached.RegistryProvider>
				<cached.App />
			</cached.RegistryProvider>,
		),
	)
	await step({ ...rendererSetup, root })
	return { ...rendererSetup, root }
}
const press = async (app: Awaited<ReturnType<typeof setup>>, name: string, modifiers?: { shift?: boolean; ctrl?: boolean }) => {
	act(() => {
		if (name === "return") app.mockInput.pressEnter(modifiers)
		else if (name === "space") app.mockInput.pressKey(" ", modifiers)
		else app.mockInput.pressKey(name, modifiers)
	})
	await step(app)
}

describe("Notifications Surface", () => {
	test("renders unread notifications responsively and supports filters", async () => {
		for (const [width, height] of [
			[60, 16],
			[99, 24],
			[100, 24],
			[160, 40],
		] as const) {
			const app = await setup(width, height)
			expect(await settle(app, (frame) => frame.includes("PULL REQUESTS"))).toBe(true)
			await press(app, "4")
			expect(await settle(app, (frame) => frame.includes("Review the parity") && frame.includes("unread · type all")), app.captureCharFrame()).toBe(true)
			await press(app, "f")
			expect(await settle(app, (frame) => frame.includes("type pullRequest")), app.captureCharFrame()).toBe(true)
			expect(app.captureSpans()).toMatchObject({ cols: width, rows: height })
			act(() => app.root.unmount())
			app.renderer.destroy()
		}
	})

	test("selects and marks a notification read with optimistic convergence", async () => {
		const app = await setup()
		expect(await settle(app, (frame) => frame.includes("PULL REQUESTS"))).toBe(true)
		await press(app, "4")
		expect(await settle(app, (frame) => frame.includes("Review the parity"))).toBe(true)
		await press(app, "space")
		expect(app.captureCharFrame()).toContain("◉")
		await press(app, "m", { shift: true })
		expect(await settle(app, (frame) => frame.includes("Marked 1 notification read")), app.captureCharFrame()).toBe(true)
		expect(app.captureCharFrame()).not.toContain("Review the parity")
		await press(app, "u")
		expect(await settle(app, (frame) => frame.includes("all · type all") && frame.includes("Review the parity")), app.captureCharFrame()).toBe(true)
		act(() => app.root.unmount())
		app.renderer.destroy()
	})
})
