import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { automatedFactVerificationOwners, buildParityReport, type ParityCapability, parityManifest, validateParityManifest } from "./parity/manifest.ts"
import { parityScenarioEvidence, validateScenarioEvidence } from "./parity/scenarios.ts"

const acceptedFactMetadata = JSON.parse(readFileSync(new URL("../goals/github-feature-parity/facts.meta.json", import.meta.url), "utf8")) as {
	readonly facts: readonly {
		readonly id: string
		readonly automatedVerification: boolean
	}[]
}

const cloneCapability = (overrides: Partial<ParityCapability> = {}): ParityCapability => ({
	id: "probe",
	title: "Probe",
	scope: "program",
	milestone: 0,
	status: "partial",
	commandIds: ["probe.run"],
	serviceMethods: [],
	scenarios: {
		unit: ["unit.probe"],
		render: ["render.probe"],
		interaction: ["interaction.probe"],
		live: [],
	},
	requiresLive: false,
	...overrides,
})

describe("GitHub parity manifest", () => {
	test("is internally valid and current registered Surfaces are represented", () => {
		expect(
			validateParityManifest(parityManifest, {
				registeredCapabilityIds: [
					"workspace-navigation",
					"pull-request-browse",
					"issue-browse",
					"releases",
					"actions",
					"branches",
					"milestones",
					"environments-deployments",
					"runners",
					"notifications",
				],
			}),
		).toEqual([])
	})

	test("assigns every accepted automated fact to verification owners", () => {
		const expected = acceptedFactMetadata.facts.filter((fact) => fact.automatedVerification).map((fact) => fact.id)
		expect(Object.keys(automatedFactVerificationOwners).sort()).toEqual(expected.sort())
		expect(Object.values(automatedFactVerificationOwners).every((owners) => owners.length > 0)).toBe(true)
	})

	test("binds every scenario id to existing executable evidence", () => {
		expect(validateScenarioEvidence(parityManifest, new URL("..", import.meta.url).pathname)).toEqual([])
		expect(Object.keys(parityScenarioEvidence)).toHaveLength(parityManifest.filter((capability) => capability.status !== "excluded").length)
	})

	test("rejects duplicate ids, ownerless work, incomplete scenarios, and missing registered capabilities", () => {
		const problems = validateParityManifest(
			[
				cloneCapability(),
				cloneCapability({ milestone: null }),
				cloneCapability({
					id: "live-probe",
					status: "complete",
					requiresLive: true,
					scenarios: { unit: [], render: [], interaction: [], live: [] },
				}),
			],
			{ registeredCapabilityIds: ["live-probe", "unknown-probe"] },
		)

		expect(problems.map((problem) => `${problem.capabilityId}:${problem.message}`)).toEqual(
			expect.arrayContaining([
				"probe:duplicate capability id",
				"probe:in-scope capability requires an owner milestone",
				"live-probe:in-scope capability requires a unit scenario",
				"live-probe:in-scope capability requires a render scenario",
				"live-probe:in-scope capability requires an interaction scenario",
				"live-probe:in-scope API capability requires a live scenario",
				"unknown-probe:registered capability is absent from the parity manifest",
			]),
		)
	})

	test("requires an explicit reason for exclusions", () => {
		expect(
			validateParityManifest([
				cloneCapability({
					id: "excluded-probe",
					status: "excluded",
					milestone: null,
					commandIds: [],
					scenarios: { unit: [], render: [], interaction: [], live: [] },
					exclusionReason: " ",
				}),
			]),
		).toEqual([{ capabilityId: "excluded-probe", message: "excluded capability requires a reason" }])
	})

	test("builds a deterministic report when supplied a timestamp", () => {
		const report = buildParityReport("2026-07-29T00:00:00.000Z")
		expect(report.generatedAt).toBe("2026-07-29T00:00:00.000Z")
		expect(report.problems).toEqual([])
		expect(report.counts.excluded).toBe(6)
		expect(report.milestones).toHaveLength(8)
		expect(report.milestones.reduce((sum, milestone) => sum + milestone.total, 0)).toBe(parityManifest.length - report.counts.excluded)
	})
})
