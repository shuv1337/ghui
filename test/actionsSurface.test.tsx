import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"

process.env.GHUI_MOCK_PR_COUNT = "24"
process.env.GHUI_MOCK_REPO_COUNT = "4"
process.env.GHUI_MOCK_FIXTURE_PATH = "/tmp/ghui-actions-test-no-fixture.json"
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
	// @ts-expect-error test renderer contract
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
	cached = await loadApp()
})
const step = async (app: Awaited<ReturnType<typeof setup>>) => {
	await act(async () => {
		await app.renderOnce()
		await new Promise<void>((resolve) => setTimeout(resolve, 1))
	})
}
const settle = async (app: Awaited<ReturnType<typeof setup>>, predicate: (frame: string) => boolean) => {
	for (let index = 0; index < 100; index++) {
		await step(app)
		if (predicate(app.captureCharFrame())) return true
	}
	return false
}
const setup = async (width = 110, height = 26) => {
	const rendererSetup = await cached.createTestRenderer({ width, height })
	const root = cached.createRoot(rendererSetup.renderer)
	act(() =>
		root.render(
			<cached.RegistryProvider>
				<cached.App />
			</cached.RegistryProvider>,
		),
	)
	const app = { ...rendererSetup, root }
	await step(app)
	return app
}
const press = async (app: Awaited<ReturnType<typeof setup>>, key: string, modifiers?: { shift?: boolean; ctrl?: boolean }) => {
	act(() =>
		key === "return"
			? app.mockInput.pressEnter()
			: key === "escape"
				? app.mockInput.pressEscape()
				: key === "up" || key === "down" || key === "left" || key === "right"
					? app.mockInput.pressArrow(key)
					: app.mockInput.pressKey(key, modifiers),
	)
	await step(app)
}
const typeText = async (app: Awaited<ReturnType<typeof setup>>, text: string) => {
	await act(async () => app.mockInput.typeText(text))
	await step(app)
}
const openActions = async (app: Awaited<ReturnType<typeof setup>>) => {
	expect(await settle(app, (frame) => frame.includes("PULL REQUESTS"))).toBe(true)
	await press(app, "1")
	expect(await settle(app, (frame) => frame.includes("repo-0"))).toBe(true)
	await press(app, "return")
	expect(await settle(app, (frame) => frame.includes("PULL REQUESTS"))).toBe(true)
	await press(app, "4")
	expect(await settle(app, (frame) => frame.includes("repo-0 Actions") && frame.includes("CI")), app.captureCharFrame()).toBe(true)
}

describe("Actions Surface", () => {
	test("is reachable and bounded at every parity terminal size", async () => {
		for (const [width, height] of [
			[60, 16],
			[99, 24],
			[100, 24],
			[160, 40],
		] as const) {
			const app = await setup(width, height)
			await openActions(app)
			expect(app.captureCharFrame()).toContain("repo-0 Actions")
			act(() => app.root.unmount())
			app.renderer.destroy()
		}
	})

	test("reuses the run model for repository runs, job drill-down, and on-demand logs", async () => {
		const app = await setup()
		await openActions(app)
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Checkout") || frame.includes("Build")), app.captureCharFrame()).toBe(true)
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Mock log for job")), app.captureCharFrame()).toBe(true)
		await press(app, "escape")
		expect(await settle(app, (frame) => !frame.includes("Mock log for job")), app.captureCharFrame()).toBe(true)
		act(() => app.root.unmount())
		app.renderer.destroy()
	})

	test("confirms retry and cancel through guarded keyboard flows", async () => {
		const app = await setup()
		await openActions(app)
		await press(app, "r", { shift: true })
		expect(await settle(app, (frame) => frame.includes("Retry failed jobs in run"))).toBe(true)
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Retry requested for run"))).toBe(true)
		await press(app, "j")
		await press(app, "j")
		await press(app, "x")
		expect(await settle(app, (frame) => frame.includes("Cancel run"))).toBe(true)
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Cancellation requested for run"))).toBe(true)
		act(() => app.root.unmount())
		app.renderer.destroy()
	})

	test("dispatches typed workflow inputs without persisting modal values", async () => {
		const app = await setup()
		await openActions(app)
		await press(app, "d")
		expect(await settle(app, (frame) => frame.includes("Dispatch workflow") && frame.includes("environment"))).toBe(true)
		await press(app, "down")
		await press(app, "down")
		await press(app, "right")
		expect(app.captureCharFrame()).toContain("production")
		await press(app, "down")
		await press(app, "left")
		expect(app.captureCharFrame()).toContain("false")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Dispatched CI"))).toBe(true)
		await press(app, "d")
		expect(await settle(app, (frame) => frame.includes("Dispatch workflow") && frame.includes("staging"))).toBe(true)
		expect(app.captureCharFrame()).not.toContain("production")
		act(() => app.root.unmount())
		app.renderer.destroy()
	})

	test("requires an explicit artifact destination and downloads from the selected run", async () => {
		const app = await setup()
		await openActions(app)
		await press(app, "a")
		expect(await settle(app, (frame) => frame.includes("Download artifact") && frame.includes("ghui-build"))).toBe(true)
		await press(app, "return")
		expect(app.captureCharFrame()).toContain("Choose an explicit destination directory")
		await typeText(app, "/tmp/ghui-actions-artifact")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("Downloaded ghui-build to /tmp/ghui-actions-artifact"))).toBe(true)
		act(() => app.root.unmount())
		app.renderer.destroy()
	})

	test("cycles status and workflow filters in the repository run list", async () => {
		const app = await setup()
		await openActions(app)
		expect(app.captureCharFrame()).toContain("workflow: all · status: all")
		await press(app, "f")
		expect(await settle(app, (frame) => frame.includes("status: active") && frame.includes("Release"))).toBe(true)
		expect(app.captureCharFrame()).not.toContain("Lint")
		await press(app, "f")
		expect(await settle(app, (frame) => frame.includes("status: failure") && frame.includes("CI"))).toBe(true)
		await press(app, "w")
		expect(await settle(app, (frame) => frame.includes("workflow: CI") && frame.includes("status: failure"))).toBe(true)
		await press(app, "f")
		await press(app, "f")
		await press(app, "f")
		await press(app, "w")
		await press(app, "w")
		await press(app, "w")
		await press(app, "/")
		await typeText(app, "release")
		await press(app, "return")
		expect(await settle(app, (frame) => frame.includes("search: release") && frame.includes("Release"))).toBe(true)
		expect(app.captureCharFrame()).not.toContain("Lint")
		act(() => app.root.unmount())
		app.renderer.destroy()
	})
})
