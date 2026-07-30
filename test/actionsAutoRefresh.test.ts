import { describe, expect, test } from "bun:test"
import { ACTIONS_REFRESH_INTERVAL_MS, actionsAutoRefreshEnabled, createActionsAutoRefreshTimer } from "../src/hooks/useActionsAutoRefresh.js"

describe("Actions auto-refresh", () => {
	test("only enables for a focused visible Actions Surface with an active run", () => {
		expect(actionsAutoRefreshEnabled(true, true, true)).toBe(true)
		expect(actionsAutoRefreshEnabled(false, true, true)).toBe(false)
		expect(actionsAutoRefreshEnabled(true, false, true)).toBe(false)
		expect(actionsAutoRefreshEnabled(true, true, false)).toBe(false)
	})

	test("starts one bounded timer and clears it when the lifecycle changes", () => {
		let callback: (() => void) | null = null
		let interval = 0
		let cleared: unknown = null
		let refreshes = 0
		const cleanup = createActionsAutoRefreshTimer({
			enabled: true,
			intervalMs: ACTIONS_REFRESH_INTERVAL_MS,
			onRefresh: () => {
				refreshes += 1
			},
			setIntervalFn: ((next: () => void, milliseconds: number) => {
				callback = next
				interval = milliseconds
				return 42
			}) as typeof globalThis.setInterval,
			clearIntervalFn: ((handle: unknown) => {
				cleared = handle
			}) as typeof globalThis.clearInterval,
		})
		expect(interval).toBe(ACTIONS_REFRESH_INTERVAL_MS)
		;(callback as (() => void) | null)?.()
		expect(refreshes).toBe(1)
		cleanup()
		expect(cleared).toBe(42)
	})

	test("does not allocate a timer while inactive or blurred", () => {
		let allocated = false
		const cleanup = createActionsAutoRefreshTimer({
			enabled: false,
			intervalMs: ACTIONS_REFRESH_INTERVAL_MS,
			onRefresh: () => {},
			setIntervalFn: (() => {
				allocated = true
				return 1
			}) as typeof globalThis.setInterval,
		})
		cleanup()
		expect(allocated).toBe(false)
	})
})
