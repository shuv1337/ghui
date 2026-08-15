import { join } from "node:path"
import { parseGitRemoteUrl, selectGithubRepository } from "../gitRemotes.js"

export const MINIMUM_JJ_VERSION = "0.32.0"

export const jjObservationalArgs = (...subcommand: readonly string[]): readonly string[] => ["--no-pager", "--color=never", "--ignore-working-copy", ...subcommand]

export interface SyncCommandResult {
	readonly exitCode: number
	readonly stdout: string
	readonly stderr: string
}

export type SyncCommandRunner = (command: string, args: readonly string[]) => SyncCommandResult

export interface LocalRemote {
	readonly name: string
	readonly url: string
	readonly githubRepository: string | null
}

export interface RepositoryContextDiagnostic {
	readonly code: string
	readonly message: string
}

export interface RepositoryContextSnapshot {
	readonly localKind: "jj" | "git" | "none"
	readonly workspaceRoot: string | null
	readonly storeRoot: string | null
	readonly githubRepository: string | null
	readonly reviewRepository: string | null
	readonly pushRemote: LocalRemote | null
	readonly trunkRevision: string | null
	readonly remotes: readonly LocalRemote[]
	readonly jjVersion: string | null
	readonly diagnostics: readonly RepositoryContextDiagnostic[]
}

export interface DiscoverRepositoryContextInput {
	readonly explicitRepository?: string | null
	readonly mock?: boolean
	readonly runner?: SyncCommandRunner
}

const emptySnapshot = (overrides: Partial<RepositoryContextSnapshot> = {}): RepositoryContextSnapshot => ({
	localKind: "none",
	workspaceRoot: null,
	storeRoot: null,
	githubRepository: null,
	reviewRepository: null,
	pushRemote: null,
	trunkRevision: null,
	remotes: [],
	jjVersion: null,
	diagnostics: [],
	...overrides,
})

export const parseJjVersion = (stdout: string): string | null => {
	const match = stdout.match(/^jj\s+(\d+)\.(\d+)\.(\d+)/m)
	return match ? `${match[1]}.${match[2]}.${match[3]}` : null
}

const versionParts = (version: string): readonly number[] | null => {
	const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
	if (!match) return null
	return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export const compareSemver = (left: string, right: string): number => {
	const leftParts = versionParts(left)
	const rightParts = versionParts(right)
	if (!leftParts || !rightParts) return 0
	for (let index = 0; index < 3; index++) {
		const delta = leftParts[index]! - rightParts[index]!
		if (delta !== 0) return delta < 0 ? -1 : 1
	}
	return 0
}

export const isSupportedJjVersion = (version: string): boolean => compareSemver(version, MINIMUM_JJ_VERSION) >= 0

export const parseJjRemoteList = (stdout: string): readonly LocalRemote[] =>
	stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			const separator = line.search(/\s+/)
			if (separator <= 0) return []
			const name = line.slice(0, separator)
			const url = line.slice(separator).trim()
			if (!name || !url) return []
			return [{ name, url, githubRepository: parseGitRemoteUrl(url) }]
		})

export const isColocatedJjWorkspace = (workspaceRoot: string | null, storeRoot: string | null): boolean =>
	workspaceRoot !== null && storeRoot !== null && (storeRoot === workspaceRoot || storeRoot === join(workspaceRoot, ".git"))

const defaultRunner: SyncCommandRunner = (command, args) => {
	try {
		const result = Bun.spawnSync({ cmd: [command, ...args], stdout: "pipe", stderr: "pipe" })
		return {
			exitCode: result.exitCode ?? 1,
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
		}
	} catch (cause) {
		return {
			exitCode: 127,
			stdout: "",
			stderr: cause instanceof Error ? cause.message : "not found",
		}
	}
}

const run = (runner: SyncCommandRunner, command: string, args: readonly string[]): SyncCommandResult => runner(command, args)

const parseGitRemoteNames = (stdout: string): readonly string[] =>
	stdout
		.split("\n")
		.map((name) => name.trim())
		.filter(Boolean)

const loadGitRemotes = (runner: SyncCommandRunner, names: readonly string[]): readonly LocalRemote[] =>
	names.flatMap((name) => {
		const url = run(runner, "git", ["remote", "get-url", name])
		if (url.exitCode !== 0) return []
		const trimmed = url.stdout.trim()
		if (!trimmed) return []
		return [{ name, url: trimmed, githubRepository: parseGitRemoteUrl(trimmed) }]
	})

const rolesFromRemotes = (
	remotes: readonly LocalRemote[],
): Pick<RepositoryContextSnapshot, "pushRemote" | "reviewRepository"> & { readonly diagnostics: readonly RepositoryContextDiagnostic[] } => {
	const origin = remotes.find((remote) => remote.name === "origin") ?? null
	const upstream = remotes.find((remote) => remote.name === "upstream") ?? null
	const pushRemote = origin ?? remotes.find((remote) => remote.githubRepository !== null) ?? remotes[0] ?? null
	const originRepo = origin?.githubRepository ?? null
	const upstreamRepo = upstream?.githubRepository ?? null
	const reviewRepository = upstreamRepo && originRepo && upstreamRepo !== originRepo ? upstreamRepo : (originRepo ?? upstreamRepo)
	const diagnostics: RepositoryContextDiagnostic[] =
		originRepo && upstreamRepo && originRepo !== upstreamRepo
			? [
					{
						code: "ambiguous-roles",
						message: `origin is ${originRepo} and upstream is ${upstreamRepo}; browse stays on origin until a mutation requires an explicit choice`,
					},
				]
			: []
	return { pushRemote, reviewRepository, diagnostics }
}

const applyExplicitRepository = (snapshot: RepositoryContextSnapshot, explicitRepository: string | null | undefined): RepositoryContextSnapshot => {
	if (!explicitRepository) return snapshot
	return { ...snapshot, githubRepository: explicitRepository }
}

export const discoverRepositoryContext = (input: DiscoverRepositoryContextInput = {}): RepositoryContextSnapshot => {
	if (input.mock) return applyExplicitRepository(emptySnapshot(), input.explicitRepository)
	const runner = input.runner ?? defaultRunner
	const diagnostics: RepositoryContextDiagnostic[] = []

	const versionResult = run(runner, "jj", ["--version"])
	const jjVersion = versionResult.exitCode === 0 ? parseJjVersion(versionResult.stdout) : null
	if (versionResult.exitCode === 0 && !jjVersion) {
		diagnostics.push({ code: "jj-unparseable-version", message: "jj --version did not include a recognizable semver" })
	} else if (jjVersion && !isSupportedJjVersion(jjVersion)) {
		diagnostics.push({
			code: "unsupported-jj-version",
			message: `jj ${jjVersion} is below the minimum supported version ${MINIMUM_JJ_VERSION}`,
		})
	}

	if (versionResult.exitCode === 0) {
		const root = run(runner, "jj", jjObservationalArgs("root"))
		const workspaceRoot = root.exitCode === 0 ? root.stdout.trim() || null : null
		if (workspaceRoot) {
			const gitRoot = run(runner, "jj", jjObservationalArgs("git", "root"))
			const remotesResult = run(runner, "jj", jjObservationalArgs("git", "remote", "list"))
			const remotes = remotesResult.exitCode === 0 ? parseJjRemoteList(remotesResult.stdout) : []
			const trunkResult = run(runner, "jj", jjObservationalArgs("config", "get", 'revset-aliases."trunk()"'))
			const roles = rolesFromRemotes(remotes)
			return applyExplicitRepository(
				{
					localKind: "jj",
					workspaceRoot,
					storeRoot: gitRoot.exitCode === 0 ? gitRoot.stdout.trim() || null : null,
					githubRepository: selectGithubRepository(remotes),
					reviewRepository: roles.reviewRepository,
					pushRemote: roles.pushRemote,
					trunkRevision: trunkResult.exitCode === 0 ? trunkResult.stdout.trim() || null : null,
					remotes,
					jjVersion,
					diagnostics: [...diagnostics, ...roles.diagnostics],
				},
				input.explicitRepository,
			)
		}
	}

	const remoteNamesResult = run(runner, "git", ["remote"])
	if (remoteNamesResult.exitCode !== 0) {
		const toplevel = run(runner, "git", ["rev-parse", "--show-toplevel"])
		if (toplevel.exitCode !== 0) return applyExplicitRepository(emptySnapshot({ jjVersion, diagnostics }), input.explicitRepository)
		const gitDir = run(runner, "git", ["rev-parse", "--absolute-git-dir"])
		return applyExplicitRepository(
			{
				localKind: "git",
				workspaceRoot: toplevel.stdout.trim() || null,
				storeRoot: gitDir.exitCode === 0 ? gitDir.stdout.trim() || null : null,
				githubRepository: null,
				reviewRepository: null,
				pushRemote: null,
				trunkRevision: null,
				remotes: [],
				jjVersion,
				diagnostics,
			},
			input.explicitRepository,
		)
	}

	const remotes = loadGitRemotes(runner, parseGitRemoteNames(remoteNamesResult.stdout))
	const toplevel = run(runner, "git", ["rev-parse", "--show-toplevel"])
	const gitDir = run(runner, "git", ["rev-parse", "--absolute-git-dir"])
	const roles = rolesFromRemotes(remotes)
	const workspaceRoot = toplevel.exitCode === 0 ? toplevel.stdout.trim() || null : null
	return applyExplicitRepository(
		{
			localKind: workspaceRoot || remotes.length > 0 ? "git" : "none",
			workspaceRoot,
			storeRoot: gitDir.exitCode === 0 ? gitDir.stdout.trim() || null : null,
			githubRepository: selectGithubRepository(remotes),
			reviewRepository: roles.reviewRepository,
			pushRemote: roles.pushRemote,
			trunkRevision: null,
			remotes,
			jjVersion,
			diagnostics: [...diagnostics, ...roles.diagnostics],
		},
		input.explicitRepository,
	)
}

export const resolveRepositoryScope = (explicitRepository: string | null | undefined, context: RepositoryContextSnapshot): string | null =>
	explicitRepository ?? context.githubRepository

export interface RepositoryContextDoctorCheck {
	readonly id: string
	readonly status: "pass" | "warn" | "fail"
	readonly summary: string
	readonly detail?: string
}

export const repositoryContextDoctorChecks = (context: RepositoryContextSnapshot): readonly RepositoryContextDoctorCheck[] => {
	const checks: RepositoryContextDoctorCheck[] = []
	const unsupported = context.diagnostics.find((diagnostic) => diagnostic.code === "unsupported-jj-version")
	const unparseable = context.diagnostics.find((diagnostic) => diagnostic.code === "jj-unparseable-version")
	if (unparseable) {
		checks.push({ id: "jj", status: "warn", summary: "unrecognized version", detail: unparseable.message })
	} else if (unsupported && context.jjVersion) {
		checks.push({
			id: "jj",
			status: "warn",
			summary: `jj ${context.jjVersion} is below ${MINIMUM_JJ_VERSION}`,
			detail: unsupported.message,
		})
	} else if (context.jjVersion) {
		checks.push({
			id: "jj",
			status: "pass",
			summary: `jj ${context.jjVersion}`,
			...(context.localKind === "jj" && context.workspaceRoot
				? {
						detail: `${isColocatedJjWorkspace(context.workspaceRoot, context.storeRoot) ? "colocated" : "non-colocated"} ${context.workspaceRoot}`,
					}
				: { detail: "no workspace" }),
		})
	} else {
		checks.push({ id: "jj", status: "pass", summary: "not installed", detail: "optional for GitHub-only mode" })
	}

	if (context.localKind === "jj") {
		const ambiguous = context.diagnostics.find((diagnostic) => diagnostic.code === "ambiguous-roles")
		const workspaceDetail = ambiguous?.message ?? [context.workspaceRoot, context.trunkRevision ? `trunk ${context.trunkRevision}` : null].filter(Boolean).join(" · ")
		checks.push({
			id: "jj-workspace",
			status: ambiguous ? "warn" : "pass",
			summary: isColocatedJjWorkspace(context.workspaceRoot, context.storeRoot) ? "colocated" : "non-colocated",
			...(workspaceDetail ? { detail: workspaceDetail } : {}),
		})
	}

	return checks
}
