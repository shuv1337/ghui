import packageJson from "../package.json" with { type: "json" }
import { runCli } from "./cli.js"
import { makeCliDependencies } from "./cliDependencies.js"

try {
	const result = await runCli(Bun.argv.slice(2), makeCliDependencies(packageJson.version))
	if (result.stdout) process.stdout.write(result.stdout)
	if (result.stderr) process.stderr.write(result.stderr)
	if (result.repository) process.env.GHUI_REPOSITORY = result.repository
	if (result.launchTui) await import("./index.js")
	else process.exit(result.exitCode)
} catch (cause) {
	process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`)
	process.exit(1)
}
