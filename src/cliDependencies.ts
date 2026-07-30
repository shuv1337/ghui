import { access, lstat, stat, unlink } from "node:fs/promises"
import { constants } from "node:fs"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"
import type { CacheEntry, CacheInspection, CliDependencies, DoctorCheck, OpenTargetType, RepositorySummary } from "./cli.js"
import { config } from "./config.js"
import { configDirectory, configPath, readStoredConfig } from "./configStore.js"

interface ProcessOutput {
	readonly exitCode: number
	readonly stdout: string
	readonly stderr: string
	readonly timedOut: boolean
}

const run = async (args: readonly string[], timeoutMs = 15_000): Promise<ProcessOutput> => {
	const process = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" })
	let timedOut = false
	const timer = setTimeout(() => {
		timedOut = true
		process.kill()
	}, timeoutMs)
	try {
		const [exitCode, stdout, stderr] = await Promise.all([process.exited, Bun.readableStreamToText(process.stdout), Bun.readableStreamToText(process.stderr)])
		return { exitCode, stdout, stderr, timedOut }
	} finally {
		clearTimeout(timer)
	}
}

const ghFailure = (operation: string, output: ProcessOutput) => {
	const detail = output.timedOut ? "timed out" : output.stderr.trim() || `exit ${output.exitCode}`
	return new Error(`${operation} failed: ${detail}`)
}

const gh = async (args: readonly string[]) => {
	const output = await run(args)
	if (output.exitCode !== 0 || output.timedOut) throw ghFailure(`gh ${args[0] ?? ""}`, output)
	return output.stdout
}

const cacheEntries = async (path: string): Promise<readonly CacheEntry[]> =>
	Promise.all(
		[path, `${path}-wal`, `${path}-shm`].map(async (target): Promise<CacheEntry> => {
			try {
				const info = await lstat(target)
				return {
					path: target,
					exists: true,
					sizeBytes: info.size,
					kind: info.isSymbolicLink() ? "symlink" : info.isDirectory() ? "directory" : "file",
				}
			} catch (cause) {
				if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") return { path: target, exists: false, sizeBytes: 0, kind: "missing" }
				throw cause
			}
		}),
	)

export const inspectCachePath = async (path: string | null): Promise<CacheInspection> => {
	if (!path) return { path: null, health: "disabled", detail: "Cache is disabled by GHUI_CACHE_PATH.", entries: [], totalBytes: 0 }
	const entries = await cacheEntries(path)
	const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)
	if (entries.some((entry) => entry.kind === "symlink" || entry.kind === "directory")) {
		return { path, health: "unsafe", detail: "Cleanup refuses symlinks and directories.", entries, totalBytes }
	}
	if (!entries[0]!.exists) return { path, health: "missing", detail: "No cache database exists.", entries, totalBytes }
	try {
		const database = new Database(path, { readonly: true })
		try {
			const check = database.query("PRAGMA quick_check").get() as Readonly<Record<string, unknown>> | null
			const value = check ? String(Object.values(check)[0] ?? "") : ""
			return {
				path,
				health: value === "ok" ? "healthy" : "corrupt",
				detail: value === "ok" ? "SQLite quick_check passed." : `SQLite quick_check: ${value || "no result"}`,
				entries,
				totalBytes,
			}
		} finally {
			database.close()
		}
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : String(cause)
		const locked = /busy|locked/i.test(detail)
		return { path, health: locked ? "locked" : "corrupt", detail, entries, totalBytes }
	}
}

export const cleanCachePath = async (path: string | null, apply: boolean): Promise<CacheInspection> => {
	const inspection = await inspectCachePath(path)
	if (!apply || !inspection.path || inspection.health === "unsafe" || inspection.health === "locked") return inspection
	for (const entry of inspection.entries)
		if (entry.kind === "file")
			await unlink(entry.path).catch((cause) => {
				if (!(cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT")) throw cause
			})
	return {
		...inspection,
		health: "missing",
		detail: `Removed ${inspection.entries.filter((entry) => entry.kind === "file").length} cache file(s).`,
		entries: await cacheEntries(inspection.path),
	}
}

const writableDirectoryCheck = async (id: string, path: string): Promise<DoctorCheck> => {
	let target = path
	for (;;) {
		try {
			const info = await stat(target)
			if (!info.isDirectory()) return { id, status: "fail", summary: "path is not a directory", detail: target }
			await access(target, constants.W_OK)
			return { id, status: "pass", summary: "writable", detail: target }
		} catch (cause) {
			if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") {
				const parent = dirname(target)
				if (parent === target) return { id, status: "fail", summary: "no writable parent", detail: path }
				target = parent
				continue
			}
			return { id, status: "fail", summary: "not writable", detail: cause instanceof Error ? cause.message : String(cause) }
		}
	}
}

const doctor = async (): Promise<readonly DoctorCheck[]> => {
	const checks: DoctorCheck[] = []
	const version = await run(["--version"])
	checks.push(
		version.exitCode === 0
			? { id: "gh", status: /^gh version 2\.(?:4[5-9]|[5-9]\d)|^gh version [3-9]\./m.test(version.stdout) ? "pass" : "warn", summary: version.stdout.split("\n")[0] || "available" }
			: { id: "gh", status: "fail", summary: "GitHub CLI unavailable", detail: version.stderr.trim() || "not found" },
	)
	const auth = version.exitCode === 0 ? await run(["auth", "status"]) : null
	checks.push(
		auth?.exitCode === 0
			? { id: "auth", status: "pass", summary: "authenticated" }
			: { id: "auth", status: "fail", summary: "authentication failed", detail: auth?.stderr.trim() || "gh unavailable" },
	)
	const repository = auth?.exitCode === 0 ? await run(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]) : null
	const repositoryName = repository?.exitCode === 0 ? repository.stdout.trim() : null
	checks.push(repositoryName ? { id: "repository", status: "pass", summary: repositoryName } : { id: "repository", status: "warn", summary: "not in a GitHub repository" })
	try {
		const stored = await readStoredConfig()
		checks.push({
			id: "config",
			status: stored.diagnostics.length === 0 ? "pass" : "warn",
			summary: stored.diagnostics.length === 0 ? "parsed" : `${stored.diagnostics.length} diagnostic(s)`,
			...(stored.diagnostics[0] ? { detail: stored.diagnostics[0] } : {}),
		})
	} catch (cause) {
		checks.push({ id: "config", status: "fail", summary: "could not parse", detail: cause instanceof Error ? cause.message : String(cause) })
	}
	checks.push(await writableDirectoryCheck("config-directory", configDirectory()))
	checks.push(await writableDirectoryCheck("cache-directory", config.cachePath ? dirname(config.cachePath) : dirname(configPath())))
	const cache = await inspectCachePath(config.cachePath)
	checks.push({
		id: "cache",
		status:
			cache.health === "corrupt" || cache.health === "locked" || cache.health === "unsafe" ? "fail" : cache.health === "missing" || cache.health === "disabled" ? "warn" : "pass",
		summary: cache.health,
		detail: cache.detail,
	})
	const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY)
	checks.push({
		id: "terminal",
		status: tty && process.env.TERM !== "dumb" ? "pass" : "warn",
		summary: tty ? (process.env.TERM ?? "interactive") : "non-interactive",
		...(process.env.COLORTERM ? { detail: process.env.COLORTERM } : {}),
	})
	for (const [id, endpoint] of [
		["runners", "actions/runners?per_page=1"],
		["environments", "environments?per_page=1"],
	] as const) {
		if (!repositoryName) {
			checks.push({ id, status: "warn", summary: "not checked without repository context" })
			continue
		}
		const permission = await run(["api", `repos/${repositoryName}/${endpoint}`])
		checks.push(
			permission.exitCode === 0
				? { id, status: "pass", summary: "readable" }
				: { id, status: "warn", summary: "unavailable or permission denied", detail: permission.stderr.trim() },
		)
	}
	return checks
}

export const openTargetArgs = (type: OpenTargetType, id: string, repository: string | null): readonly string[] => {
	const repoArgs = repository ? ["-R", repository] : []
	return type === "issue"
		? ["issue", "view", id, "--web", ...repoArgs]
		: type === "pr"
			? ["pr", "view", id, "--web", ...repoArgs]
			: type === "run"
				? ["run", "view", id, "--web", ...repoArgs]
				: type === "job"
					? ["run", "view", "--job", id, "--web", ...repoArgs]
					: type === "release"
						? ["release", "view", id, "--web", ...repoArgs]
						: type === "milestone"
							? ["browse", `/milestone/${id}`, ...repoArgs]
							: ["browse", `/deployments/activity_log?environment=${encodeURIComponent(id)}`, ...repoArgs]
}

const openTarget = async (type: OpenTargetType, id: string, repository: string | null): Promise<void> => {
	await gh(openTargetArgs(type, id, repository))
}

const listRepositories = async (): Promise<readonly RepositorySummary[]> => {
	const stdout = await gh(["repo", "list", "--limit", "100", "--json", "nameWithOwner,pushedAt,isPrivate"])
	const parsed = JSON.parse(stdout) as unknown
	if (!Array.isArray(parsed)) throw new Error("gh repo list returned malformed JSON")
	return parsed.map((entry) => {
		if (!entry || typeof entry !== "object") throw new Error("gh repo list returned a malformed repository")
		const record = entry as Readonly<Record<string, unknown>>
		if (typeof record.nameWithOwner !== "string" || typeof record.isPrivate !== "boolean") throw new Error("gh repo list returned a malformed repository")
		return { nameWithOwner: record.nameWithOwner, isPrivate: record.isPrivate, pushedAt: typeof record.pushedAt === "string" ? record.pushedAt : null }
	})
}

export const makeCliDependencies = (version: string): CliDependencies => ({
	version,
	stdinIsTTY: Boolean(process.stdin.isTTY),
	stdoutIsTTY: Boolean(process.stdout.isTTY),
	doctor,
	inspectCache: () => inspectCachePath(config.cachePath),
	cleanCache: (apply) => cleanCachePath(config.cachePath, apply),
	openTarget,
	listRepositories,
})
