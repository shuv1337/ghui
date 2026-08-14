import { describe, expect, test } from "bun:test"
import { formatSequence } from "@ghui/keymap"
import { appKeymap } from "../src/keymap/all.ts"
import { applyKeybindingOverrides, configuredShortcutFor, diagnoseKeybindingOverrides, keymapCommandAliases, validateKeymapCommandAliases } from "../src/settings/keybindings.ts"
import { applySurfaceView, normalizeSurfaceView, surfaceColumnSchemas } from "../src/settings/viewConfig.ts"

describe("saved Surface views", () => {
	test("declares columns for every registered Surface and removes renamed fields recoverably", () => {
		expect(Object.keys(surfaceColumnSchemas).sort()).toEqual(
			["repos", "pullRequests", "changes", "issues", "releases", "actions", "branches", "milestones", "environments", "runners", "notifications"].sort(),
		)
		const normalized = normalizeSurfaceView("notifications", {
			visibleColumns: ["subject", "removedColumn", "repository"],
			groupBy: "repository",
			sort: { field: "updatedAt", direction: "descending" },
			valueFilters: { unread: ["true"], stale: ["yes"] },
		})
		expect(normalized.view).toEqual({
			visibleColumns: ["subject", "repository"],
			groupBy: "repository",
			sort: { field: "updatedAt", direction: "descending" },
			valueFilters: { unread: ["true"] },
		})
		expect(normalized.diagnostics).toHaveLength(2)
	})

	test("composes value filtering, sorting, and grouping deterministically", () => {
		const rows = [
			{ id: "a", repository: "z/repo", unread: true, updatedAt: new Date("2026-01-01") },
			{ id: "b", repository: "a/repo", unread: false, updatedAt: new Date("2026-01-03") },
			{ id: "c", repository: "a/repo", unread: true, updatedAt: new Date("2026-01-02") },
		]
		expect(
			applySurfaceView(
				rows,
				{
					groupBy: "repository",
					sort: { field: "updatedAt", direction: "descending" },
					valueFilters: { unread: ["true"] },
				},
				"notifications",
			).map((row) => row.id),
		).toEqual(["c", "a"])
	})

	test("resolves schema aliases against each Surface's domain model", () => {
		expect(
			applySurfaceView(
				[
					{ repository: "a/repo", pullRequestCount: 2, issueCount: 1, lastActivityAt: new Date("2026-01-01") },
					{ repository: "b/repo", pullRequestCount: 9, issueCount: 3, lastActivityAt: new Date("2026-01-02") },
				],
				{ sort: { field: "pullRequests", direction: "descending" } },
				"repos",
			).map((row) => row.repository),
		).toEqual(["b/repo", "a/repo"])
	})
})

describe("configurable keybindings", () => {
	test("keeps shortcut commands and keymap aliases in sync", () => {
		const probe = Bun.spawnSync({
			cmd: [
				process.execPath,
				"-e",
				'import { globalCommands } from "./src/commands/builtins.ts"; console.log(JSON.stringify(globalCommands.map(({ id, shortcut }) => ({ id, shortcut }))))',
			],
			cwd: new URL("..", import.meta.url).pathname,
		})
		if (probe.exitCode !== 0) throw new Error(new TextDecoder().decode(probe.stderr))
		const commands = JSON.parse(new TextDecoder().decode(probe.stdout)) as readonly { readonly id: string; readonly shortcut?: string }[]
		expect(validateKeymapCommandAliases(appKeymap, commands)).toEqual([])
		expect(validateKeymapCommandAliases(appKeymap, [...commands, { id: "unmapped.probe", shortcut: "z" }])).toContainEqual({
			commandId: "unmapped.probe",
			message: "shortcut command has no keymap alias or explicit exclusion",
		})
	})

	test("diagnoses invalid, reserved, colliding, ambiguous, and unknown bindings", () => {
		const diagnostics = diagnoseKeybindingOverrides(
			{
				"release.create": ["ctrl+c"],
				"release.edit": ["g"],
				"release.delete": ["g x"],
				"branch.create": ["alt+c"],
				"unknown.command": ["z"],
				"branch.delete": ["g"],
			},
			new Set(Object.keys(keymapCommandAliases)),
		)
		expect(diagnostics.some((entry) => entry.message.includes("reserved"))).toBe(true)
		expect(diagnostics.some((entry) => entry.message.includes("Unknown modifier"))).toBe(true)
		expect(diagnostics.some((entry) => entry.message.includes("Unknown command"))).toBe(true)
		expect(diagnostics.some((entry) => entry.message.includes("conflicts"))).toBe(true)
		expect(diagnostics.some((entry) => entry.message.includes("prefixed"))).toBe(true)
	})

	test("replaces a command's old key while preserving its scope and action", () => {
		const configured = applyKeybindingOverrides(appKeymap, { "release.create": ["g c"] })
		const bindings = configured.keymap.bindings.filter((binding) => binding.meta?.id === "list.create-release")
		expect(bindings.map((binding) => formatSequence(binding.sequence))).toEqual(["g c"])
		expect(configured.keymap.bindings.some((binding) => binding.meta?.id === "list.create-release" && formatSequence(binding.sequence) === "c")).toBe(false)
	})

	test("uses command-id overrides for palette shortcut display", () => {
		expect(configuredShortcutFor("release.create", "c", { "release.create": ["g c", "shift+c"] })).toBe("g c/shift+c")
		expect(configuredShortcutFor("release.edit", "e", {})).toBe("e")
	})

	test("keeps same-key overrides scoped to their command routes", () => {
		const configured = applyKeybindingOverrides(appKeymap, {
			"release.create": ["g c"],
			"branch.create": ["b c"],
		})
		expect(
			configured.keymap.bindings
				.filter((binding) => binding.meta?.id === "list.create-release" || binding.meta?.id === "list.create-branch")
				.map((binding) => [binding.meta?.id, formatSequence(binding.sequence)]),
		).toEqual([
			["list.create-release", "g c"],
			["list.create-branch", "b c"],
		])
	})
})
