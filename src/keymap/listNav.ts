import { context } from "@ghui/keymap"
import { countedVerticalBindings } from "./helpers.ts"
import { workspaceSurfaceDescriptor, workspaceSurfaceRegistry, type WorkspaceSurface } from "../workspaceSurfaces.ts"

export interface ListNavCtx {
	readonly halfPage: number
	readonly visibleCount: number
	readonly hasFilter: boolean
	readonly activeSurface: WorkspaceSurface
	readonly surfaces: readonly WorkspaceSurface[]
	readonly canGoUpWorkspace: boolean
	readonly canScrollDetailPreview: boolean
	readonly runCommandById: (id: string) => void
	readonly openSelection: () => void
	readonly openRepositoryPicker: () => void
	readonly toggleFavoriteRepository: () => void
	readonly removeSelectedRepository: () => void
	readonly openFilterModal: () => void
	readonly goUpWorkspace: () => void
	readonly switchQueueMode: (delta: 1 | -1) => void
	readonly switchWorkspaceSurface: (surface: WorkspaceSurface) => void
	readonly cycleWorkspaceSurface: (delta: 1 | -1) => void
	readonly scrollDetailPreviewBy: (delta: number) => void
	readonly scrollDetailPreviewTo: (line: number) => void
	readonly clearFilter: () => void
	readonly stepSelected: (delta: number) => void
	readonly stepSelectedUp: (count?: number) => void
	readonly stepSelectedDown: (count?: number) => void
	readonly stepSelectedUpWrap: () => void
	readonly stepSelectedDownWithLoadMore: () => void
	readonly moveSelectedToPreviousGroup: () => void
	readonly moveSelectedToNextGroup: () => void
	readonly setSelected: (index: number) => void
}

const List = context<ListNavCtx>()
const itemSelected = (s: ListNavCtx) => (s.visibleCount > 0 ? true : "No item selected.")
const reposActive = (s: ListNavCtx) => s.activeSurface === "repos"
const filterableSurfaceActive = (s: ListNavCtx) => s.canGoUpWorkspace && workspaceSurfaceDescriptor(s.activeSurface).filterable
const pullRequestsActive = (s: ListNavCtx) => s.activeSurface === "pullRequests"
const issuesActive = (s: ListNavCtx) => s.activeSurface === "issues"
const releasesActive = (s: ListNavCtx) => s.activeSurface === "releases"
const branchesActive = (s: ListNavCtx) => s.activeSurface === "branches"
const milestonesActive = (s: ListNavCtx) => s.activeSurface === "milestones"
const environmentsActive = (s: ListNavCtx) => s.activeSurface === "environments"
const notificationsActive = (s: ListNavCtx) => s.activeSurface === "notifications"
const itemSurfaceActive = (s: ListNavCtx) => pullRequestsActive(s) || issuesActive(s)
const surfaceAt = (s: ListNavCtx, index: number) => s.surfaces[index] ?? null
const numericSurfaceBindings = workspaceSurfaceRegistry.slice(0, 9).map((descriptor, index) => ({
	id: `workspace.${descriptor.id}`,
	title: `Go to ${descriptor.label}`,
	keys: [`${index + 1}`],
	run: (s: ListNavCtx) => {
		const surface = surfaceAt(s, index)
		if (surface) s.switchWorkspaceSurface(surface)
	},
}))
const refreshBindings = workspaceSurfaceRegistry.flatMap((descriptor) =>
	descriptor.refreshCommandId
		? [
				{
					id: descriptor.refreshCommandId,
					title: `Refresh ${descriptor.label}`,
					keys: ["r"],
					when: (s: ListNavCtx) => s.activeSurface === descriptor.id,
					run: (s: ListNavCtx) => s.runCommandById(descriptor.refreshCommandId!),
				},
			]
		: [],
)
const goHome = (s: ListNavCtx) => {
	if (s.canGoUpWorkspace) s.goUpWorkspace()
	else s.switchWorkspaceSurface("repos")
}

export const listNavKeymap = List(
	// Single-key command shortcuts (delegate to existing AppCommand registry)
	...numericSurfaceBindings,
	...refreshBindings,
	{ id: "workspace.next-tab", title: "Next surface", keys: ["tab"], run: (s) => s.cycleWorkspaceSurface(1) },
	{ id: "workspace.prev-tab", title: "Previous surface", keys: ["shift+tab"], run: (s) => s.cycleWorkspaceSurface(-1) },
	{ id: "workspace.go-home", title: "Go home", keys: ["g h"], run: goHome },
	{ id: "workspace.go-repos", title: "Go to repositories", keys: ["g r"], run: goHome },
	{ id: "workspace.go-pulls", title: "Go to pull requests", keys: ["g p"], run: (s) => s.switchWorkspaceSurface("pullRequests") },
	{ id: "workspace.go-issues", title: "Go to issues", keys: ["g i"], run: (s) => s.switchWorkspaceSurface("issues") },
	{ id: "list.filter", title: "Filter", keys: ["/"], when: (s) => workspaceSurfaceDescriptor(s.activeSurface).filterable, run: (s) => s.runCommandById("filter.open") },
	{ id: "list.add-repo", title: "Add repository", keys: ["a"], when: reposActive, run: (s) => s.openRepositoryPicker() },
	{ id: "list.create-release", title: "Create release", keys: ["c"], when: releasesActive, run: (s) => s.runCommandById("release.create") },
	{ id: "list.edit-release", title: "Edit release", keys: ["e"], when: releasesActive, run: (s) => s.runCommandById("release.edit") },
	{ id: "list.delete-release", title: "Delete release", keys: ["x"], when: releasesActive, run: (s) => s.runCommandById("release.delete") },
	{ id: "list.create-branch", title: "Create branch", keys: ["c"], when: branchesActive, run: (s) => s.runCommandById("branch.create") },
	{ id: "list.delete-branch", title: "Delete branch", keys: ["x"], when: branchesActive, run: (s) => s.runCommandById("branch.delete") },
	{ id: "list.create-milestone", title: "Create milestone", keys: ["c"], when: milestonesActive, run: (s) => s.runCommandById("milestone.create") },
	{ id: "list.edit-milestone", title: "Edit milestone", keys: ["e"], when: milestonesActive, run: (s) => s.runCommandById("milestone.edit") },
	{ id: "list.toggle-milestone", title: "Close / reopen milestone", keys: ["s"], when: milestonesActive, run: (s) => s.runCommandById("milestone.toggleState") },
	{ id: "list.delete-milestone", title: "Delete milestone", keys: ["x"], when: milestonesActive, run: (s) => s.runCommandById("milestone.delete") },
	{ id: "list.open-environment", title: "Open environment", keys: ["o", "return"], when: environmentsActive, run: (s) => s.runCommandById("environment.open") },
	{
		id: "list.notification-open",
		title: "Open notification",
		keys: ["o", "return"],
		when: notificationsActive,
		enabled: itemSelected,
		run: (s) => s.runCommandById("notification.open"),
	},
	{
		id: "list.notification-toggle-read-filter",
		title: "Toggle unread / all",
		keys: ["u"],
		when: notificationsActive,
		run: (s) => s.runCommandById("notification.toggleReadFilter"),
	},
	{ id: "list.notification-type-filter", title: "Cycle notification type", keys: ["f"], when: notificationsActive, run: (s) => s.runCommandById("notification.cycleTypeFilter") },
	{
		id: "list.notification-select",
		title: "Select notification",
		keys: ["space"],
		when: notificationsActive,
		enabled: itemSelected,
		run: (s) => s.runCommandById("notification.select"),
	},
	{
		id: "list.notification-mark-read",
		title: "Mark notification read",
		keys: ["m"],
		when: notificationsActive,
		enabled: itemSelected,
		run: (s) => s.runCommandById("notification.markRead"),
	},
	{
		id: "list.notification-mark-selected-read",
		title: "Mark selected read",
		keys: ["shift+m"],
		when: notificationsActive,
		run: (s) => s.runCommandById("notification.markSelectedRead"),
	},
	{ id: "list.favorite-repo", title: "Favorite repository", keys: ["f"], when: reposActive, run: (s) => s.toggleFavoriteRepository() },
	{ id: "list.scope-filter", title: "Filter items", keys: ["f"], when: filterableSurfaceActive, run: (s) => s.openFilterModal() },
	{ id: "list.remove-repo", title: "Remove repository", keys: ["x"], when: reposActive, run: (s) => s.removeSelectedRepository() },
	{ id: "list.theme", title: "Theme", keys: ["t"], run: (s) => s.runCommandById("theme.open") },
	{ id: "list.configure-view", title: "Configure saved view", keys: ["v"], run: (s) => s.runCommandById("view.configure") },
	{ id: "list.diff", title: "Open diff", keys: ["d"], when: pullRequestsActive, run: (s) => s.runCommandById("diff.open") },
	{ id: "list.runs", title: "Open workflow runs", keys: ["a"], when: pullRequestsActive, run: (s) => s.runCommandById("runs.open") },
	{ id: "list.comments", title: "Open comments", keys: ["c"], when: itemSurfaceActive, enabled: itemSelected, run: (s) => s.runCommandById("comments.open") },
	{ id: "list.create-pr", title: "Create pull request", keys: ["n"], when: pullRequestsActive, run: (s) => s.runCommandById("pullRequest.create") },
	{ id: "list.edit-pr", title: "Edit pull request", keys: ["shift+e"], when: pullRequestsActive, enabled: itemSelected, run: (s) => s.runCommandById("pullRequest.edit") },
	{ id: "list.reopen-pr", title: "Reopen pull request", keys: ["u"], when: pullRequestsActive, enabled: itemSelected, run: (s) => s.runCommandById("pullRequest.reopen") },
	{ id: "list.approve-pr", title: "Approve pull request", keys: ["shift+a"], when: pullRequestsActive, enabled: itemSelected, run: (s) => s.runCommandById("pullRequest.approve") },
	{ id: "list.create-issue", title: "Create issue", keys: ["n"], when: issuesActive, run: (s) => s.runCommandById("issue.create") },
	{ id: "list.edit-issue", title: "Edit issue", keys: ["e"], when: issuesActive, enabled: itemSelected, run: (s) => s.runCommandById("issue.edit") },
	{ id: "list.reopen-issue", title: "Reopen issue", keys: ["u"], when: issuesActive, enabled: itemSelected, run: (s) => s.runCommandById("issue.reopen") },
	{ id: "list.delete-issue", title: "Delete issue", keys: ["shift+x"], when: issuesActive, enabled: itemSelected, run: (s) => s.runCommandById("issue.delete") },
	{ id: "list.review", title: "Review pull request", keys: ["shift+r"], when: pullRequestsActive, run: (s) => s.runCommandById("pull.submit-review") },
	{ id: "list.labels", title: "Labels", keys: ["l"], when: itemSurfaceActive, enabled: itemSelected, run: (s) => s.runCommandById("pull.labels") },
	{ id: "list.select-item", title: "Toggle item selection", keys: ["space"], when: itemSurfaceActive, enabled: itemSelected, run: (s) => s.runCommandById("items.select") },
	{ id: "list.bulk-edit", title: "Bulk edit selected items", keys: ["b"], when: itemSurfaceActive, run: (s) => s.runCommandById("items.bulkEdit") },
	{ id: "list.assignees", title: "Assignees", keys: ["g a"], when: itemSurfaceActive, enabled: itemSelected, run: (s) => s.runCommandById("item.assignees") },
	{ id: "list.milestone", title: "Milestone", keys: ["g m"], when: itemSurfaceActive, enabled: itemSelected, run: (s) => s.runCommandById("item.milestone") },
	{ id: "list.reviewers", title: "Reviewers", keys: ["g v"], when: pullRequestsActive, enabled: itemSelected, run: (s) => s.runCommandById("pullRequest.reviewers") },
	{ id: "list.base", title: "Base branch", keys: ["g b"], when: pullRequestsActive, enabled: itemSelected, run: (s) => s.runCommandById("pullRequest.base") },
	{ id: "list.merge", title: "Merge", keys: ["m", "shift+m"], when: pullRequestsActive, run: (s) => s.runCommandById("pull.merge") },
	{ id: "list.close-pr", title: "Close PR", keys: ["x"], when: pullRequestsActive, run: (s) => s.runCommandById("pull.close") },
	{ id: "list.close-issue", title: "Close issue", keys: ["x"], when: issuesActive, run: (s) => s.runCommandById("issue.close") },
	{ id: "list.open-browser", title: "Open in browser", keys: ["o"], when: pullRequestsActive, run: (s) => s.runCommandById("pull.open-browser") },
	{ id: "list.open-editor", title: "Open in editor", keys: ["e"], when: pullRequestsActive, run: (s) => s.runCommandById("pull.open-editor") },
	{ id: "list.issue-open-browser", title: "Open in browser", keys: ["o"], when: issuesActive, run: (s) => s.runCommandById("issue.open-browser") },
	{ id: "list.toggle-draft", title: "Toggle draft", keys: ["s", "shift+s"], when: pullRequestsActive, run: (s) => s.runCommandById("pull.toggle-draft") },
	{ id: "list.copy", title: "Copy metadata", keys: ["y"], when: pullRequestsActive, run: (s) => s.runCommandById("pull.copy-metadata") },
	{ id: "list.issue-copy", title: "Copy metadata", keys: ["y"], when: issuesActive, run: (s) => s.runCommandById("issue.copy-metadata") },
	{
		id: "list.detail.open",
		title: "Open selected",
		keys: ["return"],
		when: (s) => !environmentsActive(s) && !notificationsActive(s),
		enabled: itemSelected,
		run: (s) => s.openSelection(),
	},

	// Escape goes one level up: clear local filter first, otherwise leave repo scope.
	{
		id: "filter.clear",
		title: "Clear filter",
		keys: ["escape"],
		when: (s) => s.hasFilter,
		run: (s) => s.clearFilter(),
	},
	{
		id: "workspace.go-up",
		title: "Go up workspace",
		keys: ["escape"],
		when: (s) => !s.hasFilter,
		enabled: (s) => (s.canGoUpWorkspace ? true : "Already at top workspace."),
		run: (s) => s.goUpWorkspace(),
	},

	// Wide-layout detail preview scroll
	{
		id: "list.preview.top",
		title: "Detail preview top",
		keys: ["home"],
		enabled: (s) => (s.canScrollDetailPreview ? true : "Detail preview not visible."),
		run: (s) => s.scrollDetailPreviewTo(0),
	},
	{
		id: "list.preview.bottom",
		title: "Detail preview bottom",
		keys: ["end"],
		enabled: (s) => (s.canScrollDetailPreview ? true : "Detail preview not visible."),
		run: (s) => s.scrollDetailPreviewTo(Number.MAX_SAFE_INTEGER),
	},
	{
		id: "list.preview.half-up",
		title: "Detail preview ½ up",
		keys: ["pageup"],
		enabled: (s) => (s.canScrollDetailPreview ? true : "Detail preview not visible."),
		run: (s) => s.scrollDetailPreviewBy(-s.halfPage),
	},
	{
		id: "list.preview.half-down",
		title: "Detail preview ½ down",
		keys: ["pagedown"],
		enabled: (s) => (s.canScrollDetailPreview ? true : "Detail preview not visible."),
		run: (s) => s.scrollDetailPreviewBy(s.halfPage),
	},

	// Group jumps
	{
		id: "list.group-prev",
		title: "Previous group",
		keys: ["[", "meta+up", "meta+k", "shift+k"],
		run: (s) => s.moveSelectedToPreviousGroup(),
	},
	{
		id: "list.group-next",
		title: "Next group",
		keys: ["]", "meta+down", "meta+j", "shift+j"],
		run: (s) => s.moveSelectedToNextGroup(),
	},

	// Half-page steps
	{ id: "list.half-up", title: "Half page up", keys: ["ctrl+u"], run: (s) => s.stepSelected(-s.halfPage) },
	{ id: "list.half-down", title: "Half page down", keys: ["ctrl+d"], run: (s) => s.stepSelected(s.halfPage) },

	// Vim count prefixes
	...countedVerticalBindings<ListNavCtx>((s, delta) => {
		if (delta < 0) s.stepSelectedUp(-delta)
		else s.stepSelectedDown(delta)
	}),

	// Single-step (with wrap up, load-more on down)
	{ id: "list.up", title: "Up", keys: ["up", "k"], run: (s) => s.stepSelectedUpWrap() },
	{ id: "list.down", title: "Down", keys: ["down", "j"], run: (s) => s.stepSelectedDownWithLoadMore() },

	// Top / bottom
	{ id: "list.top", title: "Top", keys: ["g g"], run: (s) => s.setSelected(0) },
	{
		id: "list.bottom",
		title: "Bottom",
		keys: ["shift+g"],
		run: (s) => s.setSelected(s.visibleCount === 0 ? 0 : s.visibleCount - 1),
	},
)
