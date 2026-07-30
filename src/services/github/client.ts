import { Effect, Schema } from "effect"
import { CommandError, commandTelemetryAttributes, type CommandResult, type JsonParseError, type RunOptions } from "../CommandRunner.js"

export type GitHubError = CommandError | JsonParseError | Schema.SchemaError

export interface CommandRunnerLike {
	readonly run: (command: string, args: readonly string[], options?: RunOptions) => Effect.Effect<CommandResult, CommandError>
	readonly runSchema: <S extends Schema.Top>(
		schema: S,
		command: string,
		args: readonly string[],
		options?: RunOptions,
	) => Effect.Effect<S["Type"], CommandError | JsonParseError | Schema.SchemaError, S["DecodingServices"]>
}

export const makeGitHubClient = (command: CommandRunnerLike) => {
	const attributes = (label: string, args: readonly string[]) => ({
		...commandTelemetryAttributes("gh", args),
		"github.operation": label,
	})

	const json = <S extends Schema.Top>(label: string, schema: S, args: readonly string[], options?: RunOptions) =>
		command.runSchema(schema, "gh", args, options).pipe(Effect.withSpan(`GitHubService.${label}`, { attributes: attributes(label, args) }))

	const run = (label: string, args: readonly string[], options?: RunOptions) =>
		command.run("gh", args, options).pipe(Effect.withSpan(`GitHubService.${label}`, { attributes: attributes(label, args) }))

	const voidCommand = (label: string, args: readonly string[], options?: RunOptions) => run(label, args, options).pipe(Effect.asVoid)

	return { json, run, void: voidCommand } as const
}

export type GitHubClient = ReturnType<typeof makeGitHubClient>
