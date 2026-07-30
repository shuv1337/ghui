const runtimeIsolatedTests = [
	"test/actionsSurface.test.tsx",
	"test/bulkItemSurface.test.tsx",
	"test/itemManagementSurface.test.tsx",
	"test/notificationsSurface.test.tsx",
	"test/pullRequestViewAtoms.test.ts",
	"test/releasesSurface.test.tsx",
	"test/repositoryResourcesSurface.test.tsx",
	"test/scrolling.test.tsx",
	"test/smallTerminal.test.tsx",
] as const

const run = (args: readonly string[]) => {
	const result = Bun.spawnSync({
		cmd: [process.execPath, "test", ...args],
		stdout: "inherit",
		stderr: "inherit",
	})
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

run(["test", ...runtimeIsolatedTests.map((path) => `--path-ignore-patterns=${path}`)])
for (const path of runtimeIsolatedTests) run([path])
