import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { actionWorkflowYaml, buildSummary, liveRunnerCapabilityIds, runLiveParity } from "../dev/live-parity.js"
import { parseWorkflowDispatchInputs } from "../src/services/github/actions.js"
import { parityManifest } from "./parity/manifest.js"

describe("live parity runner", () => {
	test("accounts for every live capability exactly once", () => {
		const expected = parityManifest.filter((capability) => capability.status !== "excluded" && capability.requiresLive).map((capability) => capability.id)
		expect([...liveRunnerCapabilityIds].sort()).toEqual([...expected].sort())
		expect(new Set(liveRunnerCapabilityIds).size).toBe(liveRunnerCapabilityIds.length)
	})

	test("summarizes scenario outcomes deterministically", () => {
		expect(
			buildSummary([
				{ capabilityId: "one", scenarioId: "live.one", action: "read", status: "passed", detail: "ok", durationMs: 1 },
				{ capabilityId: "two", scenarioId: "live.two", action: "mutate", status: "blocked", detail: "approval", durationMs: 0 },
				{ capabilityId: "three", scenarioId: "live.three", action: "read", status: "failed", detail: "bad", durationMs: 2 },
			]),
		).toEqual({ passed: 1, blocked: 1, failed: 1 })
	})

	test("generates the typed dispatch workflow used by Actions acceptance", () => {
		const yaml = actionWorkflowYaml("ghui-p7-run-actions", "ghui-p7-run-artifact")
		expect(parseWorkflowDispatchInputs(yaml)).toEqual([
			{ name: "message", description: "Fixture message", required: true, type: "string", defaultValue: null, options: [] },
			{ name: "delay", description: "Delay before completion", required: true, type: "choice", defaultValue: "30", options: ["0", "30"] },
			{ name: "publish", description: "Publish artifact", required: true, type: "boolean", defaultValue: true, options: [] },
			{ name: "target", description: "Deployment environment", required: true, type: "environment", defaultValue: null, options: [] },
			{ name: "recipient", description: "Dedicated notification recipient", required: true, type: "string", defaultValue: null, options: [] },
		])
		expect(yaml).toContain("uses: actions/upload-artifact@v4")
		expect(yaml).toContain("environment: ${{ inputs.target }}")
	})

	test("fails closed before invoking GitHub when repository and identity are absent", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ghui-live-parity-runner-"))
		const output = join(directory, "report.json")
		try {
			const result = await runLiveParity([], { GHUI_PARITY_OUTPUT: output })
			expect(result.exitCode).toBe(2)
			expect(result.report.preflight.passed).toBe(false)
			expect(result.report.preflight.problems).toEqual([
				"GHUI_PARITY_TEST_REPO must name the disposable repository exactly",
				"GHUI_PARITY_TEST_IDENTITY must name the dedicated test account exactly",
			])
			expect(result.report.scenarios).toEqual([])
			expect(JSON.parse(await readFile(output, "utf8"))).toEqual(result.report)
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})
})
