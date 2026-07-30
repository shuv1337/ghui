import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	CURRENT_CONFIG_VERSION,
	parseStoredConfig,
	readStoredConfig,
	resetAllApplicationSettings,
	resetSurfaceViewConfig,
	saveKeybindingOverrides,
	saveSurfaceViewConfig,
	saveSurfaceViewPreset,
	subscribeStoredConfig,
	updateStoredConfig,
} from "../src/configStore.ts"
const tempDirs: string[] = []

afterEach(async () => {
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
	tempDirs.length = 0
})

const useTempConfig = async (content?: string) => {
	const dir = await mkdtemp(join(tmpdir(), "ghui-config-store-"))
	tempDirs.push(dir)
	const path = join(dir, "config.json")
	if (content !== undefined) await writeFile(path, content)
	return { dir, path }
}

describe("config store", () => {
	test("migrates an unversioned config while retaining existing and unknown values", () => {
		const result = parseStoredConfig('{"theme":"nord","future":{"enabled":true}}')
		expect(result.migrated).toBe(true)
		expect(result.config).toMatchObject({
			configVersion: CURRENT_CONFIG_VERSION,
			theme: "nord",
			future: { enabled: true },
			surfaceViews: {},
			keybindings: {},
		})
	})

	test("falls back per invalid view or binding field and returns diagnostics", () => {
		const result = parseStoredConfig(
			JSON.stringify({
				configVersion: 1,
				surfaceViews: {
					releases: {
						visibleColumns: ["tag", "publishedAt"],
						groupBy: 42,
						sort: { field: "tag", direction: "sideways" },
						valueFilters: { draft: ["yes"], author: "octocat" },
					},
				},
				keybindings: { "release.create": ["c"], "release.delete": "x" },
			}),
		)
		expect(result.config.surfaceViews.releases).toEqual({
			visibleColumns: ["tag", "publishedAt"],
			valueFilters: { draft: ["yes"] },
		})
		expect(result.config.keybindings).toEqual({ "release.create": ["c"] })
		expect(result.diagnostics).toEqual([
			"surfaceViews.releases.groupBy must be a string or null.",
			"surfaceViews.releases.sort must contain a field and ascending or descending direction.",
			"surfaceViews.releases.valueFilters.author must be an array of non-empty strings.",
			"keybindings.release.delete must be an array of non-empty key sequences.",
		])
	})

	test("atomically writes versioned view and keybinding sections without dropping unknown keys", async () => {
		const { dir, path } = await useTempConfig('{"theme":"ghui","pluginState":{"answer":42}}')
		await saveSurfaceViewConfig(
			"releases",
			{
				visibleColumns: ["tag", "name"],
				groupBy: "draft",
				sort: { field: "publishedAt", direction: "descending" },
				valueFilters: { draft: ["false"] },
			},
			path,
		)
		await saveKeybindingOverrides({ "release.create": ["c"], "release.delete": ["x"] }, path)
		await updateStoredConfig((config) => ({ ...config, theme: "nord", themeMode: "fixed" }), path)

		const stored = JSON.parse(await readFile(path, "utf8"))
		expect(stored).toMatchObject({
			configVersion: CURRENT_CONFIG_VERSION,
			theme: "nord",
			themeMode: "fixed",
			pluginState: { answer: 42 },
			surfaceViews: {
				releases: {
					visibleColumns: ["tag", "name"],
					groupBy: "draft",
					sort: { field: "publishedAt", direction: "descending" },
					valueFilters: { draft: ["false"] },
				},
			},
			keybindings: { "release.create": ["c"], "release.delete": ["x"] },
		})
		expect((await readdir(dir)).filter((name) => name.includes(".tmp-"))).toEqual([])
	})

	test("serializes concurrent read-modify-write updates", async () => {
		const { path } = await useTempConfig()
		await Promise.all([
			updateStoredConfig((config) => ({ ...config, alpha: 1 }), path),
			updateStoredConfig((config) => ({ ...config, beta: 2 }), path),
			updateStoredConfig((config) => ({ ...config, gamma: 3 }), path),
		])
		expect((await readStoredConfig(path)).config).toMatchObject({ alpha: 1, beta: 2, gamma: 3 })
	})

	test("does not replace a malformed source document when an update cannot parse it", async () => {
		const { path } = await useTempConfig("{broken")
		await expect(updateStoredConfig((config) => ({ ...config, theme: "nord" }), path)).rejects.toBeDefined()
		expect(await readFile(path, "utf8")).toBe("{broken")
	})

	test("notifies runtime subscribers and resets one Surface or all settings", async () => {
		const { path } = await useTempConfig()
		const snapshots: string[] = []
		const unsubscribe = subscribeStoredConfig((result) => snapshots.push(JSON.stringify(result.config)), path)
		await saveSurfaceViewPreset("notifications", { visibleColumns: ["subject"], groupBy: "repository" }, 2, path)
		await saveKeybindingOverrides({ "notification.markRead": ["x m"] }, path)
		await resetSurfaceViewConfig("notifications", path)
		expect((await readStoredConfig(path)).config).toMatchObject({
			surfaceViews: {},
			keybindings: { "notification.markRead": ["x m"] },
		})
		await resetAllApplicationSettings(path)
		unsubscribe()
		expect((await readStoredConfig(path)).config).toMatchObject({ surfaceViews: {}, keybindings: {} })
		expect(snapshots).toHaveLength(4)
	})

	test("scopes runtime subscribers and transactions to their captured config path", async () => {
		const first = await useTempConfig()
		const snapshots: string[] = []
		const unsubscribe = subscribeStoredConfig((result) => snapshots.push(JSON.stringify(result.config)), first.path)
		const second = await useTempConfig()
		await saveSurfaceViewConfig("issues", { sort: { field: "updatedAt", direction: "descending" } }, second.path)
		expect(snapshots).toEqual([])
		expect(JSON.parse(await readFile(second.path, "utf8")).surfaceViews.issues).toBeDefined()

		await saveSurfaceViewConfig("issues", { sort: { field: "updatedAt", direction: "ascending" } }, first.path)
		unsubscribe()
		expect(snapshots).toHaveLength(1)
	})
})
