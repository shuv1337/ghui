import { describe, expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { cacheFirstStream } from "../src/services/cacheFirst.js"

describe("cacheFirstStream", () => {
	test("emits cached data before a later authoritative value", async () => {
		const values = await Effect.runPromise(Stream.runCollect(cacheFirstStream("cached", Stream.fromEffect(Effect.sleep("1 millis").pipe(Effect.as("live"))))))
		expect([...values]).toEqual(["cached", "live"])
	})

	test("retains cached data when the authoritative refresh fails", async () => {
		const values = await Effect.runPromise(Stream.runCollect(cacheFirstStream("cached", Stream.fail("offline"))))
		expect([...values]).toEqual(["cached"])
	})
})
