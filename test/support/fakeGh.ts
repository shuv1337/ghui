import { Effect, Layer, Schema } from "effect"
import { CommandError, CommandRunner, type CommandResult, JsonParseError, type RunOptions } from "../../src/services/CommandRunner.ts"

export interface FakeGhMatch {
	readonly command?: string
	readonly args?: readonly string[]
	readonly argsContain?: readonly string[]
}

export interface FakeGhResponse {
	readonly stdout?: string
	readonly stderr?: string
	readonly exitCode?: number
	readonly delayMs?: number
	readonly timeout?: boolean
}

export interface FakeGhRoute {
	readonly id: string
	readonly match: FakeGhMatch
	readonly responses: readonly FakeGhResponse[]
}

export type FakeGhInvocationStatus = "pending" | "completed" | "failed" | "cancelled"

export interface FakeGhInvocation {
	readonly sequence: number
	readonly routeId: string
	readonly command: string
	readonly args: readonly string[]
	readonly stdin: string | null
	readonly environment: Readonly<Record<string, string>>
	status: FakeGhInvocationStatus
	exitCode: number | null
	stdout: string
	stderr: string
}

export interface FakeGhOptions {
	readonly routes: readonly FakeGhRoute[]
	readonly timeoutMs?: number
	readonly environmentAllowlist?: readonly string[]
	readonly environment?: Readonly<Record<string, string | undefined>>
}

const matches = ({ command, args }: Pick<FakeGhInvocation, "command" | "args">, match: FakeGhMatch): boolean => {
	if (match.command !== undefined && command !== match.command) return false
	if (match.args !== undefined && (args.length !== match.args.length || args.some((arg, index) => arg !== match.args![index]))) return false
	if (match.argsContain !== undefined && !match.argsContain.every((expected) => args.includes(expected))) return false
	return true
}

const safeEnvironment = (allowlist: readonly string[], source: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> =>
	Object.fromEntries(
		allowlist.flatMap((key) => {
			const value = source[key]
			return value === undefined ? [] : [[key, value]]
		}),
	)

const sensitiveKey = /(?:^|[_-])(authorization|body|cookie|input|password|secret|subject|token)(?:$|[_-])/i
const sensitiveValue = /(?:gh[oprsu]_[A-Za-z0-9_]{8,}|bearer\s+[A-Za-z0-9._~-]+)/i
const sensitiveFlags = new Set(["--body", "--token", "--auth-token", "--input", "--password"])

const redactArgv = (args: readonly string[]): readonly string[] => {
	const redacted: string[] = []
	let redactNext = false
	for (const arg of args) {
		if (redactNext) {
			redacted.push("[REDACTED]")
			redactNext = false
			continue
		}
		if (sensitiveFlags.has(arg)) {
			redacted.push(arg)
			redactNext = true
			continue
		}
		const assignment = arg.match(/^([^=]+)=(.*)$/s)
		if (assignment && sensitiveKey.test(assignment[1]!)) {
			redacted.push(`${assignment[1]}=[REDACTED]`)
			continue
		}
		redacted.push(sensitiveValue.test(arg) ? "[REDACTED]" : arg)
	}
	return redacted
}

export interface FakeGhInvocationSnapshot {
	readonly sequence: number
	readonly routeId: string
	readonly command: string
	readonly args: readonly string[]
	readonly stdin: null | "[REDACTED]"
	readonly environment: Readonly<Record<string, string>>
	readonly status: FakeGhInvocationStatus
	readonly exitCode: number | null
	readonly stdout: string
	readonly stderr: string
}

export const snapshotFakeGhInvocations = (invocations: readonly FakeGhInvocation[]): readonly FakeGhInvocationSnapshot[] =>
	invocations.map((invocation) => ({
		sequence: invocation.sequence,
		routeId: invocation.routeId,
		command: invocation.command,
		args: redactArgv(invocation.args),
		stdin: invocation.stdin === null ? null : "[REDACTED]",
		environment: Object.fromEntries(
			Object.entries(invocation.environment).map(([key, value]) => [key, sensitiveKey.test(key) || sensitiveValue.test(value) ? "[REDACTED]" : value]),
		),
		status: invocation.status,
		exitCode: invocation.exitCode,
		stdout: `<captured:${invocation.stdout.length}>`,
		stderr: `<captured:${invocation.stderr.length}>`,
	}))

export const assertFakeGhSnapshotIsSafe = (snapshot: readonly FakeGhInvocationSnapshot[]): void => {
	const serialized = JSON.stringify(snapshot)
	if (sensitiveValue.test(serialized)) throw new Error("fake-gh snapshot contains a token or authorization value")
	if (/Synthetic private review body|Private notification subject|production-deploy-key/i.test(serialized)) {
		throw new Error("fake-gh snapshot contains a private body, notification subject, or workflow input")
	}
}

export const createFakeGh = ({ routes, timeoutMs = 50, environmentAllowlist = [], environment = process.env }: FakeGhOptions) => {
	const invocations: FakeGhInvocation[] = []
	const routeIndexes = new Map<string, number>()
	const capturedEnvironment = safeEnvironment(environmentAllowlist, environment)

	const run = (command: string, args: readonly string[], options?: RunOptions): Effect.Effect<CommandResult, CommandError> => {
		const route = routes.find((candidate) => matches({ command, args }, candidate.match))
		const routeId = route?.id ?? "unmatched"
		const invocation: FakeGhInvocation = {
			sequence: invocations.length + 1,
			routeId,
			command,
			args: [...args],
			stdin: options?.stdin ?? null,
			environment: capturedEnvironment,
			status: "pending",
			exitCode: null,
			stdout: "",
			stderr: "",
		}
		invocations.push(invocation)

		const execute = Effect.gen(function* () {
			if (!route) {
				invocation.status = "failed"
				return yield* new CommandError({
					command,
					args: [...args],
					detail: `No fake-gh route matched invocation ${invocation.sequence}`,
					cause: { sequence: invocation.sequence },
				})
			}

			const responseIndex = routeIndexes.get(route.id) ?? 0
			const response = route.responses[responseIndex]
			routeIndexes.set(route.id, responseIndex + 1)
			if (!response) {
				invocation.status = "failed"
				return yield* new CommandError({
					command,
					args: [...args],
					detail: `Fake-gh route ${route.id} has no response ${responseIndex + 1}`,
					cause: { routeId: route.id, responseIndex },
				})
			}

			if (response.delayMs && response.delayMs > 0) yield* Effect.sleep(`${response.delayMs} millis`)
			if (response.timeout) {
				invocation.status = "failed"
				return yield* new CommandError({
					command,
					args: [...args],
					detail: `Timed out after ${timeoutMs}ms`,
					cause: { timeoutMs },
				})
			}

			const result: CommandResult = {
				stdout: response.stdout ?? "",
				stderr: response.stderr ?? "",
				exitCode: response.exitCode ?? 0,
			}
			invocation.exitCode = result.exitCode
			invocation.stdout = result.stdout
			invocation.stderr = result.stderr
			if (result.exitCode !== 0) {
				invocation.status = "failed"
				const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`
				return yield* new CommandError({ command, args: [...args], detail, cause: detail })
			}

			invocation.status = "completed"
			return result
		})

		return execute.pipe(
			Effect.onInterrupt(() =>
				Effect.sync(() => {
					invocation.status = "cancelled"
				}),
			),
		)
	}

	const runSchema = <S extends Schema.Top>(
		schema: S,
		command: string,
		args: readonly string[],
		options?: RunOptions,
	): Effect.Effect<S["Type"], CommandError | JsonParseError | Schema.SchemaError, S["DecodingServices"]> =>
		run(command, args, options).pipe(
			Effect.flatMap((result) =>
				Effect.try({
					try: () => JSON.parse(result.stdout) as unknown,
					catch: (cause) => new JsonParseError({ command, args: [...args], stdout: result.stdout, cause }),
				}),
			),
			Effect.flatMap((value) => Schema.decodeUnknownEffect(schema)(value)),
		)

	const layer = Layer.succeed(CommandRunner, CommandRunner.of({ run, runSchema }))

	return {
		layer,
		invocations,
		snapshot: () => {
			const snapshot = snapshotFakeGhInvocations(invocations)
			assertFakeGhSnapshotIsSafe(snapshot)
			return snapshot
		},
		reset: () => {
			invocations.length = 0
			routeIndexes.clear()
		},
	}
}
