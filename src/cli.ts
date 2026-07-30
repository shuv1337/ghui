import { parseRepositoryInput } from "./pullRequestViews.js"

export const openTargetTypes = ["issue", "pr", "run", "job", "milestone", "release", "environment"] as const
export type OpenTargetType = (typeof openTargetTypes)[number]

export interface DoctorCheck {
	readonly id: string
	readonly status: "pass" | "warn" | "fail"
	readonly summary: string
	readonly detail?: string
}

export interface CacheEntry {
	readonly path: string
	readonly exists: boolean
	readonly sizeBytes: number
	readonly kind: "file" | "symlink" | "directory" | "missing"
}

export interface CacheInspection {
	readonly path: string | null
	readonly health: "healthy" | "missing" | "disabled" | "corrupt" | "locked" | "unsafe"
	readonly detail: string
	readonly entries: readonly CacheEntry[]
	readonly totalBytes: number
}

export interface RepositorySummary {
	readonly nameWithOwner: string
	readonly pushedAt: string | null
	readonly isPrivate: boolean
}

export interface CliDependencies {
	readonly version: string
	readonly stdinIsTTY: boolean
	readonly stdoutIsTTY: boolean
	readonly doctor: () => Promise<readonly DoctorCheck[]>
	readonly inspectCache: () => Promise<CacheInspection>
	readonly cleanCache: (apply: boolean) => Promise<CacheInspection>
	readonly openTarget: (type: OpenTargetType, id: string, repository: string | null) => Promise<void>
	readonly listRepositories: () => Promise<readonly RepositorySummary[]>
}

export interface CliResult {
	readonly exitCode: number
	readonly stdout: string
	readonly stderr: string
	readonly launchTui: boolean
	readonly repository: string | null
}

const commandNames = ["doctor", "cache", "open", "repos", "help", "version"] as const

export const cliHelp = (version: string) => `ghui ${version}

Terminal UI and command-line tools for GitHub repositories.

Usage:
  ghui [--repo owner/name]             Start the TUI
  ghui doctor [--json]                 Diagnose GitHub, config, cache, and terminal readiness
  ghui cache list [--json]             Inspect cache files and health
  ghui cache clean [--dry-run|--apply] [--json]
                                       Preview cleanup by default; --apply removes exact cache files
  ghui open <issue|pr|run|job|milestone|release|environment> <id>
                                       Open a GitHub target in the browser
  ghui repos [--json]                  List repositories visible to the authenticated user
  ghui -v, --version                   Print the installed version
  ghui -h, --help                      Show this help message
`

const editDistance = (left: string, right: string) => {
	const distances = Array.from({ length: left.length + 1 }, (_, index) => [index])
	for (let index = 1; index <= right.length; index++) distances[0]![index] = index
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
			distances[leftIndex]![rightIndex] = Math.min(
				distances[leftIndex - 1]![rightIndex]! + 1,
				distances[leftIndex]![rightIndex - 1]! + 1,
				distances[leftIndex - 1]![rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
			)
		}
	}
	return distances[left.length]![right.length]!
}

const result = (overrides: Partial<CliResult> = {}): CliResult => ({
	exitCode: 0,
	stdout: "",
	stderr: "",
	launchTui: false,
	repository: null,
	...overrides,
})

const formatBytes = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

const extractRepository = (input: readonly string[]): { readonly args: readonly string[]; readonly repository: string | null; readonly error: string | null } => {
	const args = [...input]
	const index = args.indexOf("--repo")
	if (index < 0) return { args, repository: null, error: null }
	const value = args[index + 1]
	const repository = value ? parseRepositoryInput(value) : null
	if (!repository) return { args, repository: null, error: "Invalid --repo value. Expected owner/name." }
	args.splice(index, 2)
	return { args, repository, error: null }
}

const doctorOutput = (checks: readonly DoctorCheck[]) => {
	const overall = checks.some((check) => check.status === "fail") ? "failing" : checks.some((check) => check.status === "warn") ? "degraded" : "healthy"
	const lines = [`ghui doctor: ${overall}`]
	for (const check of checks) lines.push(`${check.status === "pass" ? "ok" : check.status}  ${check.id}: ${check.summary}${check.detail ? ` (${check.detail})` : ""}`)
	return { overall, lines }
}

const cacheOutput = (inspection: CacheInspection, action: "list" | "dry-run" | "cleaned") => {
	const lines = [`Cache ${action}: ${inspection.health}`, inspection.path ?? "Cache disabled"]
	for (const entry of inspection.entries) if (entry.exists) lines.push(`${formatBytes(entry.sizeBytes).padStart(10)}  ${entry.path}`)
	lines.push(`${formatBytes(inspection.totalBytes)} total · ${inspection.detail}`)
	return lines.join("\n")
}

const invalidId = (type: OpenTargetType, id: string) => {
	if (!id.trim() || id.startsWith("-")) return true
	return type === "issue" || type === "pr" || type === "run" || type === "job" || type === "milestone" ? !/^[1-9]\d*$/.test(id) : false
}

export const runCli = async (input: readonly string[], dependencies: CliDependencies): Promise<CliResult> => {
	const extracted = extractRepository(input)
	if (extracted.error) return result({ exitCode: 2, stderr: `${extracted.error}\n` })
	const args = extracted.args
	const repository = extracted.repository
	const command = args[0]
	if (command === "-h" || command === "--help" || command === "help") return result({ stdout: cliHelp(dependencies.version), repository })
	if (command === "-v" || command === "--version" || command === "version") return result({ stdout: `${dependencies.version}\n`, repository })
	if (command === "upgrade") {
		return result({ exitCode: 1, stderr: "Use your package manager to upgrade ghui, for example `brew upgrade ghui`.\n", repository })
	}
	if (!command) {
		if (!dependencies.stdinIsTTY || !dependencies.stdoutIsTTY) {
			return result({ exitCode: 2, stderr: "ghui requires an interactive TTY. Run `ghui --help` for non-interactive commands.\n", repository })
		}
		return result({ launchTui: true, repository })
	}
	if (command === "doctor") {
		if (args.some((arg) => arg !== "doctor" && arg !== "--json")) return result({ exitCode: 2, stderr: "Usage: ghui doctor [--json]\n", repository })
		const checks = await dependencies.doctor()
		const formatted = doctorOutput(checks)
		return result({
			exitCode: formatted.overall === "failing" ? 1 : 0,
			stdout: args.includes("--json") ? json({ status: formatted.overall, checks }) : `${formatted.lines.join("\n")}\n`,
			repository,
		})
	}
	if (command === "cache") {
		const subcommand = args[1]
		const asJson = args.includes("--json")
		if (subcommand === "list" && args.every((arg) => arg === "cache" || arg === "list" || arg === "--json")) {
			const inspection = await dependencies.inspectCache()
			return result({
				exitCode: inspection.health === "corrupt" || inspection.health === "locked" || inspection.health === "unsafe" ? 1 : 0,
				stdout: asJson ? json(inspection) : `${cacheOutput(inspection, "list")}\n`,
				repository,
			})
		}
		if (subcommand === "clean" && args.every((arg) => ["cache", "clean", "--json", "--dry-run", "--apply"].includes(arg))) {
			if (args.includes("--dry-run") && args.includes("--apply")) return result({ exitCode: 2, stderr: "Choose either --dry-run or --apply, not both.\n", repository })
			const apply = args.includes("--apply")
			const inspection = await dependencies.cleanCache(apply)
			const failed = inspection.health === "unsafe" || inspection.health === "locked"
			return result({
				exitCode: failed ? 1 : 0,
				stdout: asJson ? json({ applied: apply, ...inspection }) : `${cacheOutput(inspection, apply ? "cleaned" : "dry-run")}\n`,
				repository,
			})
		}
		return result({ exitCode: 2, stderr: "Usage: ghui cache <list|clean> [--dry-run|--apply] [--json]\n", repository })
	}
	if (command === "open") {
		const type = args[1]
		const id = args[2]
		if (!openTargetTypes.includes(type as OpenTargetType) || !id || args.length !== 3) {
			return result({ exitCode: 2, stderr: "Usage: ghui open <issue|pr|run|job|milestone|release|environment> <id>\n", repository })
		}
		if (invalidId(type as OpenTargetType, id)) return result({ exitCode: 2, stderr: `Invalid ${type} id: ${id}\n`, repository })
		await dependencies.openTarget(type as OpenTargetType, id, repository)
		return result({ stdout: `Opened ${type} ${id}.\n`, repository })
	}
	if (command === "repos") {
		if (args.some((arg) => arg !== "repos" && arg !== "--json")) return result({ exitCode: 2, stderr: "Usage: ghui repos [--json]\n", repository })
		const repositories = await dependencies.listRepositories()
		const stdout = args.includes("--json")
			? json(repositories)
			: repositories.length === 0
				? "No repositories found.\n"
				: `${repositories.map((entry) => `${entry.nameWithOwner}${entry.isPrivate ? "  private" : ""}${entry.pushedAt ? `  ${entry.pushedAt}` : ""}`).join("\n")}\n`
		return result({ stdout, repository })
	}

	const suggestion = commandNames.find((name) => editDistance(command, name) <= 2)
	return result({
		exitCode: 2,
		stderr: `Unknown command: ${command}\n${suggestion ? `Did you mean: ghui ${suggestion}?\n` : ""}Run \`ghui --help\` for usage.\n`,
		repository,
	})
}
