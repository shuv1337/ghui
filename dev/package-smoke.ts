import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Effect } from "effect"
import { CacheService } from "../src/services/CacheService.js"
import { binaryPackageName as binaryPackageNameForTarget, currentReleaseTargetId, findReleaseTarget } from "./release-targets.js"

type CommandResult = {
	readonly stdout: string
	readonly stderr: string
	readonly exitCode: number
}

const root = process.cwd()
const rootPackageJson = (await Bun.file(join(root, "package.json")).json()) as { name: string; version: string }
const targetId = currentReleaseTargetId()
const target = findReleaseTarget(targetId)
const binaryPackageName = target ? binaryPackageNameForTarget(rootPackageJson.name, target) : null

const run = async (
	cmd: readonly string[],
	cwd: string,
	options: { readonly env?: Readonly<Record<string, string>>; readonly allowFailure?: boolean } = {},
): Promise<CommandResult> => {
	const proc = Bun.spawnSync({ cmd: [...cmd], cwd, stdout: "pipe", stderr: "pipe", ...(options.env ? { env: options.env } : {}) })
	const result = { stdout: proc.stdout.toString(), stderr: proc.stderr.toString(), exitCode: proc.exitCode }
	if (proc.exitCode !== 0 && !options.allowFailure) {
		throw new Error(`Command failed (${proc.exitCode}) in ${cwd}: ${cmd.join(" ")}\n${result.stdout}${result.stderr}`)
	}
	return result
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

const assertInstalledPackage = async (projectDir: string) => {
	const packageDir = join(projectDir, "node_modules", "@kitlangton", "ghui")
	const binaryPackageDir = binaryPackageName ? join(projectDir, "node_modules", "@kitlangton", `ghui-${targetId}`) : null
	const packageJson = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8")) as {
		dependencies?: Record<string, string>
		optionalDependencies?: Record<string, string>
		version: string
	}

	assert(packageJson.version === rootPackageJson.version, `Expected installed version ${rootPackageJson.version}, got ${packageJson.version}`)
	assert(!packageJson.dependencies?.["@ghui/keymap"], "Published package must not depend on private workspace @ghui/keymap")
	assert(binaryPackageName && packageJson.optionalDependencies?.[binaryPackageName] === rootPackageJson.version, `Published package must depend on ${binaryPackageName}`)
	assert(binaryPackageDir && (await Bun.file(join(binaryPackageDir, "bin", "ghui")).exists()), "Installed package must include the platform binary package")
	assert(!(await Bun.file(join(packageDir, "src", "index.tsx")).exists()), "Published package must not rely on src/index.tsx")

	const version = await run(["node_modules/.bin/ghui", "--version"], projectDir)
	assert(version.stdout.trim() === rootPackageJson.version, `Expected ghui --version to print ${rootPackageJson.version}, got ${JSON.stringify(version.stdout.trim())}`)

	const fakeBin = join(projectDir, "fake-bin")
	const fakeGh = join(fakeBin, "gh")
	await mkdir(fakeBin, { recursive: true })
	await writeFile(
		fakeGh,
		`#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' 'gh version 2.99.0 (smoke)'; exit 0; fi
if [ "$1" = "auth" ]; then exit 0; fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then printf '%s\\n' 'octo/example'; exit 0; fi
if [ "$1" = "repo" ] && [ "$2" = "list" ]; then printf '%s\\n' '[{"nameWithOwner":"octo/example","pushedAt":"2026-07-29T12:00:00Z","isPrivate":false}]'; exit 0; fi
if [ "$1" = "api" ]; then printf '%s\\n' '{}'; exit 0; fi
exit 0
`,
	)
	await chmod(fakeGh, 0o755)
	const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
	const environment = {
		...inheritedEnvironment,
		PATH: `${fakeBin}:${inheritedEnvironment.PATH ?? ""}`,
		GHUI_CONFIG_DIR: join(projectDir, "config"),
		GHUI_CACHE_PATH: "off",
		TERM: "xterm-256color",
	}
	const help = await run(["node_modules/.bin/ghui", "--help"], projectDir, { env: environment })
	assert(help.stdout.includes("ghui doctor [--json]"), "Installed package help must include CLI operations")
	const doctor = await run(["node_modules/.bin/ghui", "doctor", "--json"], projectDir, { env: environment })
	const doctorJson = JSON.parse(doctor.stdout) as { status?: string; checks?: readonly { id?: string }[] }
	assert(doctorJson.status === "degraded" || doctorJson.status === "healthy", "Installed doctor must return a healthy or degraded report")
	assert(
		doctorJson.checks?.some((check) => check.id === "cache"),
		"Installed doctor must inspect cache readiness",
	)
	const cache = await run(["node_modules/.bin/ghui", "cache", "list", "--json"], projectDir, { env: environment })
	assert((JSON.parse(cache.stdout) as { health?: string }).health === "disabled", "Installed cache list must honor GHUI_CACHE_PATH=off")
	const repositories = await run(["node_modules/.bin/ghui", "repos", "--json"], projectDir, { env: environment })
	assert((JSON.parse(repositories.stdout) as readonly unknown[]).length === 1, "Installed repos command must return the fake GitHub repository")
	await run(["node_modules/.bin/ghui", "--repo", "octo/example", "open", "issue", "7"], projectDir, { env: environment })
	const noTty = await run(["node_modules/.bin/ghui"], projectDir, { env: environment, allowFailure: true })
	assert(noTty.exitCode === 2 && noTty.stderr.includes("interactive TTY"), "Installed package must refuse a non-interactive bare launch")
}

const assertCacheServiceOpens = async () => {
	const dir = await mkdtemp(join(tmpdir(), "ghui-cache-smoke-"))
	try {
		const cached = await Effect.runPromise(
			Effect.gen(function* () {
				const cache = yield* CacheService
				return yield* cache.readQueue("smoke", { _tag: "Queue", mode: "authored", repository: null })
			}).pipe(Effect.provide(CacheService.layerSqliteFile(join(dir, "cache.sqlite")))),
		)
		assert(cached === null, "New cache database should start empty")
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

const tempRoot = await mkdtemp(join(tmpdir(), "ghui-package-smoke-"))
try {
	const packDir = join(tempRoot, "pack")
	const npmProject = join(tempRoot, "npm-install")
	const bunProject = join(tempRoot, "bun-install")
	const bunCache = join(tempRoot, "bun-cache")
	await Promise.all([mkdir(packDir, { recursive: true }), mkdir(npmProject, { recursive: true }), mkdir(bunProject, { recursive: true }), mkdir(bunCache, { recursive: true })])
	await Promise.all(
		[npmProject, bunProject].map((projectDir) =>
			writeFile(join(projectDir, "package.json"), `${JSON.stringify({ name: "ghui-package-smoke", version: "0.0.0", private: true }, null, "\t")}\n`),
		),
	)

	assert(binaryPackageName, `Unsupported package smoke platform: ${process.platform}-${process.arch}`)
	await assertCacheServiceOpens()
	await run(["bun", "run", "build:npm-packages"], root)

	const packPackage = async (cwd: string) => {
		const pack = await run(["npm", "pack", "--pack-destination", packDir], cwd)
		const packLines = pack.stdout.trim().split("\n")
		const tarballName = packLines[packLines.length - 1]
		assert(typeof tarballName === "string" && tarballName.endsWith(".tgz"), `Could not determine packed tarball from npm pack output: ${pack.stdout}`)
		return join(packDir, tarballName)
	}

	const binaryTarballPath = await packPackage(join(root, "dist", "npm", "binaries", targetId!))
	const mainTarballPath = await packPackage(join(root, "dist", "npm", "main"))

	// Pass the target explicitly as well as using cwd. Some embedded Node/npm
	// runtimes do not preserve a spawned cwd when resolving an otherwise empty
	// install project, which can make npm succeed without populating this path.
	await run(["npm", "install", "--omit", "optional", "--prefix", npmProject, mainTarballPath], npmProject)
	await run(["npm", "install", "--force", "--no-package-lock", "--prefix", npmProject, binaryTarballPath], npmProject)
	await assertInstalledPackage(npmProject)

	// Install the local binary as a direct dependency first. Bun otherwise
	// deduplicates the same-version optional dependency from the registry before
	// the local tarball can replace it.
	await run(["bun", "add", "--cwd", bunProject, "--cache-dir", bunCache, binaryTarballPath], bunProject)
	await run(["bun", "add", "--omit", "optional", "--cwd", bunProject, "--cache-dir", bunCache, mainTarballPath], bunProject)
	await assertInstalledPackage(bunProject)
} finally {
	await rm(tempRoot, { recursive: true, force: true })
}
