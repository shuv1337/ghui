import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { errorMessage } from "../errors.js"
import { BrowserOpener } from "../services/BrowserOpener.js"
import { Clipboard } from "../services/Clipboard.js"
import { EditorOpener } from "../services/EditorOpener.js"
import { GitHubService } from "../services/GitHubService.js"
import { saveStoredDiffWhitespaceMode } from "../themeStore.js"
import { commentsViewActiveAtom, selectedCommentKeyAtom } from "../ui/comments/atoms.js"
import { detailFullViewAtom, detailScrollOffsetAtom } from "../ui/detail/atoms.js"
import { diffCommentRangeStartIndexAtom, diffFullViewAtom, diffRenderViewAtom, diffWhitespaceModeAtom, diffWrapModeAtom, selectedPendingReviewAtom } from "../ui/diff/atoms.js"
import {
	pullRequestRunsFor,
	repositoryRunsFor,
	repositoryActionsStatusFilterAtom,
	repositoryActionsWorkflowFilterAtom,
	repositoryWorkflowsFor,
	runDetailSelectionAtom,
	runsFullViewAtom,
	runsKey,
	runsListSelectionAtom,
	selectedRepositoryRunAtom,
	selectedRunIdAtom,
} from "../ui/runs/atoms.js"
import { filterDraftAtom, filterModeAtom, filterQueryAtom } from "../ui/filter/atoms.js"
import { allIssuesAtom, issueOverridesAtom, issuesAtom, selectedIssueAtom } from "../ui/issues/atoms.js"
import { activeModalAtom } from "../ui/modals/atoms.js"
import { submitReviewOptions } from "../ui/modals/shared.js"
import { initialCommandPaletteState, initialCommentModalState, initialOpenRepositoryModalState, Modal } from "../ui/modals/types.js"
import { noticeAtom } from "../ui/notice/atoms.js"
import type { PullRequestUserQueueMode } from "../domain.js"
import { pullRequestQueueModes } from "../domain.js"
import {
	displayedPullRequestsAtom,
	labelCacheAtom,
	pullRequestOverridesAtom,
	pullRequestsAtom,
	repositoryDetailsCacheAtom,
	selectedPullRequestAtom,
} from "../ui/pullRequests/atoms.js"
import { lastBulkRetrySpecAtom, lastBulkRetryUrlsAtom, selectedItemUrlsAtom } from "../item/selection.js"
import { selectedBranchAtom, selectedEnvironmentAtom, selectedMilestoneAtom } from "../surfaces/resource/atoms.js"
import { notificationSelectedIdsAtom, selectedNotificationAtom } from "../surfaces/notification/atoms.js"
import { selectedRepositoryAtom, workspaceSurfaceAtom, workspaceTabSurfacesAtom } from "../workspace/atoms.js"
import { changeRefreshGenerationAtom, changeSelectionAtom, changeSnapshotAtom } from "../surfaces/changes/atoms.js"
import { ChangeWorkspace } from "../services/ChangeWorkspace.js"
import { repositoryContext } from "../services/runtime.js"
import { relateFromSnapshot, shortChangeId, shortCommitId } from "../localDomain.js"
import { type WorkspaceSurface, workspaceSurfaceRegistry } from "../workspaceSurfaces.js"
import {
	changeSurfaceReasonAtom,
	changedFilesReasonAtom,
	bulkRetryReasonAtom,
	bulkSelectionReasonAtom,
	changedFilesSubtitleAtom,
	detailCloseDisabledReasonAtom,
	diffCloseDisabledReasonAtom,
	diffCommentAnchorSubtitleAtom,
	diffFileSubtitleAtom,
	diffOpenCommentTargetTitleAtom,
	diffOpenRequiredReasonAtom,
	diffReloadDisabledReasonAtom,
	diffThreadReasonAtom,
	diffThreadSubtitleAtom,
	diffToggleRangeTitleAtom,
	filterClearDisabledReasonAtom,
	filterTitleAtom,
	filterUnsupportedReasonAtom,
	issueSelectedReasonAtom,
	issueSurfaceReasonAtom,
	noOpenIssueReasonAtom,
	noClosedIssueReasonAtom,
	noClosedPullRequestReasonAtom,
	loadMoreDisabledReasonAtom,
	loadMoreSubtitleAtom,
	noOpenPullRequestReasonAtom,
	noPullRequestReasonAtom,
	noSelectedItemReasonAtom,
	ownCommentReasonAtom,
	pullRequestRefreshTitleAtom,
	pullRequestSurfaceReasonAtom,
	repositoryOpenSubtitleAtom,
	repositoryItemCreateReasonAtom,
	selectedCommentReasonAtom,
	selectedCommentSubjectAtom,
	selectedDiffLineReasonAtom,
	selectedIssueLabelAtom,
	selectedItemLabelAtom,
	selectedPullRequestLabelAtom,
	queueViewAlreadyActiveReasonAtom,
	queueViewSubtitleAtom,
	queueViewTitleFor,
	repositoryViewAlreadyActiveReasonAtom,
	repositoryViewAvailableAtom,
	repositoryViewSubtitleAtom,
	repositoryViewTitleAtom,
	runsCloseDisabledReasonAtom,
	releaseSelectedReasonAtom,
	releaseSurfaceReasonAtom,
	selectedReleaseLabelAtom,
	workspaceSurfaceAlreadyActiveReasonAtom,
	workspaceSurfaceSubtitleAtom,
} from "./derivations.js"
import { invokeHandoff } from "./handoffs.js"
import { defineCommand, type CommandDefinition } from "./registry.js"
import { configPath, readStoredConfig, resetAllApplicationSettings, resetSurfaceViewConfig, saveSurfaceViewPreset } from "../configStore.js"
import { diagnoseKeybindingOverrides, keymapCommandAliases } from "../settings/keybindings.js"
import { normalizeSurfaceView, surfaceColumnSchemas } from "../settings/viewConfig.js"

// Most commands fall into one of three shapes:
//   1. "Open this modal": yield* Atom.set(activeModalAtom, Modal.X(...))
//   2. "Toggle this atom": yield* Atom.update(atom, …)
//   3. "Read selection, do thing with service": Effect.gen reading selection
//      via Atom.get and calling Clipboard.use / BrowserOpener.use / ...
//
// Everything is dispatchable by id and depends only on atoms — no closures
// over component-local state.

const queueModeHandoffKey = (mode: PullRequestUserQueueMode) =>
	mode === "authored" ? ("viewAuthored" as const) : mode === "review" ? ("viewReview" as const) : mode === "assigned" ? ("viewAssigned" as const) : ("viewMentioned" as const)

const pendingReviewReasonAtom = Atom.make((get) => (get(selectedPendingReviewAtom)?.comments.length ? null : "No pending review comments"))
const noRepositoryRunReasonAtom = Atom.make((get) => (get(selectedRepositoryRunAtom) ? null : "No workflow run selected"))
const resourceSurfaceReasonAtom = (surface: "branches" | "milestones" | "environments" | "runners") =>
	Atom.make((get) => (get(workspaceSurfaceAtom) === surface ? null : `Open the ${surface} surface`))
const branchSelectedReasonAtom = Atom.make((get) => (get(selectedBranchAtom) ? null : "No branch selected"))
const milestoneSelectedReasonAtom = Atom.make((get) => (get(selectedMilestoneAtom) ? null : "No milestone selected"))
const environmentSelectedReasonAtom = Atom.make((get) => (get(selectedEnvironmentAtom) ? null : "No environment selected"))
const notificationSurfaceReasonAtom = Atom.make((get) => (get(workspaceSurfaceAtom) === "notifications" ? null : "Open the notifications surface"))
const notificationSelectedReasonAtom = Atom.make((get) => {
	const notification = get(selectedNotificationAtom)
	return !notification ? "No notification selected" : notification.url ? null : "Notification target is unavailable or was deleted"
})
const unreadNotificationSelectedReasonAtom = Atom.make((get) => {
	const notification = get(selectedNotificationAtom)
	return !notification ? "No notification selected" : notification.unread ? null : "Notification is already read"
})
const selectedNotificationsReasonAtom = Atom.make((get) => (get(notificationSelectedIdsAtom).length > 0 ? null : "No notifications selected"))

const queueViewCommands = pullRequestQueueModes.map(
	(mode): CommandDefinition =>
		defineCommand({
			id: `view.${mode}`,
			title: queueViewTitleFor(mode),
			scope: "View",
			subtitle: queueViewSubtitleAtom(mode),
			keywords: [mode, "queue", "view"],
			disabledReason: queueViewAlreadyActiveReasonAtom(mode),
			run: Effect.sync(() => invokeHandoff(queueModeHandoffKey(mode))),
		}),
)

const workspaceSurfaceCommands = workspaceSurfaceRegistry.map((descriptor, index): CommandDefinition => {
	const subtitleAtom = workspaceSurfaceSubtitleAtom(descriptor.id)
	const disabledAtom = workspaceSurfaceAlreadyActiveReasonAtom(descriptor.id)
	return defineCommand({
		id: `workspace.${descriptor.id}`,
		title: `Show ${descriptor.label}`,
		scope: "View",
		subtitle: subtitleAtom,
		...(index < 9 ? { shortcut: `${index + 1}` } : {}),
		keywords: [descriptor.label, "workspace", "surface", "tab"],
		disabledReason: disabledAtom,
		run: switchWorkspaceSurfaceEffect(descriptor.id),
	})
})

function switchWorkspaceSurfaceEffect(surface: WorkspaceSurface) {
	return Effect.gen(function* () {
		const allowed = yield* Atom.get(workspaceTabSurfacesAtom)
		if (!allowed.includes(surface)) return
		const current = yield* Atom.get(workspaceSurfaceAtom)
		if (current === surface) return
		yield* Atom.set(workspaceSurfaceAtom, surface)
		yield* Atom.set(detailFullViewAtom, false)
		yield* Atom.set(diffFullViewAtom, false)
		yield* Atom.set(commentsViewActiveAtom, false)
		yield* Atom.set(diffCommentRangeStartIndexAtom, null)
		yield* Atom.set(filterModeAtom, false)
		const query = yield* Atom.get(filterQueryAtom)
		yield* Atom.set(filterDraftAtom, query)
		yield* Atom.set(noticeAtom, null)
	})
}

const openMetadataSelectorEffect = (kind: "assignees" | "reviewers" | "milestone" | "base") =>
	Effect.gen(function* () {
		const surface = yield* Atom.get(workspaceSurfaceAtom)
		const subject = surface === "issues" ? yield* Atom.get(selectedIssueAtom) : yield* Atom.get(selectedPullRequestAtom)
		if (!subject) return
		const target = {
			kind: surface === "issues" ? ("issue" as const) : ("pullRequest" as const),
			repository: subject.repository,
			number: subject.number,
			url: subject.url,
		}
		yield* Atom.set(
			activeModalAtom,
			Modal.MetadataSelector({
				kind,
				target,
				query: "",
				selectedIndex: 0,
				selectedIds: [],
				options: [],
				loading: true,
				running: false,
				error: null,
			}),
		)
		const options = yield* GitHubService.use((github) =>
			kind === "assignees"
				? github
						.listAssignees(subject.repository)
						.pipe(Effect.map((users) => users.map((user) => ({ id: user.login, label: `@${user.login}`, description: user.name ?? "deleted or unnamed user" }))))
				: kind === "reviewers"
					? github
							.listReviewers(subject.repository)
							.pipe(Effect.map((users) => users.map((user) => ({ id: user.login, label: `@${user.login}`, description: user.name ?? "unnamed collaborator" }))))
					: kind === "milestone"
						? github.listMilestones(subject.repository).pipe(
								Effect.map((milestones) =>
									milestones.map((milestone) => ({
										id: milestone.title,
										label: milestone.title,
										description: `${milestone.state}${milestone.dueOn ? ` · due ${milestone.dueOn.toISOString().slice(0, 10)}` : ""}`,
									})),
								),
							)
						: github
								.listBranches(subject.repository)
								.pipe(
									Effect.map((branches) =>
										branches.map((branch) => ({ id: branch.name, label: branch.name, description: `${branch.sha.slice(0, 8)}${branch.protected ? " · protected" : ""}` })),
									),
								),
		).pipe(
			Effect.catch((error) =>
				Effect.gen(function* () {
					yield* Atom.update(activeModalAtom, (current) =>
						Modal.$is("MetadataSelector")(current) && current.kind === kind ? Modal.MetadataSelector({ ...current, loading: false, error: errorMessage(error) }) : current,
					)
					return [] as const
				}),
			),
		)
		yield* Atom.update(activeModalAtom, (current) =>
			Modal.$is("MetadataSelector")(current) && current.kind === kind && current.target.url === subject.url
				? Modal.MetadataSelector({ ...current, options, loading: false })
				: current,
		)
	})

const flashErrorEffect = (error: unknown) =>
	Effect.gen(function* () {
		yield* Atom.set(noticeAtom, errorMessage(error))
	})

export const globalCommands: readonly CommandDefinition[] = [
	defineCommand({
		id: "command.open",
		title: "Open command palette",
		scope: "Global",
		subtitle: "Search every available route through ghui",
		shortcut: "ctrl-p/cmd-k/?",
		keywords: ["palette", "commands", "deck", "help", "keys", "keyboard", "shortcuts"],
		run: Atom.set(activeModalAtom, Modal.CommandPalette(initialCommandPaletteState)),
	}),
	defineCommand({
		id: "filter.open",
		title: filterTitleAtom,
		scope: "Global",
		subtitle: "Search the visible surface",
		shortcut: "/",
		keywords: ["search"],
		disabledReason: filterUnsupportedReasonAtom,
		run: Effect.gen(function* () {
			const query = yield* Atom.get(filterQueryAtom)
			yield* Atom.set(filterDraftAtom, query)
			yield* Atom.set(filterModeAtom, true)
		}),
	}),
	defineCommand({
		id: "filter.clear",
		title: "Clear filter",
		scope: "Global",
		subtitle: "Show every item in the current surface",
		shortcut: "esc",
		disabledReason: filterClearDisabledReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(filterQueryAtom, "")
			yield* Atom.set(filterDraftAtom, "")
			yield* Atom.set(filterModeAtom, false)
		}),
	}),
	defineCommand({
		id: "view.configure",
		title: "Cycle saved view layout",
		scope: "View",
		subtitle: "Cycle default, compact, grouped, and filtered presets for this surface",
		shortcut: "v",
		keywords: ["columns", "sort", "group", "value filter", "saved view"],
		run: Effect.gen(function* () {
			const surface = yield* Atom.get(workspaceSurfaceAtom)
			const stored = yield* Effect.tryPromise(() => readStoredConfig())
			const schema = surfaceColumnSchemas[surface]
			const current = normalizeSurfaceView(surface, stored.config.surfaceViews[surface]).view
			const currentPreset =
				typeof stored.config.viewPreset === "object" && stored.config.viewPreset !== null ? Number((stored.config.viewPreset as Record<string, unknown>)[surface] ?? 0) : 0
			const nextPreset = (currentPreset + 1) % 4
			const groupColumn = schema.find((column, index) => index > 0 && column.groupable)?.id ?? null
			const sortColumn = [...schema].reverse().find((column) => column.sortable)?.id
			const filters: Readonly<Record<string, readonly string[]>> =
				nextPreset === 3
					? surface === "notifications"
						? { unread: ["true"] }
						: surface === "milestones"
							? { state: ["open"] }
							: surface === "actions"
								? { status: ["in_progress"] }
								: {}
					: {}
			const view =
				nextPreset === 0
					? normalizeSurfaceView(surface, undefined).view
					: {
							...current,
							visibleColumns: nextPreset === 1 ? schema.slice(0, Math.max(1, schema.length - 1)).map((column) => column.id) : schema.map((column) => column.id),
							groupBy: nextPreset >= 2 ? groupColumn : null,
							...(sortColumn ? { sort: { field: sortColumn, direction: "descending" as const } } : {}),
							valueFilters: filters,
						}
			yield* Effect.tryPromise(() => saveSurfaceViewPreset(surface, view, nextPreset))
			yield* Atom.set(noticeAtom, `Saved ${surface} view preset ${nextPreset + 1}/4`)
		}).pipe(Effect.catch(flashErrorEffect)),
	}),
	defineCommand({
		id: "settings.resetSurface",
		title: "Reset current Surface view",
		scope: "System",
		keywords: ["settings", "columns", "sort", "group", "filters", "defaults"],
		run: Effect.gen(function* () {
			const surface = yield* Atom.get(workspaceSurfaceAtom)
			yield* Effect.tryPromise(() => resetSurfaceViewConfig(surface))
			yield* Atom.set(noticeAtom, `Reset ${surface} view`)
		}).pipe(Effect.catch(flashErrorEffect)),
	}),
	defineCommand({
		id: "settings.keybindings",
		title: "Diagnose configured keybindings",
		scope: "System",
		subtitle: configPath(),
		keywords: ["settings", "shortcuts", "keys", "conflicts"],
		run: Effect.gen(function* () {
			const stored = yield* Effect.tryPromise(() => readStoredConfig())
			const diagnostics = diagnoseKeybindingOverrides(stored.config.keybindings, new Set(Object.keys(keymapCommandAliases)))
			const summary =
				diagnostics.length === 0
					? `Keybindings valid · ${configPath()}`
					: `${diagnostics.length} keybinding diagnostic${diagnostics.length === 1 ? "" : "s"} · ${diagnostics[0]!.message}`
			yield* Atom.set(noticeAtom, summary)
		}).pipe(Effect.catch(flashErrorEffect)),
	}),
	defineCommand({
		id: "settings.resetAll",
		title: "Reset saved views and keybindings",
		scope: "System",
		keywords: ["settings", "defaults", "reset"],
		run: Effect.tryPromise(() => resetAllApplicationSettings()).pipe(
			Effect.tap(() => Atom.set(noticeAtom, "Reset saved views and keybindings")),
			Effect.catch(flashErrorEffect),
		),
	}),

	// === Workspace surface switches ===
	...workspaceSurfaceCommands,

	// === Detail / diff toggles ===
	defineCommand({
		id: "detail.open",
		title: "Open details",
		scope: "View",
		subtitle: selectedItemLabelAtom,
		shortcut: "enter",
		disabledReason: noSelectedItemReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(detailFullViewAtom, true)
			yield* Atom.set(detailScrollOffsetAtom, 0)
		}),
	}),
	defineCommand({
		id: "detail.close",
		title: "Close details view",
		scope: "Pull request",
		subtitle: "Return to the queue",
		shortcut: "esc",
		disabledReason: detailCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(detailFullViewAtom, false)
			yield* Atom.set(detailScrollOffsetAtom, 0)
		}),
	}),
	// === Diff render-mode toggles ===
	// These three preserve the user's scroll position across the re-render
	// they trigger by calling the "preserveDiffLocation" handoff *synchronously*
	// before the atom write. The diff-location-preservation hook captured
	// the pre-mutation anchor + screenOffset at that moment.
	defineCommand({
		id: "diff.toggle-view",
		title: "Toggle diff split/unified view",
		scope: "Diff",
		subtitle: Atom.make((get) => (get(diffRenderViewAtom) === "split" ? "Switch to unified view" : "Switch to split view")),
		shortcut: "shift-v",
		disabledReason: diffOpenRequiredReasonAtom,
		run: Effect.gen(function* () {
			yield* Effect.sync(() => invokeHandoff("preserveDiffLocation"))
			yield* Atom.update(diffRenderViewAtom, (current) => (current === "split" ? "unified" : "split"))
		}),
	}),
	defineCommand({
		id: "diff.toggle-wrap",
		title: "Toggle diff word wrap",
		scope: "Diff",
		subtitle: Atom.make((get) => (get(diffWrapModeAtom) === "none" ? "Wrap long diff lines" : "Keep diff lines unwrapped")),
		shortcut: "w",
		disabledReason: diffOpenRequiredReasonAtom,
		run: Effect.gen(function* () {
			yield* Effect.sync(() => invokeHandoff("preserveDiffLocation"))
			yield* Atom.update(diffWrapModeAtom, (current) => (current === "none" ? "word" : "none"))
		}),
	}),
	defineCommand({
		id: "diff.toggle-whitespace",
		title: Atom.make((get) => (get(diffWhitespaceModeAtom) === "ignore" ? "Show whitespace changes" : "Ignore whitespace changes")),
		scope: "Diff",
		subtitle: Atom.make((get) => (get(diffWhitespaceModeAtom) === "ignore" ? "Display the original GitHub patch" : "Hide whitespace-only line changes")),
		disabledReason: diffOpenRequiredReasonAtom,
		keywords: ["whitespace", "spacing", "ignore", "show"],
		run: Effect.gen(function* () {
			yield* Effect.sync(() => invokeHandoff("preserveDiffLocation"))
			const current = yield* Atom.get(diffWhitespaceModeAtom)
			const next = current === "ignore" ? "show" : "ignore"
			yield* Atom.set(diffWhitespaceModeAtom, next)
			yield* saveStoredDiffWhitespaceMode(next)
		}),
	}),

	defineCommand({
		id: "diff.close",
		title: "Close diff view",
		scope: "Diff",
		subtitle: "Return to the queue or detail view",
		shortcut: "esc",
		disabledReason: diffCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(diffFullViewAtom, false)
			yield* Atom.set(diffCommentRangeStartIndexAtom, null)
		}),
	}),

	// === Runs cluster (per-PR workflow runs view) ===
	defineCommand({
		id: "runs.open",
		title: "Open workflow runs",
		scope: "Runs",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "a",
		keywords: ["actions", "ci", "workflow", "checks", "runs", "jobs"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* Atom.set(selectedRunIdAtom, null)
			yield* Atom.set(runsListSelectionAtom, 0)
			yield* Atom.set(runDetailSelectionAtom, 0)
			yield* Atom.set(diffFullViewAtom, false)
			yield* Atom.set(detailFullViewAtom, false)
			yield* Atom.set(commentsViewActiveAtom, false)
			yield* Atom.set(runsFullViewAtom, true)
		}),
	}),
	defineCommand({
		id: "runs.close",
		title: "Close workflow runs",
		scope: "Runs",
		subtitle: "Return to the pull request",
		shortcut: "esc",
		disabledReason: runsCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(runsFullViewAtom, false)
			yield* Atom.set(selectedRunIdAtom, null)
		}),
	}),
	defineCommand({
		id: "runs.refresh",
		title: "Refresh workflow runs",
		scope: "Runs",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "r",
		disabledReason: runsCloseDisabledReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* Atom.refresh(pullRequestRunsFor(runsKey(pr)))
		}),
	}),
	defineCommand({
		id: "actions.refresh",
		title: "Refresh repository Actions",
		scope: "Actions",
		disabledReason: Atom.make((get) => (get(selectedRepositoryAtom) ? null : "Open a repository first")),
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			if (repository) yield* Atom.refresh(repositoryRunsFor(repository))
		}),
	}),
	defineCommand({
		id: "actions.retry",
		title: "Retry workflow run",
		scope: "Actions",
		shortcut: "shift+r",
		disabledReason: noRepositoryRunReasonAtom,
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			const run = yield* Atom.get(selectedRepositoryRunAtom)
			if (!repository || !run) return
			yield* Atom.set(
				activeModalAtom,
				Modal.RunAction({ action: "retry", repository, runId: run.id, title: run.displayTitle, failedOnly: run.conclusion === "failure", running: false, error: null }),
			)
		}),
	}),
	defineCommand({
		id: "actions.cancel",
		title: "Cancel workflow run",
		scope: "Actions",
		shortcut: "x",
		disabledReason: Atom.make((get) => {
			const run = get(selectedRepositoryRunAtom)
			return !run ? "No workflow run selected" : run.status === "completed" ? "The selected run already completed" : null
		}),
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			const run = yield* Atom.get(selectedRepositoryRunAtom)
			if (!repository || !run || run.status === "completed") return
			yield* Atom.set(activeModalAtom, Modal.RunAction({ action: "cancel", repository, runId: run.id, title: run.displayTitle, failedOnly: false, running: false, error: null }))
		}),
	}),
	defineCommand({
		id: "actions.dispatch",
		title: "Dispatch workflow",
		scope: "Actions",
		shortcut: "d",
		disabledReason: Atom.make((get) => (get(selectedRepositoryAtom) ? null : "Open a repository first")),
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			if (!repository) return
			const defaultRef = (yield* Atom.get(repositoryDetailsCacheAtom))[repository]?.defaultBranch ?? "main"
			const workflowsResult = yield* Atom.get(repositoryWorkflowsFor(repository))
			const workflows = AsyncResult.isSuccess(workflowsResult) ? workflowsResult.value.filter((workflow) => workflow.state === "active") : []
			yield* Atom.set(
				activeModalAtom,
				Modal.WorkflowDispatch({
					repository,
					workflows,
					workflowIndex: 0,
					inputs: [],
					values: {},
					ref: defaultRef,
					focusIndex: 0,
					loadingInputs: workflows.length > 0,
					running: false,
					error: workflows.length === 0 ? "No active workflows found." : null,
				}),
			)
			const workflow = workflows[0]
			if (!workflow) return
			const inputResult = yield* GitHubService.use((github) => github.getWorkflowInputs(repository, String(workflow.id))).pipe(
				Effect.match({
					onFailure: (error) => ({ inputs: [] as const, error: errorMessage(error) }),
					onSuccess: (inputs) => ({ inputs, error: null }),
				}),
			)
			const inputs = inputResult.inputs
			const values = Object.fromEntries(inputs.flatMap((input) => (input.defaultValue === null ? [] : [[input.name, input.defaultValue]])))
			yield* Atom.update(activeModalAtom, (modal) =>
				modal._tag === "WorkflowDispatch" && modal.repository === repository && modal.workflows[modal.workflowIndex]?.id === workflow.id
					? Modal.WorkflowDispatch({ ...modal, inputs, values, loadingInputs: false, error: inputResult.error })
					: modal,
			)
		}),
	}),
	defineCommand({
		id: "actions.downloadArtifact",
		title: "Download workflow artifact",
		scope: "Actions",
		shortcut: "a",
		disabledReason: noRepositoryRunReasonAtom,
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			const run = yield* Atom.get(selectedRepositoryRunAtom)
			if (!repository || !run) return
			yield* Atom.set(
				activeModalAtom,
				Modal.ArtifactDownload({
					repository,
					runId: run.id,
					artifacts: [],
					selectedIndex: 0,
					destination: "",
					focus: "artifact",
					loading: true,
					running: false,
					error: null,
				}),
			)
			const result = yield* GitHubService.use((github) => github.listArtifacts(repository, run.id)).pipe(
				Effect.match({
					onFailure: (error) => ({ artifacts: [] as const, error: errorMessage(error) }),
					onSuccess: (artifacts) => ({ artifacts, error: artifacts.length === 0 ? "No artifacts for this run." : null }),
				}),
			)
			yield* Atom.update(activeModalAtom, (modal) =>
				modal._tag === "ArtifactDownload" && modal.repository === repository && modal.runId === run.id
					? Modal.ArtifactDownload({ ...modal, artifacts: result.artifacts, loading: false, error: result.error })
					: modal,
			)
		}),
	}),
	defineCommand({
		id: "actions.cycleStatusFilter",
		title: "Cycle Actions status filter",
		scope: "Actions",
		shortcut: "f",
		disabledReason: Atom.make((get) => (get(selectedRepositoryAtom) ? null : "Open a repository first")),
		run: Effect.gen(function* () {
			const options = ["all", "in_progress", "failure", "success", "cancelled"] as const
			const current = yield* Atom.get(repositoryActionsStatusFilterAtom)
			yield* Atom.set(repositoryActionsStatusFilterAtom, options[(options.indexOf(current) + 1) % options.length]!)
		}),
	}),
	defineCommand({
		id: "actions.cycleWorkflowFilter",
		title: "Cycle Actions workflow filter",
		scope: "Actions",
		shortcut: "w",
		disabledReason: Atom.make((get) => (get(selectedRepositoryAtom) ? null : "Open a repository first")),
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			if (!repository) return
			const result = yield* Atom.get(repositoryRunsFor(repository))
			const names = AsyncResult.isSuccess(result) ? [...new Set(result.value.map((run) => run.workflowName))].sort((left, right) => left.localeCompare(right)) : []
			const current = yield* Atom.get(repositoryActionsWorkflowFilterAtom)
			const options: readonly (string | null)[] = [null, ...names]
			yield* Atom.set(repositoryActionsWorkflowFilterAtom, options[(options.indexOf(current) + 1) % options.length] ?? null)
		}),
	}),
	// === Modal openers (selection-seeded) ===
	defineCommand({
		id: "repository.open",
		title: "Open repository...",
		scope: "View",
		subtitle: repositoryOpenSubtitleAtom,
		keywords: ["repo", "repository", "owner", "github"],
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			yield* Atom.set(activeModalAtom, Modal.OpenRepository({ ...initialOpenRepositoryModalState, query: repository ?? "" }))
		}),
	}),
	defineCommand({
		id: "issue.create",
		title: "Create issue",
		scope: "Issue",
		subtitle: "Create an issue in the open repository",
		shortcut: "n",
		disabledReason: repositoryItemCreateReasonAtom,
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			if (!repository || (yield* Atom.get(workspaceSurfaceAtom)) !== "issues") return
			yield* Atom.set(
				activeModalAtom,
				Modal.ItemEditor({
					kind: "issue",
					mode: "create",
					repository,
					number: null,
					url: null,
					title: "",
					body: "",
					base: "main",
					head: "",
					draft: false,
					labels: "",
					assignees: "",
					reviewers: "",
					milestone: "",
					focus: "title",
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "issue.edit",
		title: "Edit issue",
		scope: "Issue",
		subtitle: selectedIssueLabelAtom,
		shortcut: "e",
		disabledReason: issueSelectedReasonAtom,
		run: Effect.gen(function* () {
			const issue = yield* Atom.get(selectedIssueAtom)
			if (!issue) return
			yield* Atom.set(
				activeModalAtom,
				Modal.ItemEditor({
					kind: "issue",
					mode: "edit",
					repository: issue.repository,
					number: issue.number,
					url: issue.url,
					title: issue.title,
					body: issue.body,
					base: "main",
					head: "",
					draft: false,
					labels: issue.labels.map((label) => label.name).join(", "),
					assignees: "",
					reviewers: "",
					milestone: "",
					focus: "title",
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "issue.reopen",
		title: "Reopen issue",
		scope: "Issue",
		subtitle: selectedIssueLabelAtom,
		disabledReason: noClosedIssueReasonAtom,
		run: Effect.gen(function* () {
			const issue = yield* Atom.get(selectedIssueAtom)
			if (!issue || issue.state !== "closed") return
			yield* Atom.update(issueOverridesAtom, (current) => ({ ...current, [issue.url]: { ...issue, state: "open" as const } }))
			yield* GitHubService.use((github) => github.reopenIssue(issue.repository, issue.number)).pipe(
				Effect.tap(() => Atom.refresh(issuesAtom)),
				Effect.catch((error) =>
					Effect.gen(function* () {
						yield* Atom.update(issueOverridesAtom, (current) => ({ ...current, [issue.url]: issue }))
						yield* Atom.set(noticeAtom, errorMessage(error))
					}),
				),
			)
		}),
	}),
	defineCommand({
		id: "issue.delete",
		title: "Delete issue",
		scope: "Issue",
		subtitle: selectedIssueLabelAtom,
		disabledReason: issueSelectedReasonAtom,
		run: Effect.gen(function* () {
			const issue = yield* Atom.get(selectedIssueAtom)
			if (!issue) return
			yield* Atom.set(
				activeModalAtom,
				Modal.Close({
					kind: "issue",
					action: "delete",
					repository: issue.repository,
					number: issue.number,
					title: issue.title,
					url: issue.url,
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "pullRequest.create",
		title: "Create pull request",
		scope: "Pull request",
		subtitle: "Create a pull request in the open repository",
		shortcut: "n",
		disabledReason: repositoryItemCreateReasonAtom,
		run: Effect.gen(function* () {
			const repository = yield* Atom.get(selectedRepositoryAtom)
			if (!repository || (yield* Atom.get(workspaceSurfaceAtom)) !== "pullRequests") return
			yield* Atom.set(
				activeModalAtom,
				Modal.ItemEditor({
					kind: "pullRequest",
					mode: "create",
					repository,
					number: null,
					url: null,
					title: "",
					body: "",
					base: "main",
					head: "",
					draft: false,
					labels: "",
					assignees: "",
					reviewers: "",
					milestone: "",
					focus: "title",
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "pullRequest.edit",
		title: "Edit pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "e",
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pullRequest = yield* Atom.get(selectedPullRequestAtom)
			if (!pullRequest) return
			yield* Atom.set(
				activeModalAtom,
				Modal.ItemEditor({
					kind: "pullRequest",
					mode: "edit",
					repository: pullRequest.repository,
					number: pullRequest.number,
					url: pullRequest.url,
					title: pullRequest.title,
					body: pullRequest.body,
					base: pullRequest.baseRefName,
					head: pullRequest.headRefName,
					draft: pullRequest.reviewStatus === "draft",
					labels: pullRequest.labels.map((label) => label.name).join(", "),
					assignees: "",
					reviewers: "",
					milestone: "",
					focus: "title",
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "pullRequest.reopen",
		title: "Reopen pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		disabledReason: noClosedPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pullRequest = yield* Atom.get(selectedPullRequestAtom)
			if (!pullRequest || pullRequest.state !== "closed") return
			yield* Atom.update(pullRequestOverridesAtom, (current) => ({ ...current, [pullRequest.url]: { ...pullRequest, state: "open" as const } }))
			yield* GitHubService.use((github) => github.reopenPullRequest(pullRequest.repository, pullRequest.number)).pipe(
				Effect.tap(() => Atom.refresh(pullRequestsAtom)),
				Effect.catch((error) =>
					Effect.gen(function* () {
						yield* Atom.update(pullRequestOverridesAtom, (current) => ({ ...current, [pullRequest.url]: pullRequest }))
						yield* Atom.set(noticeAtom, errorMessage(error))
					}),
				),
			)
		}),
	}),
	defineCommand({
		id: "pullRequest.approve",
		title: "Approve pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		disabledReason: noOpenPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pullRequest = yield* Atom.get(selectedPullRequestAtom)
			if (!pullRequest || pullRequest.state !== "open") return
			yield* GitHubService.use((github) => github.approvePullRequest(pullRequest.repository, pullRequest.number)).pipe(
				Effect.tap(() => Atom.update(pullRequestOverridesAtom, (current) => ({ ...current, [pullRequest.url]: { ...pullRequest, reviewStatus: "approved" as const } }))),
				Effect.catch((error) => Atom.set(noticeAtom, errorMessage(error))),
			)
		}),
	}),
	defineCommand({
		id: "pull.close",
		title: "Close pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "x",
		disabledReason: noOpenPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr || pr.state !== "open") return
			yield* Atom.set(
				activeModalAtom,
				Modal.Close({
					kind: "pullRequest",
					action: "close",
					repository: pr.repository,
					number: pr.number,
					title: pr.title,
					url: pr.url,
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "issue.close",
		title: "Close issue",
		scope: "Issue",
		subtitle: selectedIssueLabelAtom,
		shortcut: "x",
		keywords: ["close", "resolve"],
		disabledReason: noOpenIssueReasonAtom,
		run: Effect.gen(function* () {
			const issue = yield* Atom.get(selectedIssueAtom)
			if (!issue || issue.state !== "open") return
			yield* Atom.set(
				activeModalAtom,
				Modal.Close({
					kind: "issue",
					action: "close",
					repository: issue.repository,
					number: issue.number,
					title: issue.title,
					url: issue.url,
					running: false,
					error: null,
				}),
			)
		}),
	}),

	// === Pull request state / review modals ===
	defineCommand({
		id: "pull.toggle-draft",
		title: Atom.make((get) => (get(selectedPullRequestAtom)?.reviewStatus === "draft" ? "Mark ready for review" : "Convert to draft")),
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "s",
		disabledReason: noOpenPullRequestReasonAtom,
		keywords: ["state", "ready"],
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr || pr.state !== "open") return
			const isDraft = pr.reviewStatus === "draft"
			yield* Atom.set(
				activeModalAtom,
				Modal.PullRequestState({
					repository: pr.repository,
					number: pr.number,
					title: pr.title,
					url: pr.url,
					isDraft,
					selectedIsDraft: !isDraft,
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "pull.submit-review",
		title: "Review pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "shift-r",
		disabledReason: noOpenPullRequestReasonAtom,
		keywords: ["review", "approve", "request changes", "comment"],
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr || pr.state !== "open") return
			const selectedIndex = Math.max(
				0,
				submitReviewOptions.findIndex((option) => option.event === "APPROVE"),
			)
			yield* Atom.set(
				activeModalAtom,
				Modal.SubmitReview({
					repository: pr.repository,
					number: pr.number,
					focus: "action",
					selectedIndex,
					body: "",
					cursor: 0,
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "comments.new",
		title: "New comment",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "a",
		keywords: ["add", "post", "issue comment"],
		disabledReason: noSelectedItemReasonAtom,
		run: Effect.gen(function* () {
			const subject = yield* Atom.get(selectedCommentSubjectAtom)
			const key = yield* Atom.get(selectedCommentKeyAtom)
			if (!subject || !key) return
			const surface = yield* Atom.get(workspaceSurfaceAtom)
			yield* Atom.set(
				activeModalAtom,
				Modal.Comment({
					...initialCommentModalState,
					target: { kind: "issue", subject: { repository: subject.repository, number: subject.number, key, issueUrl: surface === "issues" ? subject.url : null } },
				}),
			)
		}),
	}),
	defineCommand({
		id: "pull.labels",
		title: "Manage labels",
		scope: "Labels",
		subtitle: selectedItemLabelAtom,
		shortcut: "l",
		disabledReason: noSelectedItemReasonAtom,
		run: Effect.gen(function* () {
			const subject = yield* Atom.get(selectedCommentSubjectAtom)
			if (!subject) return
			const repository = subject.repository
			const surface = yield* Atom.get(workspaceSurfaceAtom)
			const target = { kind: surface === "issues" ? ("issue" as const) : ("pullRequest" as const), repository, number: subject.number, url: subject.url, labels: subject.labels }
			const cache = yield* Atom.get(labelCacheAtom)
			const cached = cache[repository]
			if (cached) {
				yield* Atom.set(activeModalAtom, Modal.Label({ repository, target, query: "", selectedIndex: 0, availableLabels: cached, loading: false }))
				return
			}
			yield* Atom.set(activeModalAtom, Modal.Label({ repository, target, query: "", selectedIndex: 0, availableLabels: [], loading: true }))
			yield* GitHubService.use((github) => github.listRepoLabels(repository)).pipe(
				Effect.flatMap((labels) =>
					Effect.gen(function* () {
						const normalized = labels.map((label) => ({ name: label.name, color: label.color ?? null }))
						yield* Atom.update(labelCacheAtom, (current) => ({ ...current, [repository]: normalized }))
						yield* Atom.update(activeModalAtom, (current) =>
							Modal.$is("Label")(current) && current.repository === repository ? Modal.Label({ ...current, availableLabels: normalized, loading: false }) : current,
						)
					}),
				),
				Effect.catch((error) =>
					Effect.gen(function* () {
						yield* Atom.update(activeModalAtom, (current) =>
							Modal.$is("Label")(current) && current.repository === repository ? Modal.Label({ ...current, loading: false }) : current,
						)
						yield* flashErrorEffect(error)
					}),
				),
			)
		}),
	}),
	defineCommand({
		id: "item.assignees",
		title: "Manage assignees",
		scope: "Labels",
		subtitle: selectedItemLabelAtom,
		disabledReason: noSelectedItemReasonAtom,
		keywords: ["assign", "people", "users"],
		run: openMetadataSelectorEffect("assignees"),
	}),
	defineCommand({
		id: "pullRequest.reviewers",
		title: "Manage reviewers",
		scope: "Labels",
		subtitle: selectedPullRequestLabelAtom,
		disabledReason: noPullRequestReasonAtom,
		keywords: ["review request", "collaborators"],
		run: openMetadataSelectorEffect("reviewers"),
	}),
	defineCommand({
		id: "item.milestone",
		title: "Set milestone",
		scope: "Labels",
		subtitle: selectedItemLabelAtom,
		disabledReason: noSelectedItemReasonAtom,
		keywords: ["milestone", "due date"],
		run: openMetadataSelectorEffect("milestone"),
	}),
	defineCommand({
		id: "pullRequest.base",
		title: "Change base branch",
		scope: "Labels",
		subtitle: selectedPullRequestLabelAtom,
		disabledReason: noPullRequestReasonAtom,
		keywords: ["base", "target branch"],
		run: openMetadataSelectorEffect("base"),
	}),
	defineCommand({
		id: "items.select",
		title: "Toggle item selection",
		scope: "Labels",
		subtitle: selectedItemLabelAtom,
		shortcut: "space",
		disabledReason: noSelectedItemReasonAtom,
		keywords: ["multi select", "bulk"],
		run: Effect.gen(function* () {
			const subject = yield* Atom.get(selectedCommentSubjectAtom)
			if (!subject) return
			const selected = yield* Atom.get(selectedItemUrlsAtom)
			const next = selected.includes(subject.url) ? selected.filter((url) => url !== subject.url) : [...selected, subject.url]
			yield* Atom.set(selectedItemUrlsAtom, next)
			yield* Atom.set(noticeAtom, `${next.length} item${next.length === 1 ? "" : "s"} selected`)
		}),
	}),
	defineCommand({
		id: "items.clearSelection",
		title: "Clear item selection",
		scope: "Labels",
		subtitle: "Clear the current bulk selection",
		disabledReason: bulkSelectionReasonAtom,
		run: Effect.gen(function* () {
			yield* Atom.set(selectedItemUrlsAtom, [])
			yield* Atom.set(noticeAtom, "Item selection cleared")
		}),
	}),
	defineCommand({
		id: "items.bulkEdit",
		title: "Bulk edit selected items",
		scope: "Labels",
		subtitle: Atom.make((get) => `${get(selectedItemUrlsAtom).length} selected`),
		shortcut: "b",
		disabledReason: bulkSelectionReasonAtom,
		keywords: ["batch", "labels", "assignees", "milestone", "status"],
		run: Effect.gen(function* () {
			const selected = yield* Atom.get(selectedItemUrlsAtom)
			const issues = yield* Atom.get(allIssuesAtom)
			const pullRequests = yield* Atom.get(displayedPullRequestsAtom)
			const targets = [...issues, ...pullRequests]
				.filter((item) => selected.includes(item.url))
				.map((item) => ({
					kind: "commentCount" in item ? ("issue" as const) : ("pullRequest" as const),
					repository: item.repository,
					number: item.number,
					url: item.url,
					title: item.title,
					state: item.state,
				}))
			yield* Atom.set(
				activeModalAtom,
				Modal.BulkEditor({
					targets,
					action: "addLabel",
					value: "",
					focus: "action",
					running: false,
					confirming: false,
					cancelRequested: false,
					summary: null,
					resultLines: [],
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "items.retryFailed",
		title: "Retry failed bulk items",
		scope: "Labels",
		subtitle: Atom.make((get) => `${get(lastBulkRetryUrlsAtom).length} retryable`),
		disabledReason: bulkRetryReasonAtom,
		run: Effect.gen(function* () {
			const spec = yield* Atom.get(lastBulkRetrySpecAtom)
			if (!spec) return
			const issues = yield* Atom.get(allIssuesAtom)
			const pullRequests = yield* Atom.get(displayedPullRequestsAtom)
			const targets = [...issues, ...pullRequests]
				.filter((item) => spec.urls.includes(item.url))
				.map((item) => ({
					kind: "commentCount" in item ? ("issue" as const) : ("pullRequest" as const),
					repository: item.repository,
					number: item.number,
					url: item.url,
					title: item.title,
					state: item.state,
				}))
			yield* Atom.set(
				activeModalAtom,
				Modal.BulkEditor({
					targets,
					action: spec.action,
					value: spec.value,
					focus: "action",
					running: false,
					confirming: false,
					cancelRequested: false,
					summary: "Retrying failed items only.",
					resultLines: [],
					error: null,
				}),
			)
		}),
	}),

	// === System / system-service commands ===
	defineCommand({
		id: "pull.open-browser",
		title: "Open pull request in browser",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "o",
		keywords: ["github", "web"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* BrowserOpener.use((opener) => opener.openPullRequest(pr)).pipe(Effect.catch(flashErrorEffect))
		}),
	}),
	defineCommand({
		id: "pull.open-editor",
		title: "Open pull request in editor",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "e",
		keywords: ["nvim", "neovim", "editor", "vscode", "code", "diffview", "review", "checkout"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			yield* EditorOpener.use((opener) => opener.openPullRequest(pr)).pipe(Effect.catch(flashErrorEffect))
		}),
	}),
	defineCommand({
		id: "pull.copy-metadata",
		title: "Copy pull request metadata",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "y",
		keywords: ["clipboard", "url", "title"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			const text = `${pr.repository}#${pr.number} ${pr.title}\n${pr.url}`
			yield* Clipboard.use((clipboard) => clipboard.copy(text)).pipe(
				Effect.tap(() => Atom.set(noticeAtom, "Pull request metadata copied")),
				Effect.catch(flashErrorEffect),
			)
		}),
	}),
	defineCommand({
		id: "issue.copy-metadata",
		title: "Copy issue metadata",
		scope: "Comments",
		subtitle: selectedIssueLabelAtom,
		shortcut: "y",
		keywords: ["clipboard", "url", "title"],
		disabledReason: issueSelectedReasonAtom,
		run: Effect.gen(function* () {
			const issue = yield* Atom.get(selectedIssueAtom)
			if (!issue) return
			const text = `${issue.repository}#${issue.number} ${issue.title}\n${issue.url}`
			yield* Clipboard.use((clipboard) => clipboard.copy(text)).pipe(
				Effect.tap(() => Atom.set(noticeAtom, "Issue metadata copied")),
				Effect.catch(flashErrorEffect),
			)
		}),
	}),
	defineCommand({
		id: "issue.open-browser",
		title: "Open issue in browser",
		scope: "Issue",
		subtitle: selectedIssueLabelAtom,
		shortcut: "o",
		keywords: ["github", "web"],
		disabledReason: issueSelectedReasonAtom,
		run: Effect.gen(function* () {
			const issue = yield* Atom.get(selectedIssueAtom)
			if (!issue) return
			yield* BrowserOpener.use((opener) => opener.openUrl(issue.url)).pipe(Effect.catch(flashErrorEffect))
		}),
	}),

	// === Pull-request lifecycle (hook-bound via handoff) ===
	defineCommand({
		id: "pull.refresh",
		title: pullRequestRefreshTitleAtom,
		scope: "Global",
		subtitle: "Fetch the latest queue from GitHub",
		shortcut: "r",
		disabledReason: pullRequestSurfaceReasonAtom,
		keywords: ["reload", "sync"],
		run: Effect.sync(() => invokeHandoff("refreshPullRequests")),
	}),
	defineCommand({
		id: "issue.refresh",
		title: "Refresh issues",
		scope: "Global",
		subtitle: "Fetch the latest issue queue from GitHub",
		shortcut: "r",
		disabledReason: issueSurfaceReasonAtom,
		keywords: ["reload", "sync"],
		run: Effect.sync(() => invokeHandoff("refreshIssues")),
	}),
	defineCommand({
		id: "release.refresh",
		title: "Refresh releases",
		scope: "Release",
		subtitle: "Fetch the latest releases from GitHub",
		shortcut: "r",
		disabledReason: releaseSurfaceReasonAtom,
		keywords: ["reload", "sync", "tags"],
		run: Effect.sync(() => invokeHandoff("refreshReleases")),
	}),
	defineCommand({
		id: "release.create",
		title: "Create release",
		scope: "Release",
		subtitle: "Publish or save a draft GitHub release",
		shortcut: "c",
		disabledReason: releaseSurfaceReasonAtom,
		keywords: ["new", "publish", "tag"],
		run: Effect.sync(() => invokeHandoff("openCreateRelease")),
	}),
	defineCommand({
		id: "release.edit",
		title: "Edit release",
		scope: "Release",
		subtitle: selectedReleaseLabelAtom,
		shortcut: "e",
		disabledReason: releaseSelectedReasonAtom,
		keywords: ["notes", "draft", "prerelease"],
		run: Effect.sync(() => invokeHandoff("openEditRelease")),
	}),
	defineCommand({
		id: "release.delete",
		title: "Delete release",
		scope: "Release",
		subtitle: selectedReleaseLabelAtom,
		shortcut: "x",
		disabledReason: releaseSelectedReasonAtom,
		keywords: ["remove", "confirm"],
		run: Effect.sync(() => invokeHandoff("openDeleteRelease")),
	}),
	defineCommand({
		id: "change.refresh",
		title: "Refresh changes",
		scope: "Changes",
		shortcut: "r",
		disabledReason: changeSurfaceReasonAtom,
		keywords: ["reload", "sync", "jj", "jujutsu"],
		run: Atom.update(changeRefreshGenerationAtom, (generation) => generation + 1),
	}),
	defineCommand({
		id: "change.open",
		title: "Show local changes",
		scope: "Changes",
		keywords: ["jj", "jujutsu", "stack"],
		disabledReason: Atom.make((get) => (!get(workspaceTabSurfacesAtom).includes("changes") ? "Connect a Jujutsu workspace to use this surface." : null)),
		run: switchWorkspaceSurfaceEffect("changes"),
	}),
	defineCommand({
		id: "change.fetch",
		title: "Fetch JJ remotes",
		scope: "Changes",
		keywords: ["jj", "git", "fetch"],
		disabledReason: Atom.make((get) => (!get(workspaceTabSurfacesAtom).includes("changes") ? "Connect a Jujutsu workspace to use this surface." : null)),
		run: Effect.gen(function* () {
			yield* ChangeWorkspace.use((workspace) => workspace.fetch())
			yield* Atom.update(changeRefreshGenerationAtom, (generation) => generation + 1)
			yield* Atom.refresh(pullRequestsAtom)
		}),
	}),
	defineCommand({
		id: "change.link-pr",
		title: "Link change to pull request",
		scope: "Changes",
		keywords: ["jj", "relate", "map"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pullRequest = yield* Atom.get(selectedPullRequestAtom)
			const snapshot = yield* Atom.get(changeSnapshotAtom)
			if (!pullRequest || !snapshot) {
				yield* Atom.set(noticeAtom, "Load a JJ snapshot and select a pull request first.")
				return
			}
			const selectedChange = snapshot.stack[yield* Atom.get(changeSelectionAtom)] ?? snapshot.workingCopy
			const observed = relateFromSnapshot(snapshot, pullRequest.headRefOid, null)
			const change = observed.status === "exact" ? (snapshot.stack.find((candidate) => candidate.changeId === observed.changeId) ?? selectedChange) : selectedChange
			const storeRoot = repositoryContext.storeRoot ?? snapshot.workspaceRoot
			yield* Atom.set(
				activeModalAtom,
				Modal.ChangePlan({
					kind: "link-pr",
					title: `Link ${shortChangeId(change.changeId)} to #${pullRequest.number}`,
					lines: [`Change ${shortChangeId(change.changeId)}`, `Commit ${shortCommitId(change.commitId)}`, `PR #${pullRequest.number} ${pullRequest.title}`],
					confirmLabel: "link",
					running: false,
					error: null,
					repository: pullRequest.repository,
					prNumber: pullRequest.number,
					changeId: change.changeId,
					commitId: change.commitId,
					workspaceName: null,
					destinationPath: null,
					existingWorkspace: false,
					operationId: snapshot.operationId,
					storeRoot,
					currentWorkspaceName: snapshot.workspaceName,
					currentWorkingCopyChangeId: snapshot.workingCopy.changeId,
				}),
			)
		}),
	}),
	defineCommand({
		id: "change.detach-pr",
		title: "Detach change from pull request",
		scope: "Changes",
		keywords: ["jj", "unlink"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pullRequest = yield* Atom.get(selectedPullRequestAtom)
			const snapshot = yield* Atom.get(changeSnapshotAtom)
			if (!pullRequest) return
			yield* Atom.set(
				activeModalAtom,
				Modal.ChangePlan({
					kind: "detach-pr",
					title: `Detach #${pullRequest.number}`,
					lines: [`Remove the stored JJ relationship for PR #${pullRequest.number}.`],
					confirmLabel: "detach",
					running: false,
					error: null,
					repository: pullRequest.repository,
					prNumber: pullRequest.number,
					changeId: null,
					commitId: pullRequest.headRefOid,
					workspaceName: null,
					destinationPath: null,
					existingWorkspace: false,
					operationId: snapshot?.operationId ?? null,
					storeRoot: repositoryContext.storeRoot ?? snapshot?.workspaceRoot ?? null,
					currentWorkspaceName: snapshot?.workspaceName ?? null,
					currentWorkingCopyChangeId: snapshot?.workingCopy.changeId ?? null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "pull.open-jj-workspace",
		title: "Open PR in JJ workspace",
		scope: "Pull request",
		keywords: ["jj", "workspace", "editor"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pullRequest = yield* Atom.get(selectedPullRequestAtom)
			const snapshot = yield* Atom.get(changeSnapshotAtom)
			if (!pullRequest || !snapshot) {
				yield* Atom.set(noticeAtom, "A connected JJ workspace is required.")
				return
			}
			const observed = relateFromSnapshot(snapshot, pullRequest.headRefOid, null)
			const changeId = "changeId" in observed ? observed.changeId : snapshot.workingCopy.changeId
			const existing = snapshot.workspaces.find((workspace) => workspace.changeId === changeId)
			const workspace = yield* ChangeWorkspace
			const handoff = existing
				? yield* workspace.plan({ intent: "workspace.open-existing", changeId })
				: yield* workspace.plan({
						intent: "workspace.create",
						name: `pr-${pullRequest.number}`,
						targetCommitId: pullRequest.headRefOid,
						sourceChangeId: changeId,
					})
			yield* Atom.set(
				activeModalAtom,
				Modal.ChangePlan({
					kind: "workspace-handoff",
					title: existing ? `Open workspace ${handoff.workspaceName}` : `Create workspace ${handoff.workspaceName}`,
					lines: [
						`Name ${handoff.workspaceName}`,
						`Path ${handoff.destinationPath}`,
						`Commit ${shortCommitId(handoff.targetCommitId)}`,
						existing ? "Existing workspace" : "Creates a sibling workspace; current working copy stays put",
					],
					confirmLabel: existing ? "open" : "create",
					running: false,
					error: null,
					repository: pullRequest.repository,
					prNumber: pullRequest.number,
					changeId: handoff.sourceChangeId,
					commitId: handoff.targetCommitId,
					workspaceName: handoff.workspaceName,
					destinationPath: handoff.destinationPath,
					existingWorkspace: handoff.existing,
					operationId: handoff.operationId,
					storeRoot: handoff.storeRoot,
					currentWorkspaceName: handoff.currentWorkspaceName,
					currentWorkingCopyChangeId: handoff.currentWorkingCopyChangeId,
				}),
			)
		}),
	}),
	defineCommand({
		id: "change.open-editor",
		title: "Open change in editor",
		scope: "Changes",
		keywords: ["jj", "editor", "workspace"],
		disabledReason: Atom.make((get) => (!get(workspaceTabSurfacesAtom).includes("changes") ? "Connect a Jujutsu workspace to use this surface." : null)),
		run: Effect.gen(function* () {
			const snapshot = yield* Atom.get(changeSnapshotAtom)
			if (!snapshot) {
				yield* Atom.set(noticeAtom, "Load local changes first.")
				return
			}
			const change = snapshot.stack[yield* Atom.get(changeSelectionAtom)] ?? snapshot.workingCopy
			const existing = snapshot.workspaces.find((workspace) => workspace.changeId === change.changeId)
			const workspace = yield* ChangeWorkspace
			const handoff = existing
				? yield* workspace.plan({ intent: "workspace.open-existing", changeId: change.changeId })
				: yield* workspace.plan({
						intent: "workspace.create",
						name: `change-${change.changeId.slice(0, 8)}`,
						targetCommitId: change.commitId,
						sourceChangeId: change.changeId,
					})
			yield* Atom.set(
				activeModalAtom,
				Modal.ChangePlan({
					kind: "workspace-handoff",
					title: existing ? `Open workspace ${handoff.workspaceName}` : `Create workspace ${handoff.workspaceName}`,
					lines: [`Name ${handoff.workspaceName}`, `Path ${handoff.destinationPath}`, `Change ${shortChangeId(change.changeId)}`],
					confirmLabel: existing ? "open" : "create",
					running: false,
					error: null,
					repository: repositoryContext.githubRepository ?? "",
					prNumber: null,
					changeId: handoff.sourceChangeId,
					commitId: handoff.targetCommitId,
					workspaceName: handoff.workspaceName,
					destinationPath: handoff.destinationPath,
					existingWorkspace: handoff.existing,
					operationId: handoff.operationId,
					storeRoot: handoff.storeRoot,
					currentWorkspaceName: handoff.currentWorkspaceName,
					currentWorkingCopyChangeId: handoff.currentWorkingCopyChangeId,
				}),
			)
		}),
	}),
	defineCommand({
		id: "branch.refresh",
		title: "Refresh branches",
		scope: "Branches",
		shortcut: "r",
		disabledReason: resourceSurfaceReasonAtom("branches"),
		run: Effect.sync(() => invokeHandoff("refreshBranches")),
	}),
	defineCommand({
		id: "branch.create",
		title: "Create branch",
		scope: "Branches",
		shortcut: "c",
		disabledReason: resourceSurfaceReasonAtom("branches"),
		run: Effect.sync(() => invokeHandoff("openCreateBranch")),
	}),
	defineCommand({
		id: "branch.delete",
		title: "Delete branch",
		scope: "Branches",
		shortcut: "x",
		disabledReason: branchSelectedReasonAtom,
		run: Effect.sync(() => invokeHandoff("openDeleteBranch")),
	}),
	defineCommand({
		id: "milestone.refresh",
		title: "Refresh milestones",
		scope: "Milestones",
		shortcut: "r",
		disabledReason: resourceSurfaceReasonAtom("milestones"),
		run: Effect.sync(() => invokeHandoff("refreshMilestones")),
	}),
	defineCommand({
		id: "milestone.create",
		title: "Create milestone",
		scope: "Milestones",
		shortcut: "c",
		disabledReason: resourceSurfaceReasonAtom("milestones"),
		run: Effect.sync(() => invokeHandoff("openCreateMilestone")),
	}),
	defineCommand({
		id: "milestone.edit",
		title: "Edit milestone",
		scope: "Milestones",
		shortcut: "e",
		disabledReason: milestoneSelectedReasonAtom,
		run: Effect.sync(() => invokeHandoff("openEditMilestone")),
	}),
	defineCommand({
		id: "milestone.toggleState",
		title: "Close or reopen milestone",
		scope: "Milestones",
		shortcut: "s",
		disabledReason: milestoneSelectedReasonAtom,
		run: Effect.sync(() => invokeHandoff("toggleMilestoneState")),
	}),
	defineCommand({
		id: "milestone.delete",
		title: "Delete milestone",
		scope: "Milestones",
		shortcut: "x",
		disabledReason: milestoneSelectedReasonAtom,
		run: Effect.sync(() => invokeHandoff("openDeleteMilestone")),
	}),
	defineCommand({
		id: "environment.refresh",
		title: "Refresh environments",
		scope: "Environments",
		shortcut: "r",
		disabledReason: resourceSurfaceReasonAtom("environments"),
		run: Effect.sync(() => invokeHandoff("refreshEnvironments")),
	}),
	defineCommand({
		id: "environment.open",
		title: "Open environment in browser",
		scope: "Environments",
		shortcut: "o",
		disabledReason: environmentSelectedReasonAtom,
		run: Effect.sync(() => invokeHandoff("openEnvironmentInBrowser")),
	}),
	defineCommand({
		id: "runner.refresh",
		title: "Refresh runners",
		scope: "Runners",
		shortcut: "r",
		disabledReason: resourceSurfaceReasonAtom("runners"),
		run: Effect.sync(() => invokeHandoff("refreshRunners")),
	}),
	defineCommand({
		id: "notification.refresh",
		title: "Refresh notifications",
		scope: "Notifications",
		shortcut: "r",
		disabledReason: notificationSurfaceReasonAtom,
		run: Effect.sync(() => invokeHandoff("refreshNotifications")),
	}),
	defineCommand({
		id: "notification.toggleReadFilter",
		title: "Toggle unread / all notifications",
		scope: "Notifications",
		shortcut: "u",
		disabledReason: notificationSurfaceReasonAtom,
		run: Effect.sync(() => invokeHandoff("toggleNotificationReadFilter")),
	}),
	defineCommand({
		id: "notification.cycleTypeFilter",
		title: "Cycle notification type filter",
		scope: "Notifications",
		shortcut: "f",
		disabledReason: notificationSurfaceReasonAtom,
		run: Effect.sync(() => invokeHandoff("cycleNotificationTypeFilter")),
	}),
	defineCommand({
		id: "notification.select",
		title: "Toggle notification selection",
		scope: "Notifications",
		shortcut: "space",
		disabledReason: unreadNotificationSelectedReasonAtom,
		run: Effect.sync(() => invokeHandoff("toggleNotificationSelection")),
	}),
	defineCommand({
		id: "notification.markRead",
		title: "Mark notification read",
		scope: "Notifications",
		shortcut: "m",
		disabledReason: unreadNotificationSelectedReasonAtom,
		run: Effect.sync(() => invokeHandoff("markNotificationRead")),
	}),
	defineCommand({
		id: "notification.markSelectedRead",
		title: "Mark selected notifications read",
		scope: "Notifications",
		shortcut: "shift+m",
		disabledReason: selectedNotificationsReasonAtom,
		run: Effect.sync(() => invokeHandoff("markSelectedNotificationsRead")),
	}),
	defineCommand({
		id: "notification.open",
		title: "Open notification target",
		scope: "Notifications",
		shortcut: "o",
		disabledReason: notificationSelectedReasonAtom,
		run: Effect.sync(() => invokeHandoff("openNotification")),
	}),
	defineCommand({
		id: "pull.load-more",
		title: "Load more pull requests",
		scope: "Navigation",
		subtitle: loadMoreSubtitleAtom,
		disabledReason: loadMoreDisabledReasonAtom,
		keywords: ["next page", "pagination", "more"],
		run: Effect.sync(() => invokeHandoff("loadMorePullRequests")),
	}),
	defineCommand({
		id: "pull.merge",
		title: "Merge pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "m",
		disabledReason: noPullRequestReasonAtom,
		keywords: ["auto merge", "squash"],
		run: Effect.sync(() => invokeHandoff("openMergeModal")),
	}),

	// === Theme / repository pickers ===
	defineCommand({
		id: "theme.open",
		title: "Choose theme",
		scope: "Global",
		subtitle: "Preview and persist a terminal color theme",
		shortcut: "t",
		keywords: ["colors", "appearance"],
		run: Effect.sync(() => invokeHandoff("openThemeModal")),
	}),

	// === Comments / diff entry points (hook-bound) ===
	defineCommand({
		id: "comments.open",
		title: "Open comments",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "c",
		keywords: ["conversation", "discussion", "review"],
		disabledReason: noSelectedItemReasonAtom,
		run: Effect.sync(() => invokeHandoff("openCommentsView")),
	}),
	defineCommand({
		id: "diff.open",
		title: "Open diff",
		scope: "Diff",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "d",
		disabledReason: noPullRequestReasonAtom,
		keywords: ["files", "patch"],
		run: Effect.sync(() => invokeHandoff("openDiffView")),
	}),

	// === View switches ===
	defineCommand({
		id: "view.repository",
		title: repositoryViewTitleAtom,
		scope: "View",
		subtitle: repositoryViewSubtitleAtom,
		keywords: ["repository", "queue", "view"],
		when: repositoryViewAvailableAtom,
		disabledReason: repositoryViewAlreadyActiveReasonAtom,
		run: Effect.sync(() => invokeHandoff("viewRepository")),
	}),
	...queueViewCommands,

	// === Diff cluster ===
	defineCommand({
		id: "diff.reload",
		title: "Reload diff",
		scope: "Diff",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "r",
		disabledReason: diffReloadDisabledReasonAtom,
		keywords: ["refresh", "comments"],
		run: Effect.sync(() => invokeHandoff("reloadDiff")),
	}),
	defineCommand({
		id: "diff.changed-files",
		title: "Open changed files navigator",
		scope: "Diff",
		subtitle: changedFilesSubtitleAtom,
		shortcut: "f",
		disabledReason: changedFilesReasonAtom,
		keywords: ["files", "navigator", "search"],
		run: Effect.sync(() => invokeHandoff("openChangedFilesModal")),
	}),
	defineCommand({
		id: "diff.toggle-file-panel",
		title: "Toggle file panel",
		scope: "Diff",
		shortcut: "shift+f",
		keywords: ["files", "panel", "sidebar", "toggle"],
		run: Effect.sync(() => invokeHandoff("toggleDiffFilePanel")),
	}),
	defineCommand({
		id: "diff.next-file",
		title: "Next diff file",
		scope: "Diff",
		subtitle: diffFileSubtitleAtom,
		shortcut: "]",
		disabledReason: changedFilesReasonAtom,
		run: Effect.sync(() => invokeHandoff("jumpDiffFileNext")),
	}),
	defineCommand({
		id: "diff.previous-file",
		title: "Previous diff file",
		scope: "Diff",
		subtitle: diffFileSubtitleAtom,
		shortcut: "[",
		disabledReason: changedFilesReasonAtom,
		run: Effect.sync(() => invokeHandoff("jumpDiffFilePrevious")),
	}),
	defineCommand({
		id: "diff.open-comment-target",
		title: diffOpenCommentTargetTitleAtom,
		scope: "Diff",
		subtitle: diffCommentAnchorSubtitleAtom,
		shortcut: "enter",
		disabledReason: selectedDiffLineReasonAtom,
		keywords: ["review", "comment", "thread", "line"],
		run: Effect.sync(() => invokeHandoff("openSelectedDiffComment")),
	}),
	defineCommand({
		id: "diff.toggle-range",
		title: diffToggleRangeTitleAtom,
		scope: "Diff",
		subtitle: diffCommentAnchorSubtitleAtom,
		shortcut: "v",
		disabledReason: selectedDiffLineReasonAtom,
		keywords: ["review", "comment", "range", "visual"],
		run: Effect.sync(() => invokeHandoff("toggleDiffCommentRange")),
	}),
	defineCommand({
		id: "diff.next-thread",
		title: "Next diff thread",
		scope: "Diff",
		subtitle: diffThreadSubtitleAtom,
		shortcut: "n",
		disabledReason: diffThreadReasonAtom,
		keywords: ["review", "comment", "thread"],
		run: Effect.sync(() => invokeHandoff("moveDiffCommentThreadNext")),
	}),
	defineCommand({
		id: "diff.previous-thread",
		title: "Previous diff thread",
		scope: "Diff",
		subtitle: diffThreadSubtitleAtom,
		shortcut: "p",
		disabledReason: diffThreadReasonAtom,
		keywords: ["review", "comment", "thread"],
		run: Effect.sync(() => invokeHandoff("moveDiffCommentThreadPrevious")),
	}),
	defineCommand({
		id: "diff.add-comment",
		title: "Add comment on selected diff line",
		scope: "Diff",
		subtitle: diffCommentAnchorSubtitleAtom,
		disabledReason: selectedDiffLineReasonAtom,
		keywords: ["review", "reply"],
		run: Effect.sync(() => invokeHandoff("openDiffCommentModal")),
	}),
	defineCommand({
		id: "diff.suggest",
		title: "Add suggestion on selected diff line",
		scope: "Diff",
		subtitle: diffCommentAnchorSubtitleAtom,
		shortcut: "shift+s",
		disabledReason: selectedDiffLineReasonAtom,
		keywords: ["review", "replacement", "suggestion"],
		run: Effect.sync(() => invokeHandoff("openDiffSuggestionModal")),
	}),
	defineCommand({
		id: "review.pending",
		title: "Open pending review",
		scope: "Diff",
		subtitle: Atom.make((get) => {
			const count = get(selectedPendingReviewAtom)?.comments.length ?? 0
			return count > 0 ? `${count} queued ${count === 1 ? "comment" : "comments"}` : "No queued comments"
		}),
		shortcut: "shift+p",
		disabledReason: pendingReviewReasonAtom,
		keywords: ["review", "queue", "draft", "pending"],
		run: Effect.gen(function* () {
			if (!(yield* Atom.get(selectedPendingReviewAtom))?.comments.length) return
			yield* Atom.set(activeModalAtom, Modal.PendingReview({ selectedIndex: 0, confirmingDiscard: false, running: false, error: null }))
		}),
	}),
	defineCommand({
		id: "review.submit",
		title: "Submit pending review",
		scope: "Diff",
		subtitle: selectedPullRequestLabelAtom,
		disabledReason: pendingReviewReasonAtom,
		keywords: ["review", "approve", "request changes", "comment", "pending"],
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr || !(yield* Atom.get(selectedPendingReviewAtom))?.comments.length) return
			const selectedIndex = Math.max(
				0,
				submitReviewOptions.findIndex((option) => option.event === "APPROVE"),
			)
			yield* Atom.set(
				activeModalAtom,
				Modal.SubmitReview({
					repository: pr.repository,
					number: pr.number,
					focus: "action",
					selectedIndex,
					body: "",
					cursor: 0,
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "review.discard",
		title: "Discard pending review",
		scope: "Diff",
		subtitle: selectedPullRequestLabelAtom,
		disabledReason: pendingReviewReasonAtom,
		keywords: ["review", "queue", "draft", "delete"],
		run: Effect.gen(function* () {
			if (!(yield* Atom.get(selectedPendingReviewAtom))?.comments.length) return
			yield* Atom.set(activeModalAtom, Modal.PendingReview({ selectedIndex: 0, confirmingDiscard: true, running: false, error: null }))
		}),
	}),

	// === Comment mutations ===
	defineCommand({
		id: "comments.reply",
		title: "Reply to comment",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "shift-r",
		disabledReason: selectedCommentReasonAtom,
		keywords: ["respond", "thread"],
		run: Effect.sync(() => invokeHandoff("openReplyToSelectedComment")),
	}),
	defineCommand({
		id: "comments.edit",
		title: "Edit comment",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "e",
		disabledReason: ownCommentReasonAtom,
		keywords: ["update", "modify", "rewrite"],
		run: Effect.sync(() => invokeHandoff("openEditSelectedComment")),
	}),
	defineCommand({
		id: "comments.delete",
		title: "Delete comment",
		scope: "Comments",
		subtitle: selectedItemLabelAtom,
		shortcut: "x",
		disabledReason: ownCommentReasonAtom,
		keywords: ["remove", "destroy"],
		run: Effect.sync(() => invokeHandoff("openDeleteSelectedComment")),
	}),

	defineCommand({
		id: "app.quit",
		title: "Quit ghui",
		scope: "System",
		subtitle: "Leave the terminal UI",
		shortcut: "q",
		keywords: ["exit"],
		run: Effect.sync(() => invokeHandoff("quit")),
	}),
]
