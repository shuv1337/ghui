import { Keymap, parseBinding, type Binding } from "@ghui/keymap"
import type { AppCtx } from "../keymap/all.js"

export interface KeybindingDiagnostic {
	readonly commandId: string
	readonly severity: "error" | "warning"
	readonly message: string
}

const RESERVED = new Set(["ctrl+c", "escape"])

export const keymapCommandAliases: Readonly<Record<string, readonly string[]>> = {
	"command.open": ["command.open", "command.open-help"],
	"filter.open": ["list.filter", "actions.search"],
	"theme.open": ["list.theme", "detail.theme"],
	"detail.open": ["list.detail.open"],
	"detail.close": ["detail.close"],
	"runs.open": ["list.runs", "detail.runs"],
	"runs.refresh": ["runs.refresh"],
	"comments.open": ["list.comments", "detail.comments"],
	"comments.new": ["comments-view.new"],
	"comments.reply": ["comments-view.confirm"],
	"comments.edit": ["comments-view.edit"],
	"comments.delete": ["comments-view.delete"],
	"pullRequest.create": ["list.create-pr"],
	"pullRequest.edit": ["list.edit-pr"],
	"pullRequest.reopen": ["list.reopen-pr"],
	"pullRequest.approve": ["list.approve-pr"],
	"pullRequest.reviewers": ["list.reviewers"],
	"pullRequest.base": ["list.base"],
	"issue.create": ["list.create-issue"],
	"issue.edit": ["list.edit-issue"],
	"issue.reopen": ["list.reopen-issue"],
	"issue.delete": ["list.delete-issue"],
	"issue.close": ["list.close-issue"],
	"issue.open-browser": ["list.issue-open-browser"],
	"issue.copy-metadata": ["list.issue-copy"],
	"pull.submit-review": ["list.review", "detail.review", "diff.submit-review"],
	"pull.labels": ["list.labels", "detail.labels"],
	"pull.merge": ["list.merge", "detail.merge"],
	"pull.close": ["list.close-pr"],
	"pull.open-browser": ["list.open-browser"],
	"pull.open-editor": ["list.open-editor", "detail.open-editor", "diff.open-editor"],
	"pull.toggle-draft": ["list.toggle-draft", "detail.toggle-draft"],
	"pull.copy-metadata": ["list.copy"],
	"items.select": ["list.select-item"],
	"items.bulkEdit": ["list.bulk-edit"],
	"item.assignees": ["list.assignees"],
	"item.milestone": ["list.milestone"],
	"release.create": ["list.create-release"],
	"release.edit": ["list.edit-release"],
	"release.delete": ["list.delete-release"],
	"branch.create": ["list.create-branch"],
	"branch.delete": ["list.delete-branch"],
	"milestone.create": ["list.create-milestone"],
	"milestone.edit": ["list.edit-milestone"],
	"milestone.toggleState": ["list.toggle-milestone"],
	"milestone.delete": ["list.delete-milestone"],
	"environment.open": ["list.open-environment"],
	"notification.open": ["list.notification-open"],
	"notification.toggleReadFilter": ["list.notification-toggle-read-filter"],
	"notification.cycleTypeFilter": ["list.notification-type-filter"],
	"notification.select": ["list.notification-select"],
	"notification.markRead": ["list.notification-mark-read"],
	"notification.markSelectedRead": ["list.notification-mark-selected-read"],
	"diff.open": ["list.diff", "detail.diff"],
	"diff.toggle-range": ["diff.toggle-range"],
	"diff.toggle-view": ["diff.toggle-view"],
	"diff.toggle-wrap": ["diff.toggle-wrap"],
	"diff.reload": ["diff.reload"],
	"diff.next-thread": ["diff.next-thread"],
	"diff.previous-thread": ["diff.previous-thread"],
	"diff.changed-files": ["diff.changed-files"],
	"diff.toggle-file-panel": ["diff.toggle-file-panel"],
	"diff.next-file": ["diff.next-file"],
	"diff.previous-file": ["diff.previous-file"],
	"diff.suggest": ["diff.suggest"],
	"review.pending": ["review.pending"],
	"actions.retry": ["actions.retry"],
	"actions.cancel": ["actions.cancel"],
	"actions.dispatch": ["actions.dispatch"],
	"actions.downloadArtifact": ["actions.download-artifact"],
	"actions.cycleStatusFilter": ["actions.cycle-status-filter"],
	"actions.cycleWorkflowFilter": ["actions.cycle-workflow-filter"],
	"view.configure": ["list.configure-view"],
}

export const configuredShortcutFor = (commandId: string, fallback: string | undefined, overrides: Readonly<Record<string, readonly string[]>>): string | undefined => {
	const configured = overrides[commandId]
	return configured ? configured.join("/") : fallback
}

const sequenceKey = (value: string) =>
	parseBinding(value)
		.map((stroke) => `${stroke.ctrl ? "c" : ""}${stroke.shift ? "s" : ""}${stroke.meta ? "m" : ""}:${stroke.key}`)
		.join(" ")

export const diagnoseKeybindingOverrides = (overrides: Readonly<Record<string, readonly string[]>>, knownCommandIds: ReadonlySet<string>): readonly KeybindingDiagnostic[] => {
	const diagnostics: KeybindingDiagnostic[] = []
	const owners = new Map<string, string>()
	for (const [commandId, keys] of Object.entries(overrides)) {
		if (!knownCommandIds.has(commandId)) diagnostics.push({ commandId, severity: "warning", message: `Unknown command id ${commandId}.` })
		for (const key of keys) {
			try {
				const sequence = parseBinding(key)
				if (sequence.length === 0) {
					diagnostics.push({ commandId, severity: "error", message: "Empty key sequences are not allowed." })
					continue
				}
				if (sequence.length === 1 && RESERVED.has(key.trim().toLowerCase())) {
					diagnostics.push({ commandId, severity: "error", message: `${key} is reserved for application safety.` })
				}
				const normalized = sequenceKey(key)
				const owner = owners.get(normalized)
				if (owner && owner !== commandId) diagnostics.push({ commandId, severity: "error", message: `${key} conflicts with ${owner}.` })
				else owners.set(normalized, commandId)
			} catch (cause) {
				diagnostics.push({ commandId, severity: "error", message: cause instanceof Error ? cause.message : String(cause) })
			}
		}
	}
	const sequences = [...owners.entries()]
	for (const [left, leftOwner] of sequences) {
		for (const [right, rightOwner] of sequences) {
			if (left === right || leftOwner === rightOwner) continue
			if (right.startsWith(`${left} `))
				diagnostics.push({ commandId: rightOwner, severity: "warning", message: `Key sequence is prefixed by ${leftOwner} and waits for disambiguation.` })
		}
	}
	return diagnostics
}

export const applyKeybindingOverrides = (
	base: Keymap<AppCtx>,
	overrides: Readonly<Record<string, readonly string[]>>,
): { readonly keymap: Keymap<AppCtx>; readonly diagnostics: readonly KeybindingDiagnostic[] } => {
	const aliasOwners = new Map<string, string>()
	for (const [commandId, aliases] of Object.entries(keymapCommandAliases)) for (const alias of aliases) aliasOwners.set(alias, commandId)
	const known = new Set(Object.keys(keymapCommandAliases))
	const diagnostics = [...diagnoseKeybindingOverrides(overrides, known)]
	for (const [commandId, keys] of Object.entries(overrides)) {
		const aliases = new Set(keymapCommandAliases[commandId] ?? [])
		for (const key of keys) {
			let normalized: string
			try {
				normalized = sequenceKey(key)
			} catch {
				continue
			}
			const conflicts = base.bindings.filter((binding) => sequenceKey(formatBindingSequence(binding.sequence)) === normalized && !aliases.has(binding.meta?.id ?? ""))
			for (const conflict of conflicts) {
				diagnostics.push({
					commandId,
					severity: "warning",
					message: `${key} also belongs to ${conflict.meta?.id ?? "an anonymous default binding"}; scope determines which command runs.`,
				})
			}
		}
	}
	const invalid = new Set(diagnostics.filter((entry) => entry.severity === "error").map((entry) => entry.commandId))
	const bindings: Binding<AppCtx>[] = []
	for (const binding of base.bindings) {
		const commandId = binding.meta?.id ? aliasOwners.get(binding.meta.id) : undefined
		const keys = commandId ? overrides[commandId] : undefined
		if (!commandId || !keys || invalid.has(commandId)) {
			bindings.push(binding)
			continue
		}
		if (bindings.some((candidate) => candidate.meta?.id === binding.meta?.id)) continue
		for (const key of keys) bindings.push({ ...binding, sequence: parseBinding(key) })
	}
	return { keymap: new Keymap(bindings), diagnostics }
}

const formatBindingSequence = (sequence: readonly { readonly key: string; readonly ctrl: boolean; readonly shift: boolean; readonly meta: boolean }[]) =>
	sequence.map((stroke) => [stroke.ctrl ? "ctrl" : "", stroke.shift ? "shift" : "", stroke.meta ? "meta" : "", stroke.key].filter(Boolean).join("+")).join(" ")
