import { cliEntrypointIds } from "../src/cli.ts"
import { globalCommands } from "../src/commands/builtins.ts"
import { buildParityReport, parityManifest } from "../test/parity/manifest.ts"
import { validateScenarioEvidence } from "../test/parity/scenarios.ts"

const report = buildParityReport(new Date().toISOString(), parityManifest, {
	registeredCommandIds: globalCommands.map((command) => command.id),
	registeredEntrypointIds: cliEntrypointIds,
})
const evidenceProblems = validateScenarioEvidence(parityManifest, new URL("..", import.meta.url).pathname)

if (process.argv.includes("--json")) {
	console.log(JSON.stringify({ ...report, evidenceProblems }, null, 2))
} else {
	console.log("ghui GitHub feature parity")
	console.log("")
	console.log(`existing ${report.counts.existing}`)
	console.log(`partial  ${report.counts.partial}`)
	console.log(`missing  ${report.counts.missing}`)
	console.log(`complete ${report.counts.complete}`)
	console.log(`excluded ${report.counts.excluded}`)
	console.log("")
	for (const milestone of report.milestones) {
		console.log(`M${milestone.milestone}: ${milestone.complete}/${milestone.total} complete`)
	}
}

if (report.problems.length > 0) {
	for (const problem of report.problems) console.error(`${problem.capabilityId}: ${problem.message}`)
	process.exitCode = 1
}
if (evidenceProblems.length > 0) {
	for (const problem of evidenceProblems) console.error(`${problem.capabilityId}: ${problem.message}`)
	process.exitCode = 1
}
