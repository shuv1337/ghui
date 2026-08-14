import { readFile } from "node:fs/promises"
import { describe, expect, test } from "bun:test"
import {
	type DiscoverRepositoryContextInput,
	MINIMUM_JJ_VERSION,
	discoverRepositoryContext,
	isColocatedJjWorkspace,
	isSupportedJjVersion,
	jjObservationalArgs,
	parseJjRemoteList,
	parseJjVersion,
	repositoryContextDoctorChecks,
	resolveRepositoryScope,
	type SyncCommandResult,
	type SyncCommandRunner,
} from "../src/services/RepositoryContext.ts"

const ok = (stdout: string): SyncCommandResult => ({ exitCode: 0, stdout, stderr: "" })
const fail = (stderr = "failed", exitCode = 1): SyncCommandResult => ({ exitCode, stdout: "", stderr })

const scripted = (
	scripts: Record<string, SyncCommandResult | ((args: readonly string[]) => SyncCommandResult)>,
): { readonly runner: SyncCommandRunner; readonly calls: readonly (readonly string[])[] } => {
	const calls: string[][] = []
	const runner: SyncCommandRunner = (command, args) => {
		calls.push([command, ...args])
		const exact = scripts[[command, ...args].join(" ")]
		if (typeof exact === "function") return exact(args)
		if (exact) return exact
		if (command === "jj" && args[0] === "--version") {
			const version = scripts["jj --version"]
			if (version && typeof version !== "function") return version
		}
		return fail("not found", 127)
	}
	return { runner, calls }
}

const discover = (scripts: Record<string, SyncCommandResult>, input: Omit<DiscoverRepositoryContextInput, "runner"> = {}) => {
	const scriptedRunner = scripted(scripts)
	return { ...discoverRepositoryContext({ ...input, runner: scriptedRunner.runner }), calls: scriptedRunner.calls }
}

const jj = (subcommand: readonly string[], stdout: string) => [`jj ${jjObservationalArgs(...subcommand).join(" ")}`, ok(stdout)] as const

describe("JJ version contract", () => {
	test("parses jj --version and compares against the documented minimum", () => {
		expect(parseJjVersion("jj 0.40.0\n")).toBe("0.40.0")
		expect(parseJjVersion("jj 0.32.0-deadbeef")).toBe("0.32.0")
		expect(parseJjVersion("not jj")).toBeNull()
		expect(isSupportedJjVersion("0.32.0")).toBe(true)
		expect(isSupportedJjVersion("0.31.9")).toBe(false)
		expect(MINIMUM_JJ_VERSION).toBe("0.32.0")
	})
})

describe("parseJjRemoteList", () => {
	test("parses name/url pairs from jj git remote list", () => {
		expect(parseJjRemoteList("origin git@github.com:shuv1337/ghui.git\nupstream git@github.com:kitlangton/ghui.git\n")).toEqual([
			{ name: "origin", url: "git@github.com:shuv1337/ghui.git", githubRepository: "shuv1337/ghui" },
			{ name: "upstream", url: "git@github.com:kitlangton/ghui.git", githubRepository: "kitlangton/ghui" },
		])
	})

	test("ignores malformed remote lines", () => {
		expect(parseJjRemoteList("origin\n\njust-a-name")).toEqual([])
	})
})

describe("discoverRepositoryContext", () => {
	test("never shells out in mock mode", () => {
		const { runner, calls } = scripted({
			"jj --version": ok("jj 0.40.0\n"),
			"git remote": ok("origin\n"),
		})
		const snapshot = discoverRepositoryContext({ mock: true, runner })
		expect(snapshot).toMatchObject({ localKind: "none", githubRepository: null, remotes: [] })
		expect(calls).toEqual([])
	})

	test("keeps explicit --repo as GitHub scope without changing local kind", () => {
		const snapshot = discover(
			{
				"jj --version": fail("not found", 127),
				"git remote": ok("origin\n"),
				"git remote get-url origin": ok("git@github.com:shuv1337/ghui.git\n"),
				"git rev-parse --show-toplevel": ok("/repo\n"),
				"git rev-parse --absolute-git-dir": ok("/repo/.git\n"),
			},
			{ explicitRepository: "kitlangton/ghui" },
		)
		expect(snapshot.localKind).toBe("git")
		expect(snapshot.githubRepository).toBe("kitlangton/ghui")
	})

	test("detects a colocated JJ workspace and browses origin first", () => {
		const snapshot = discover({
			"jj --version": ok("jj 0.40.0\n"),
			[jj(["root"], "/repo\n")[0]]: jj(["root"], "/repo\n")[1],
			[jj(["git", "root"], "/repo/.git\n")[0]]: jj(["git", "root"], "/repo/.git\n")[1],
			[jj(["git", "remote", "list"], "origin git@github.com:shuv1337/ghui.git\nupstream git@github.com:kitlangton/ghui.git\n")[0]]: jj(
				["git", "remote", "list"],
				"origin git@github.com:shuv1337/ghui.git\nupstream git@github.com:kitlangton/ghui.git\n",
			)[1],
			[jj(["config", "get", 'revset-aliases."trunk()"'], "main@upstream\n")[0]]: jj(["config", "get", 'revset-aliases."trunk()"'], "main@upstream\n")[1],
		})
		expect(snapshot.localKind).toBe("jj")
		expect(snapshot.workspaceRoot).toBe("/repo")
		expect(snapshot.storeRoot).toBe("/repo/.git")
		expect(isColocatedJjWorkspace(snapshot.workspaceRoot, snapshot.storeRoot)).toBe(true)
		expect(snapshot.githubRepository).toBe("shuv1337/ghui")
		expect(snapshot.reviewRepository).toBe("kitlangton/ghui")
		expect(snapshot.pushRemote?.name).toBe("origin")
		expect(snapshot.trunkRevision).toBe("main@upstream")
		expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "ambiguous-roles")).toBe(true)
		expect(snapshot.calls[0]).toEqual(["jj", "--version"])
		expect(snapshot.calls[1]).toEqual(["jj", ...jjObservationalArgs("root")])
		expect(snapshot.calls.some((call) => call[0] === "git")).toBe(false)
	})

	test("detects a non-colocated JJ workspace without consulting git", () => {
		const snapshot = discover({
			"jj --version": ok("jj 0.40.0\n"),
			[jj(["root"], "/workspace\n")[0]]: jj(["root"], "/workspace\n")[1],
			[jj(["git", "root"], "/store/git\n")[0]]: jj(["git", "root"], "/store/git\n")[1],
			[jj(["git", "remote", "list"], "origin git@github.com:owner/repo.git\n")[0]]: jj(["git", "remote", "list"], "origin git@github.com:owner/repo.git\n")[1],
			[jj(["config", "get", 'revset-aliases."trunk()"'], "")[0]]: fail("unset"),
		})
		expect(snapshot.localKind).toBe("jj")
		expect(isColocatedJjWorkspace(snapshot.workspaceRoot, snapshot.storeRoot)).toBe(false)
		expect(snapshot.githubRepository).toBe("owner/repo")
		expect(snapshot.calls.some((call) => call[0] === "git")).toBe(false)
	})

	test("falls back to ordinary Git remotes when jj is missing", () => {
		const snapshot = discover({
			"jj --version": fail("not found", 127),
			"git remote": ok("upstream\norigin\n"),
			"git remote get-url origin": ok("git@github.com:shuv1337/ghui.git\n"),
			"git remote get-url upstream": ok("git@github.com:kitlangton/ghui.git\n"),
			"git rev-parse --show-toplevel": ok("/repo\n"),
			"git rev-parse --absolute-git-dir": ok("/repo/.git\n"),
		})
		expect(snapshot.localKind).toBe("git")
		expect(snapshot.githubRepository).toBe("shuv1337/ghui")
		expect(snapshot.workspaceRoot).toBe("/repo")
		expect(snapshot.jjVersion).toBeNull()
	})

	test("treats a Git repository with no remotes as git without a GitHub scope", () => {
		const snapshot = discover({
			"jj --version": fail("not found", 127),
			"git remote": ok(""),
			"git rev-parse --show-toplevel": ok("/repo\n"),
			"git rev-parse --absolute-git-dir": ok("/repo/.git\n"),
		})
		expect(snapshot.localKind).toBe("git")
		expect(snapshot.githubRepository).toBeNull()
		expect(snapshot.remotes).toEqual([])
	})

	test("returns no VCS when jj and git are absent", () => {
		const snapshot = discover({
			"jj --version": fail("not found", 127),
			"git remote": fail("not a git repository", 128),
			"git rev-parse --show-toplevel": fail("not a git repository", 128),
		})
		expect(snapshot.localKind).toBe("none")
		expect(snapshot.githubRepository).toBeNull()
	})

	test("records an unsupported JJ version without losing the workspace", () => {
		const snapshot = discover({
			"jj --version": ok("jj 0.20.0\n"),
			[jj(["root"], "/repo\n")[0]]: jj(["root"], "/repo\n")[1],
			[jj(["git", "root"], "/repo/.git\n")[0]]: jj(["git", "root"], "/repo/.git\n")[1],
			[jj(["git", "remote", "list"], "origin git@github.com:owner/repo.git\n")[0]]: jj(["git", "remote", "list"], "origin git@github.com:owner/repo.git\n")[1],
			[jj(["config", "get", 'revset-aliases."trunk()"'], "main@origin\n")[0]]: jj(["config", "get", 'revset-aliases."trunk()"'], "main@origin\n")[1],
		})
		expect(snapshot.localKind).toBe("jj")
		expect(snapshot.jjVersion).toBe("0.20.0")
		expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "unsupported-jj-version")).toBe(true)
		expect(snapshot.githubRepository).toBe("owner/repo")
	})

	test("does not crash on malformed remote output", () => {
		const snapshot = discover({
			"jj --version": fail("not found", 127),
			"git remote": ok("origin\n"),
			"git remote get-url origin": ok("not a url\n"),
			"git rev-parse --show-toplevel": ok("/repo\n"),
			"git rev-parse --absolute-git-dir": ok("/repo/.git\n"),
		})
		expect(snapshot.localKind).toBe("git")
		expect(snapshot.githubRepository).toBeNull()
		expect(snapshot.remotes[0]).toMatchObject({ name: "origin", githubRepository: null })
	})
})

describe("resolveRepositoryScope", () => {
	test("prefers explicit --repo over detected remotes", () => {
		const context = discoverRepositoryContext({
			mock: true,
		})
		expect(resolveRepositoryScope("octo/example", { ...context, githubRepository: "detected/repo" })).toBe("octo/example")
		expect(resolveRepositoryScope(null, { ...context, githubRepository: "detected/repo" })).toBe("detected/repo")
	})
})

describe("repositoryContextDoctorChecks", () => {
	test("does not degrade GitHub-only doctor when jj is absent", () => {
		expect(repositoryContextDoctorChecks(discoverRepositoryContext({ mock: true }))).toEqual([
			{ id: "jj", status: "pass", summary: "not installed", detail: "optional for GitHub-only mode" },
		])
	})

	test("warns on unsupported versions and ambiguous roles", () => {
		const checks = repositoryContextDoctorChecks(
			discover({
				"jj --version": ok("jj 0.20.0\n"),
				[jj(["root"], "/repo\n")[0]]: jj(["root"], "/repo\n")[1],
				[jj(["git", "root"], "/repo/.git\n")[0]]: jj(["git", "root"], "/repo/.git\n")[1],
				[jj(["git", "remote", "list"], "origin git@github.com:shuv1337/ghui.git\nupstream git@github.com:kitlangton/ghui.git\n")[0]]: jj(
					["git", "remote", "list"],
					"origin git@github.com:shuv1337/ghui.git\nupstream git@github.com:kitlangton/ghui.git\n",
				)[1],
				[jj(["config", "get", 'revset-aliases."trunk()"'], "main@upstream\n")[0]]: jj(["config", "get", 'revset-aliases."trunk()"'], "main@upstream\n")[1],
			}),
		)
		expect(checks.find((check) => check.id === "jj")).toMatchObject({ status: "warn", summary: `jj 0.20.0 is below ${MINIMUM_JJ_VERSION}` })
		expect(checks.find((check) => check.id === "jj-workspace")).toMatchObject({ status: "warn", summary: "colocated" })
	})
})

describe("documentation contract", () => {
	test("README documents the same minimum JJ version doctor reports", async () => {
		const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")
		expect(readme).toContain(MINIMUM_JJ_VERSION)
	})
})
