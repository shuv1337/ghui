import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { type CacheInspection, type CliDependencies, type DoctorCheck, type OpenTargetType, type RepositorySummary, runCli } from "../src/cli.ts"
import { cleanCachePath, inspectCachePath, openTargetArgs } from "../src/cliDependencies.ts"

const tempDirectories: string[] = []
afterEach(async () => {
	await Promise.all(tempDirectories.map((directory) => rm(directory, { recursive: true, force: true })))
	tempDirectories.length = 0
})

const cache = (overrides: Partial<CacheInspection> = {}): CacheInspection => ({
	path: "/tmp/ghui/cache.sqlite",
	health: "healthy",
	detail: "SQLite quick_check passed.",
	entries: [{ path: "/tmp/ghui/cache.sqlite", exists: true, sizeBytes: 128, kind: "file" }],
	totalBytes: 128,
	...overrides,
})

const dependencies = (
	overrides: Partial<CliDependencies> = {},
): CliDependencies & {
	readonly opened: { type: OpenTargetType; id: string; repository: string | null }[]
	readonly cleanModes: boolean[]
} => {
	const opened: { type: OpenTargetType; id: string; repository: string | null }[] = []
	const cleanModes: boolean[] = []
	return {
		version: "9.8.7",
		stdinIsTTY: true,
		stdoutIsTTY: true,
		doctor: async () => [{ id: "gh", status: "pass", summary: "gh version 2.99.0" }],
		inspectCache: async () => cache(),
		cleanCache: async (apply) => {
			cleanModes.push(apply)
			return cache(apply ? { health: "missing", detail: "Removed 1 cache file." } : {})
		},
		openTarget: async (type, id, repository) => {
			opened.push({ type, id, repository })
		},
		listRepositories: async () => [{ nameWithOwner: "octo/example", pushedAt: "2026-07-29T12:00:00Z", isPrivate: true }],
		...overrides,
		opened,
		cleanModes,
	}
}

describe("CLI parser and command routing", () => {
	test("supports help, version, typo suggestions, repository parsing, and no-TTY refusal", async () => {
		const deps = dependencies()
		expect((await runCli(["--version"], deps)).stdout).toBe("9.8.7\n")
		expect((await runCli(["--help"], deps)).stdout).toContain("ghui doctor [--json]")
		expect(await runCli(["docter"], deps)).toMatchObject({ exitCode: 2, stderr: expect.stringContaining("Did you mean: ghui doctor?") })
		expect(await runCli(["--repo", "octo/example"], deps)).toMatchObject({ launchTui: true, repository: "octo/example" })
		expect(await runCli(["--repo", "bad"], deps)).toMatchObject({ exitCode: 2, stderr: expect.stringContaining("Invalid --repo") })
		expect(await runCli([], dependencies({ stdinIsTTY: false }))).toMatchObject({ exitCode: 2, launchTui: false, stderr: expect.stringContaining("interactive TTY") })
	})

	test("emits stable doctor JSON and uses failing/degraded exit semantics", async () => {
		const healthy = await runCli(["doctor", "--json"], dependencies())
		expect(healthy.exitCode).toBe(0)
		expect(JSON.parse(healthy.stdout)).toEqual({
			status: "healthy",
			checks: [{ id: "gh", status: "pass", summary: "gh version 2.99.0" }],
		})
		const degradedChecks: readonly DoctorCheck[] = [{ id: "repository", status: "warn", summary: "not in a GitHub repository" }]
		expect(await runCli(["doctor"], dependencies({ doctor: async () => degradedChecks }))).toMatchObject({ exitCode: 0, stdout: expect.stringContaining("degraded") })
		const failingChecks: readonly DoctorCheck[] = [{ id: "auth", status: "fail", summary: "authentication failed" }]
		expect(await runCli(["doctor"], dependencies({ doctor: async () => failingChecks }))).toMatchObject({ exitCode: 1, stdout: expect.stringContaining("failing") })
	})

	test("keeps cache cleanup dry-run by default and requires an explicit apply flag", async () => {
		const deps = dependencies()
		expect(await runCli(["cache", "list", "--json"], deps)).toMatchObject({ exitCode: 0 })
		expect(JSON.parse((await runCli(["cache", "list", "--json"], deps)).stdout).health).toBe("healthy")
		await runCli(["cache", "clean"], deps)
		await runCli(["cache", "clean", "--apply"], deps)
		expect(deps.cleanModes).toEqual([false, true])
		expect(await runCli(["cache", "clean", "--dry-run", "--apply"], deps)).toMatchObject({ exitCode: 2 })
	})

	test("validates open targets and passes the parsed repository to the opener", async () => {
		const deps = dependencies()
		expect(await runCli(["--repo", "octo/example", "open", "issue", "42"], deps)).toMatchObject({ exitCode: 0, stdout: "Opened issue 42.\n" })
		expect(deps.opened).toEqual([{ type: "issue", id: "42", repository: "octo/example" }])
		expect(await runCli(["open", "run", "zero"], deps)).toMatchObject({ exitCode: 2, stderr: "Invalid run id: zero\n" })
		expect(await runCli(["open", "unknown", "1"], deps)).toMatchObject({ exitCode: 2 })
	})

	test("lists repositories as human-readable text or stable JSON", async () => {
		const repositories: readonly RepositorySummary[] = [{ nameWithOwner: "octo/example", pushedAt: null, isPrivate: false }]
		const deps = dependencies({ listRepositories: async () => repositories })
		expect((await runCli(["repos"], deps)).stdout).toBe("octo/example\n")
		expect(JSON.parse((await runCli(["repos", "--json"], deps)).stdout)).toEqual(repositories)
	})
})

describe("production CLI cache and open adapters", () => {
	test("maps every open target to exact gh argv", () => {
		expect(openTargetArgs("issue", "7", "octo/example")).toEqual(["issue", "view", "7", "--web", "-R", "octo/example"])
		expect(openTargetArgs("pr", "8", null)).toEqual(["pr", "view", "8", "--web"])
		expect(openTargetArgs("run", "9", null)).toEqual(["run", "view", "9", "--web"])
		expect(openTargetArgs("job", "10", null)).toEqual(["run", "view", "--job", "10", "--web"])
		expect(openTargetArgs("milestone", "11", null)).toEqual(["browse", "/milestone/11"])
		expect(openTargetArgs("release", "v1.2.3", null)).toEqual(["release", "view", "v1.2.3", "--web"])
		expect(openTargetArgs("environment", "staging us", null)).toEqual(["browse", "/deployments/activity_log?environment=staging%20us"])
	})

	test("reports healthy, corrupt, missing, and unsafe caches without following symlinks", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ghui-cli-cache-"))
		tempDirectories.push(directory)
		const path = join(directory, "cache.sqlite")
		const database = new Database(path)
		database.exec("CREATE TABLE probe (id INTEGER PRIMARY KEY)")
		database.close()
		expect((await inspectCachePath(path)).health).toBe("healthy")

		await writeFile(path, "not sqlite")
		expect((await inspectCachePath(path)).health).toBe("corrupt")
		await rm(path)
		expect((await inspectCachePath(path)).health).toBe("missing")

		const target = join(directory, "target.sqlite")
		await writeFile(target, "target")
		await symlink(target, path)
		const unsafe = await inspectCachePath(path)
		expect(unsafe.health).toBe("unsafe")
		await cleanCachePath(path, true)
		expect(await readFile(target, "utf8")).toBe("target")
	})

	test("previews exact cache targets, applies once, and is idempotent", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ghui-cli-clean-"))
		tempDirectories.push(directory)
		const path = join(directory, "cache.sqlite")
		const database = new Database(path)
		database.exec("CREATE TABLE probe (id INTEGER PRIMARY KEY)")
		database.close()
		await writeFile(`${path}-wal`, "wal")
		const preview = await cleanCachePath(path, false)
		expect(preview.entries.filter((entry) => entry.exists).map((entry) => entry.path)).toEqual([path, `${path}-wal`])
		expect((await cleanCachePath(path, true)).health).toBe("missing")
		expect((await cleanCachePath(path, true)).health).toBe("missing")
	})
})
