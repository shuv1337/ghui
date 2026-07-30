import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { currentReleaseTargetId, findReleaseTarget, releaseTargets } from "./release-targets.js"

const root = process.cwd()
const requestedTargetId = process.argv[2]
const releaseDir = process.argv[3] ?? join(root, "dist", "release")

const run = (cmd: readonly string[]) => {
	const proc = Bun.spawnSync({ cmd: [...cmd], cwd: root, stdout: "inherit", stderr: "inherit" })
	if (proc.exitCode !== 0) throw new Error(`Command failed (${proc.exitCode}): ${cmd.join(" ")}`)
}

const sha256 = async (path: string) => {
	const hasher = new Bun.CryptoHasher("sha256")
	hasher.update(await Bun.file(path).arrayBuffer())
	return hasher.digest("hex")
}

const selectedTargets = () => {
	if (requestedTargetId === "all") return releaseTargets

	const targetId = requestedTargetId ?? currentReleaseTargetId()
	const target = findReleaseTarget(targetId)
	if (!target) throw new Error(`Unsupported standalone target: ${targetId ?? "unknown"}`)
	return [target]
}

await rm(releaseDir, { recursive: true, force: true })
await mkdir(releaseDir, { recursive: true })

const checksums: string[] = []
const hostTargetId = currentReleaseTargetId()

for (const target of selectedTargets()) {
	const stageDir = join(releaseDir, target.id)
	const binaryPath = join(stageDir, "ghui")
	const assetName = `ghui-${target.id}.tar.gz`
	const assetPath = join(releaseDir, assetName)

	await mkdir(stageDir, { recursive: true })
	run(["bun", "build", "--compile", "--bytecode", "--format=esm", `--target=${target.bunTarget}`, `--outfile=${binaryPath}`, "src/standalone.ts"])
	await chmod(binaryPath, 0o755)

	if (target.id === hostTargetId) {
		const smokeDirectory = await mkdtemp(join(tmpdir(), "ghui-standalone-smoke-"))
		try {
			const smokeEnvironment = { ...process.env, GHUI_CACHE_PATH: "off" }
			const version = Bun.spawnSync({ cmd: [binaryPath, "--version"], cwd: smokeDirectory, env: smokeEnvironment, stdout: "pipe", stderr: "pipe" })
			if (version.exitCode !== 0) throw new Error(`Standalone version smoke failed for ${target.id}: ${version.stderr.toString()}`)
			const help = Bun.spawnSync({ cmd: [binaryPath, "--help"], cwd: smokeDirectory, env: smokeEnvironment, stdout: "pipe", stderr: "pipe" })
			if (help.exitCode !== 0 || !help.stdout.toString().includes("ghui doctor")) throw new Error(`Standalone help smoke failed for ${target.id}: ${help.stderr.toString()}`)
			const cache = Bun.spawnSync({ cmd: [binaryPath, "cache", "list", "--json"], cwd: smokeDirectory, env: smokeEnvironment, stdout: "pipe", stderr: "pipe" })
			if (cache.exitCode !== 0 || !cache.stdout.toString().includes('"health": "disabled"'))
				throw new Error(`Standalone cache smoke failed for ${target.id}: ${cache.stdout.toString()}${cache.stderr.toString()}`)
			const noTty = Bun.spawnSync({ cmd: [binaryPath], cwd: smokeDirectory, env: smokeEnvironment, stdout: "pipe", stderr: "pipe" })
			if (noTty.exitCode !== 2 || !noTty.stderr.toString().includes("interactive TTY")) throw new Error(`Standalone no-TTY smoke failed for ${target.id}`)
		} finally {
			await rm(smokeDirectory, { recursive: true, force: true })
		}
	}

	run(["tar", "-czf", assetPath, "-C", stageDir, "ghui"])
	const checksumLine = `${await sha256(assetPath)}  ${assetName}`
	checksums.push(checksumLine)
	await writeFile(join(releaseDir, `${assetName}.sha256`), `${checksumLine}\n`)
}

await writeFile(join(releaseDir, "checksums.txt"), `${checksums.join("\n")}\n`)
