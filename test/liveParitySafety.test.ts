import { describe, expect, test } from "bun:test"
import {
	assertLiveParityAllowed,
	createLiveFixtureLedger,
	executeLiveFixtureOperations,
	type LiveParityContext,
	LiveParitySafetyError,
	validateLiveParityContext,
} from "./support/liveParity.ts"

const safeContext: LiveParityContext = {
	configuredRepository: "parity-owner/parity-repo",
	actualRepository: "parity-owner/parity-repo",
	dedicatedIdentity: true,
	viewerPermission: "admin",
	repositoryHasMarker: true,
	apply: true,
	approved: true,
}

describe("live parity safety guard", () => {
	test("allows a fully guarded destructive action", () => {
		expect(validateLiveParityContext(safeContext, "destructive")).toEqual([])
		expect(() => assertLiveParityAllowed(safeContext, "destructive")).not.toThrow()
	})

	test("refuses repository mismatch, ordinary identity, missing marker, permission, apply, and approval", () => {
		const problems = validateLiveParityContext(
			{
				...safeContext,
				actualRepository: "ordinary-owner/production-repo",
				dedicatedIdentity: false,
				viewerPermission: "write",
				repositoryHasMarker: false,
				apply: false,
				approved: false,
			},
			"destructive",
		)
		expect(problems.map((problem) => problem.code)).toEqual([
			"repository-mismatch",
			"dedicated-identity-required",
			"marker-required",
			"admin-required",
			"apply-required",
			"approval-required",
		])
		expect(() =>
			assertLiveParityAllowed(
				{
					...safeContext,
					configuredRepository: null,
				},
				"mutate",
			),
		).toThrow(LiveParitySafetyError)
	})

	test("allows read-only validation without apply or mutation approval but keeps repository, identity, and marker guards", () => {
		expect(
			validateLiveParityContext(
				{
					...safeContext,
					viewerPermission: "read",
					apply: false,
					approved: false,
				},
				"read",
			),
		).toEqual([])
	})
})

describe("live parity fixture ledger", () => {
	test("requires prefixed fixtures, records cleanup idempotence evidence, and reports residue", () => {
		const ledger = createLiveFixtureLedger("ghui-p7-run1")
		ledger.record({ kind: "issue", id: "101", name: "ghui-p7-run1-issue-101" })
		ledger.record({ kind: "branch", id: "feature", name: "ghui-p7-run1-branch-feature" })
		expect(() => ledger.record({ kind: "release", id: "v1", name: "ordinary-release" })).toThrow("must start with ghui-p7-run1-")
		expect(() => ledger.record({ kind: "issue", id: "101", name: "ghui-p7-run1-issue-copy" })).toThrow("already recorded")

		ledger.recordCleanup("issue", "101", "removed")
		ledger.recordCleanup("branch", "feature", "failed", "fixture branch still protected")

		expect(ledger.inventory()).toEqual([
			{ kind: "issue", id: "101", name: "ghui-p7-run1-issue-101", cleanup: "removed", cleanupDetail: null },
			{ kind: "branch", id: "feature", name: "ghui-p7-run1-branch-feature", cleanup: "failed", cleanupDetail: "fixture branch still protected" },
		])
		expect(ledger.pending().map((fixture) => fixture.id)).toEqual(["feature"])
	})

	test("stops after the first failure and cleans created fixtures in reverse order", async () => {
		const events: string[] = []
		const results = await executeLiveFixtureOperations([
			{
				id: "first",
				setup: async () => {
					events.push("setup:first")
					return "first-fixture"
				},
				verify: async () => {
					events.push("verify:first")
				},
				cleanup: async () => {
					events.push("cleanup:first")
				},
			},
			{
				id: "second",
				setup: async () => {
					events.push("setup:second")
					return "second-fixture"
				},
				verify: async () => {
					events.push("verify:second")
					throw new Error("verification failed")
				},
				cleanup: async () => {
					events.push("cleanup:second")
				},
			},
			{
				id: "never",
				setup: async () => {
					events.push("setup:never")
				},
				verify: async () => {},
				cleanup: async () => {},
			},
		])

		expect(events).toEqual(["setup:first", "verify:first", "setup:second", "verify:second", "cleanup:second", "cleanup:first"])
		expect(results).toEqual([
			{ id: "first", setup: "passed", verify: "passed", cleanup: "passed", detail: null, cleanupDetail: null },
			{ id: "second", setup: "passed", verify: "failed", cleanup: "passed", detail: "verification failed", cleanupDetail: null },
			{ id: "never", setup: "not-run", verify: "not-run", cleanup: "not-run", detail: null, cleanupDetail: null },
		])
	})

	test("records cleanup residue without hiding the original setup result", async () => {
		const results = await executeLiveFixtureOperations([
			{
				id: "residue",
				setup: async () => "fixture",
				verify: async () => {},
				cleanup: async () => {
					throw new Error("still present")
				},
			},
		])
		expect(results).toEqual([{ id: "residue", setup: "passed", verify: "passed", cleanup: "failed", detail: null, cleanupDetail: "still present" }])
	})
})
