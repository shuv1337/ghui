import { describe, expect, test } from "bun:test"
import { BulkSkipError, retryFailedBulkItems, runBulkItems } from "../src/item/bulk.ts"

describe("bounded item bulk operations", () => {
	test("limits concurrency and reports stable input order across partial failures", async () => {
		let active = 0
		let maximumActive = 0
		const result = await runBulkItems(
			[1, 2, 3, 4, 5],
			async (item) => {
				active += 1
				maximumActive = Math.max(maximumActive, active)
				await Bun.sleep(item % 2 === 0 ? 2 : 5)
				active -= 1
				if (item === 3) throw new Error("target no longer exists")
			},
			{ concurrency: 2, isRetryable: (error) => !(error instanceof Error && error.message.includes("no longer exists")) },
		)

		expect(maximumActive).toBe(2)
		expect(result.results.map((entry) => entry.item)).toEqual([1, 2, 3, 4, 5])
		expect(result.results.map((entry) => entry.status)).toEqual(["succeeded", "succeeded", "failed", "succeeded", "succeeded"])
		expect(result).toMatchObject({ succeeded: 4, failed: 1, skipped: 0, retryable: 0 })
	})

	test("cancels work not yet started and reports it as skipped", async () => {
		const controller = new AbortController()
		const started: number[] = []
		const result = await runBulkItems(
			[1, 2, 3, 4],
			async (item) => {
				started.push(item)
				if (item === 1) controller.abort()
				await Bun.sleep(1)
			},
			{ concurrency: 1, signal: controller.signal },
		)

		expect(started).toEqual([1])
		expect(result.results.map((entry) => entry.status)).toEqual(["succeeded", "skipped", "skipped", "skipped"])
		expect(result.skipped).toBe(3)
	})

	test("retries only retryable failures", async () => {
		const first = await runBulkItems(
			["ok", "retry", "skip"],
			async (item) => {
				if (item !== "ok") throw new Error(item)
			},
			{ isRetryable: (error) => error instanceof Error && error.message === "retry" },
		)
		const retried: string[] = []
		const second = await retryFailedBulkItems(first, async (item) => {
			retried.push(item)
		})

		expect(retried).toEqual(["retry"])
		expect(second).toMatchObject({ succeeded: 1, failed: 0, skipped: 0 })
	})

	test("classifies ineligible items as skipped without offering a retry", async () => {
		const result = await runBulkItems(["open", "closed"], async (state) => {
			if (state === "closed") throw new BulkSkipError("Already closed.")
		})

		expect(result.results).toEqual([
			{ item: "open", status: "succeeded", retryable: false, error: null },
			{ item: "closed", status: "skipped", retryable: false, error: "Already closed." },
		])
		expect(result).toMatchObject({ succeeded: 1, failed: 0, skipped: 1, retryable: 0 })
	})
})
