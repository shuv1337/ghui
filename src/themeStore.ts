import { Effect, Schema } from "effect"
import { readStoredConfig, updateStoredConfig, type GhuiConfig } from "./configStore.js"
import { isThemeId, type ThemeId } from "./ui/colors.js"
import { normalizeThemeConfig, type ThemeConfig } from "./themeConfig.js"
import { DiffWhitespaceMode } from "./ui/diff.js"

interface StoredConfig extends GhuiConfig {
	readonly theme?: unknown
	readonly themeMode?: unknown
	readonly darkTheme?: unknown
	readonly lightTheme?: unknown
	readonly diffWhitespaceMode?: unknown
	readonly systemThemeAutoReload?: unknown
	readonly showScrollbars?: unknown
	readonly editorCommand?: unknown
	readonly repoPaths?: unknown
}

export { configPath } from "./configStore.js"

const readThemeConfig = async (): Promise<StoredConfig> => (await readStoredConfig()).config

export const loadStoredThemeId: Effect.Effect<ThemeId> = Effect.catchCause(
	Effect.tryPromise(async () => {
		const config = await readThemeConfig()
		return isThemeId(config.theme) ? config.theme : "ghui"
	}),
	() => Effect.succeed("ghui" satisfies ThemeId),
)

export const loadStoredThemeConfig: Effect.Effect<ThemeConfig> = Effect.catchCause(
	Effect.tryPromise(async () => normalizeThemeConfig(await readThemeConfig())),
	() => Effect.succeed(normalizeThemeConfig({})),
)

export const loadStoredDiffWhitespaceMode: Effect.Effect<DiffWhitespaceMode> = Effect.catchCause(
	Effect.tryPromise(async () => {
		const config = await readThemeConfig()
		return Schema.is(DiffWhitespaceMode)(config.diffWhitespaceMode) ? config.diffWhitespaceMode : "ignore"
	}),
	() => Effect.succeed("ignore" satisfies DiffWhitespaceMode),
)

export const loadStoredSystemThemeAutoReload: Effect.Effect<boolean> = Effect.catchCause(
	Effect.tryPromise(async () => {
		const config = await readThemeConfig()
		return typeof config.systemThemeAutoReload === "boolean" ? config.systemThemeAutoReload : false
	}),
	() => Effect.succeed(false),
)

export const loadStoredShowScrollbars: Effect.Effect<boolean> = Effect.catchCause(
	Effect.tryPromise(async () => {
		const config = await readThemeConfig()
		return typeof config.showScrollbars === "boolean" ? config.showScrollbars : false
	}),
	() => Effect.succeed(false),
)

export interface StoredEditorConfig {
	readonly editorCommand: string | null
	readonly repoPaths: Readonly<Record<string, string>>
}

const parseRepoPaths = (value: unknown): Readonly<Record<string, string>> => {
	if (!value || typeof value !== "object") return {}
	const entries = Object.entries(value as Record<string, unknown>).filter(([, path]) => typeof path === "string" && path.length > 0) as [string, string][]
	return Object.fromEntries(entries)
}

export const loadStoredEditorConfig: Effect.Effect<StoredEditorConfig> = Effect.catchCause(
	Effect.tryPromise(async () => {
		const config = await readThemeConfig()
		const editorCommand = typeof config.editorCommand === "string" && config.editorCommand.trim().length > 0 ? config.editorCommand : null
		return { editorCommand, repoPaths: parseRepoPaths(config.repoPaths) }
	}),
	() => Effect.succeed({ editorCommand: null, repoPaths: {} } satisfies StoredEditorConfig),
)

export const saveStoredThemeId = (theme: ThemeId): Effect.Effect<void> =>
	Effect.tryPromise(async () => {
		await updateStoredConfig((config) => (config.themeMode !== "system" && config.theme === theme ? config : { ...config, themeMode: "fixed", theme }))
	})

export const saveStoredThemeConfig = (themeConfig: ThemeConfig): Effect.Effect<void> =>
	Effect.tryPromise(async () => {
		await updateStoredConfig((config) =>
			themeConfig.mode === "fixed"
				? { ...config, themeMode: "fixed", theme: themeConfig.theme }
				: {
						...config,
						themeMode: "system",
						darkTheme: themeConfig.darkTheme,
						lightTheme: themeConfig.lightTheme,
					},
		)
	})

export const saveStoredDiffWhitespaceMode = (diffWhitespaceMode: DiffWhitespaceMode): Effect.Effect<void> =>
	Effect.tryPromise(async () => {
		await updateStoredConfig((config) => (config.diffWhitespaceMode === diffWhitespaceMode ? config : { ...config, diffWhitespaceMode }))
	})
