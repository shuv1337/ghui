import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Schema } from "effect"
import { CommandRunner, isCommandTimeoutError, JsonParseError } from "../src/services/CommandRunner.ts"
import { readGitHubFixtureJson, readGitHubFixtureText } from "./fixtures/github/index.ts"
import { createFakeGh } from "./support/fakeGh.ts"

const runWith = <A>(harness: ReturnType<typeof createFakeGh>, effect: Effect.Effect<A, unknown, CommandRunner>) =>
	Effect.runPromise(effect.pipe(Effect.provide(harness.layer)) as Effect.Effect<A>)

describe("fake-gh command harness", () => {
	test("captures exact argv, stdin, allowlisted environment, result, and order", async () => {
		const success = readGitHubFixtureJson<{ readonly viewer: { readonly login: string } }>("success.json")
		const harness = createFakeGh({
			environment: {
				GH_HOST: "github.com",
				GH_TOKEN: "ghp_fixturetoken123456",
				PATH: "/fixture/bin",
			},
			environmentAllowlist: ["GH_HOST", "GH_TOKEN"],
			routes: [
				{
					id: "viewer",
					match: { command: "gh", args: ["api", "user"] },
					responses: [{ stdout: JSON.stringify(success.viewer) }],
				},
				{
					id: "mutation",
					match: { command: "gh", argsContain: ["api", "--method", "POST"] },
					responses: [{ stdout: "created" }],
				},
			],
		})

		await runWith(
			harness,
			CommandRunner.use((runner) =>
				Effect.all([
					runner.run("gh", ["api", "user"]),
					runner.run("gh", ["api", "--method", "POST", "repos/parity-owner/parity-repo/issues", "-f", "body=Synthetic private review body"], {
						stdin: "production-deploy-key=fixture",
					}),
				]),
			),
		)

		expect(harness.invocations.map((invocation) => invocation.sequence)).toEqual([1, 2])
		expect(harness.invocations[1]).toMatchObject({
			command: "gh",
			args: ["api", "--method", "POST", "repos/parity-owner/parity-repo/issues", "-f", "body=Synthetic private review body"],
			stdin: "production-deploy-key=fixture",
			environment: { GH_HOST: "github.com", GH_TOKEN: "ghp_fixturetoken123456" },
			status: "completed",
			exitCode: 0,
			stdout: "created",
		})

		const snapshot = harness.snapshot()
		expect(snapshot[1]).toMatchObject({
			args: ["api", "--method", "POST", "repos/parity-owner/parity-repo/issues", "-f", "body=[REDACTED]"],
			stdin: "[REDACTED]",
			environment: { GH_HOST: "github.com", GH_TOKEN: "[REDACTED]" },
			stdout: "<captured:7>",
		})
		expect(JSON.stringify(snapshot)).not.toContain("Synthetic private review body")
		expect(JSON.stringify(snapshot)).not.toContain("production-deploy-key")
		expect(JSON.stringify(snapshot)).not.toContain("ghp_fixturetoken")
	})

	test("returns sequential paginated responses", async () => {
		const success = readGitHubFixtureJson<{ readonly pullRequestPages: readonly unknown[] }>("success.json")
		const harness = createFakeGh({
			routes: [
				{
					id: "pull-request-pages",
					match: { command: "gh", argsContain: ["api", "graphql"] },
					responses: success.pullRequestPages.map((page) => ({ stdout: JSON.stringify(page) })),
				},
			],
		})

		const results = await runWith(
			harness,
			CommandRunner.use((runner) =>
				Effect.all([runner.run("gh", ["api", "graphql", "-F", "first=1"]), runner.run("gh", ["api", "graphql", "-F", "first=1", "-F", "after=fixture-cursor-1"])]),
			),
		)
		expect(results.map((result) => JSON.parse(result.stdout))).toEqual(success.pullRequestPages)
	})

	test("surfaces non-zero exits, timeouts, and malformed JSON", async () => {
		const errors = readGitHubFixtureJson<{ readonly permission: { readonly exitCode: number; readonly stderr: string } }>("errors.json")
		const harness = createFakeGh({
			timeoutMs: 17,
			routes: [
				{ id: "permission", match: { argsContain: ["forbidden"] }, responses: [errors.permission] },
				{ id: "timeout", match: { argsContain: ["slow"] }, responses: [{ timeout: true }] },
				{ id: "malformed", match: { argsContain: ["malformed"] }, responses: [{ stdout: readGitHubFixtureText("malformed.txt") }] },
			],
		})

		await expect(
			runWith(
				harness,
				CommandRunner.use((runner) => runner.run("gh", ["forbidden"])),
			),
		).rejects.toMatchObject({
			_tag: "CommandError",
			detail: errors.permission.stderr,
		})
		const timeoutError = await runWith(
			harness,
			CommandRunner.use((runner) => runner.run("gh", ["slow"])),
		).catch((error: unknown) => error)
		expect(isCommandTimeoutError(timeoutError)).toBe(true)
		await expect(
			runWith(
				harness,
				CommandRunner.use((runner) => runner.runSchema(Schema.Struct({ ok: Schema.Boolean }), "gh", ["malformed"])),
			),
		).rejects.toBeInstanceOf(JsonParseError)
	})

	test("records interruption of a delayed response", async () => {
		const harness = createFakeGh({
			routes: [{ id: "delayed", match: { argsContain: ["delayed"] }, responses: [{ delayMs: 5_000, stdout: "late" }] }],
		})
		const program = CommandRunner.use((runner) => runner.run("gh", ["delayed"])).pipe(Effect.provide(harness.layer))
		const fiber = Effect.runFork(program)
		await Bun.sleep(5)
		await Effect.runPromise(Fiber.interrupt(fiber))

		expect(harness.invocations).toHaveLength(1)
		expect(harness.invocations[0]!.status).toBe("cancelled")
	})
})
