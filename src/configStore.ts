import { mkdir, rename, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export const CURRENT_CONFIG_VERSION = 1

export type SortDirection = "ascending" | "descending"

export interface SurfaceViewConfig {
	readonly visibleColumns?: readonly string[]
	readonly groupBy?: string | null
	readonly sort?: {
		readonly field: string
		readonly direction: SortDirection
	}
	readonly valueFilters?: Readonly<Record<string, readonly string[]>>
}

export interface GhuiConfig extends Record<string, unknown> {
	readonly configVersion: number
	readonly surfaceViews: Readonly<Record<string, SurfaceViewConfig>>
	readonly keybindings: Readonly<Record<string, readonly string[]>>
}

export interface ConfigReadResult {
	readonly config: GhuiConfig
	readonly diagnostics: readonly string[]
	readonly migrated: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const nonEmptyStrings = (value: unknown): readonly string[] | undefined =>
	Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim().length > 0) ? value : undefined

const parseValueFilters = (value: unknown, path: string, diagnostics: string[]) => {
	if (!isRecord(value)) {
		diagnostics.push(`${path} must be an object.`)
		return undefined
	}
	const entries = Object.entries(value).flatMap(([field, values]) => {
		const parsed = nonEmptyStrings(values)
		if (!parsed) {
			diagnostics.push(`${path}.${field} must be an array of non-empty strings.`)
			return []
		}
		return [[field, parsed] as const]
	})
	return Object.fromEntries(entries)
}

const parseSurfaceView = (value: unknown, path: string, diagnostics: string[]): SurfaceViewConfig | null => {
	if (!isRecord(value)) {
		diagnostics.push(`${path} must be an object.`)
		return null
	}
	const visibleColumns = value.visibleColumns === undefined ? undefined : nonEmptyStrings(value.visibleColumns)
	if (value.visibleColumns !== undefined && !visibleColumns) diagnostics.push(`${path}.visibleColumns must be an array of non-empty strings.`)
	const groupBy = value.groupBy === null || typeof value.groupBy === "string" ? value.groupBy : undefined
	if (value.groupBy !== undefined && groupBy === undefined) diagnostics.push(`${path}.groupBy must be a string or null.`)
	const sort =
		isRecord(value.sort) && typeof value.sort.field === "string" && value.sort.field.length > 0 && (value.sort.direction === "ascending" || value.sort.direction === "descending")
			? { field: value.sort.field, direction: value.sort.direction as SortDirection }
			: undefined
	if (value.sort !== undefined && sort === undefined) diagnostics.push(`${path}.sort must contain a field and ascending or descending direction.`)
	const valueFilters = value.valueFilters === undefined ? undefined : parseValueFilters(value.valueFilters, `${path}.valueFilters`, diagnostics)
	const normalized: Record<string, unknown> = { ...value }
	if (visibleColumns) normalized.visibleColumns = visibleColumns
	else delete normalized.visibleColumns
	if (groupBy !== undefined) normalized.groupBy = groupBy
	else delete normalized.groupBy
	if (sort) normalized.sort = sort
	else delete normalized.sort
	if (valueFilters) normalized.valueFilters = valueFilters
	else delete normalized.valueFilters
	return normalized as SurfaceViewConfig
}

const parseSurfaceViews = (value: unknown, diagnostics: string[]): Readonly<Record<string, SurfaceViewConfig>> => {
	if (value === undefined) return {}
	if (!isRecord(value)) {
		diagnostics.push("surfaceViews must be an object.")
		return {}
	}
	return Object.fromEntries(
		Object.entries(value).flatMap(([surface, view]) => {
			const parsed = parseSurfaceView(view, `surfaceViews.${surface}`, diagnostics)
			return parsed ? [[surface, parsed] as const] : []
		}),
	)
}

const parseKeybindings = (value: unknown, diagnostics: string[]): Readonly<Record<string, readonly string[]>> => {
	if (value === undefined) return {}
	if (!isRecord(value)) {
		diagnostics.push("keybindings must be an object.")
		return {}
	}
	return Object.fromEntries(
		Object.entries(value).flatMap(([commandId, keys]) => {
			const parsed = nonEmptyStrings(keys)
			if (!parsed) {
				diagnostics.push(`keybindings.${commandId} must be an array of non-empty key sequences.`)
				return []
			}
			return [[commandId, parsed] as const]
		}),
	)
}

export const configDirectory = () => {
	if (process.env.GHUI_CONFIG_DIR) return process.env.GHUI_CONFIG_DIR
	if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "ghui")
	if (process.platform === "win32" && process.env.APPDATA) return join(process.env.APPDATA, "ghui")
	return join(homedir(), ".config", "ghui")
}

export const configPath = (directory = configDirectory()) => join(directory, "config.json")

export const parseStoredConfig = (text: string): ConfigReadResult => {
	const parsed = JSON.parse(text) as unknown
	const root = isRecord(parsed) ? parsed : {}
	const diagnostics: string[] = []
	const storedVersion = typeof root.configVersion === "number" && Number.isInteger(root.configVersion) && root.configVersion > 0 ? root.configVersion : null
	if (root.configVersion !== undefined && storedVersion === null) diagnostics.push("configVersion must be a positive integer.")
	if (storedVersion !== null && storedVersion > CURRENT_CONFIG_VERSION) {
		diagnostics.push(`configVersion ${storedVersion} is newer than supported version ${CURRENT_CONFIG_VERSION}; unknown fields were preserved.`)
	}
	const configVersion = storedVersion ?? CURRENT_CONFIG_VERSION
	return {
		config: {
			...root,
			configVersion,
			surfaceViews: parseSurfaceViews(root.surfaceViews, diagnostics),
			keybindings: parseKeybindings(root.keybindings, diagnostics),
		},
		diagnostics,
		migrated: storedVersion === null,
	}
}

const readStoredConfigAt = async (path: string): Promise<ConfigReadResult> => {
	const file = Bun.file(path)
	return (await file.exists())
		? parseStoredConfig(await file.text())
		: {
				config: { configVersion: CURRENT_CONFIG_VERSION, surfaceViews: {}, keybindings: {} },
				diagnostics: [],
				migrated: false,
			}
}

export const readStoredConfig = async (path = configPath()): Promise<ConfigReadResult> => readStoredConfigAt(path)

const writeStoredConfigAtomic = async (path: string, config: GhuiConfig): Promise<void> => {
	await mkdir(dirname(path), { recursive: true })
	const temporaryPath = `${path}.tmp-${process.pid}-${crypto.randomUUID()}`
	try {
		await Bun.write(temporaryPath, `${JSON.stringify(config, null, "\t")}\n`)
		await rename(temporaryPath, path)
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined)
		throw error
	}
}

let updateQueue: Promise<void> = Promise.resolve()
const configListeners = new Set<{ readonly path: string; readonly listener: (result: ConfigReadResult) => void }>()

export const subscribeStoredConfig = (listener: (result: ConfigReadResult) => void, path = configPath()): (() => void) => {
	const subscription = { path, listener }
	configListeners.add(subscription)
	return () => configListeners.delete(subscription)
}

const notifyConfigListeners = async (path: string) => {
	const result = await readStoredConfigAt(path)
	for (const subscription of configListeners) if (subscription.path === path) subscription.listener(result)
}

/**
 * Serializes read-modify-write updates and atomically replaces config.json only
 * after the complete next document has been written in the same directory.
 */
export const updateStoredConfig = (update: (config: GhuiConfig) => GhuiConfig | Promise<GhuiConfig>, path = configPath()): Promise<void> => {
	const operation = updateQueue.then(async () => {
		const current = await readStoredConfigAt(path)
		const next = await update(current.config)
		await writeStoredConfigAtomic(path, {
			...next,
			configVersion: Math.max(CURRENT_CONFIG_VERSION, next.configVersion),
			surfaceViews: next.surfaceViews ?? {},
			keybindings: next.keybindings ?? {},
		})
		await notifyConfigListeners(path)
	})
	updateQueue = operation.catch(() => undefined)
	return operation
}

export const saveSurfaceViewConfig = (surface: string, view: SurfaceViewConfig, path = configPath()): Promise<void> =>
	updateStoredConfig(
		(config) => ({
			...config,
			surfaceViews: { ...config.surfaceViews, [surface]: view },
		}),
		path,
	)

export const saveSurfaceViewPreset = (surface: string, view: SurfaceViewConfig, preset: number, path = configPath()): Promise<void> =>
	updateStoredConfig(
		(config) => ({
			...config,
			surfaceViews: { ...config.surfaceViews, [surface]: view },
			viewPreset: {
				...(isRecord(config.viewPreset) ? config.viewPreset : {}),
				[surface]: preset,
			},
		}),
		path,
	)

export const saveKeybindingOverrides = (keybindings: Readonly<Record<string, readonly string[]>>, path = configPath()): Promise<void> =>
	updateStoredConfig((config) => ({ ...config, keybindings }), path)

export const resetSurfaceViewConfig = (surface: string, path = configPath()): Promise<void> =>
	updateStoredConfig((config) => {
		const surfaceViews = { ...config.surfaceViews }
		delete surfaceViews[surface]
		const viewPreset = isRecord(config.viewPreset) ? { ...config.viewPreset } : {}
		delete viewPreset[surface]
		return { ...config, surfaceViews, viewPreset }
	}, path)

export const resetAllApplicationSettings = (path = configPath()): Promise<void> =>
	updateStoredConfig(
		(config) => ({
			...config,
			surfaceViews: {},
			keybindings: {},
			viewPreset: {},
		}),
		path,
	)
