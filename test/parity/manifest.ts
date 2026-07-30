export const parityStatuses = ["existing", "partial", "missing", "excluded", "complete"] as const
export type ParityStatus = (typeof parityStatuses)[number]

export const parityScopes = ["user", "repository", "pullRequest", "issue", "program"] as const
export type ParityScope = (typeof parityScopes)[number]

export interface ParityScenarios {
	readonly unit: readonly string[]
	readonly render: readonly string[]
	readonly interaction: readonly string[]
	readonly live: readonly string[]
}

export interface ParityCapability {
	readonly id: string
	readonly title: string
	readonly scope: ParityScope
	readonly milestone: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | null
	readonly status: ParityStatus
	readonly commandIds: readonly string[]
	readonly serviceMethods: readonly string[]
	readonly scenarios: ParityScenarios
	readonly requiresLive: boolean
	readonly exclusionReason?: string
}

const scenarios = (
	id: string,
	{
		unit = true,
		render = true,
		interaction = true,
		live = true,
	}: {
		readonly unit?: boolean
		readonly render?: boolean
		readonly interaction?: boolean
		readonly live?: boolean
	} = {},
): ParityScenarios => ({
	unit: unit ? [`unit.${id}`] : [],
	render: render ? [`render.${id}`] : [],
	interaction: interaction ? [`interaction.${id}`] : [],
	live: live ? [`live.${id}`] : [],
})

const excluded = (id: string, title: string, exclusionReason: string): ParityCapability => ({
	id,
	title,
	scope: "program",
	milestone: null,
	status: "excluded",
	commandIds: [],
	serviceMethods: [],
	scenarios: { unit: [], render: [], interaction: [], live: [] },
	requiresLive: false,
	exclusionReason,
})

export const parityManifest = [
	{
		id: "workspace-navigation",
		title: "User and repository workspace navigation",
		scope: "user",
		milestone: 0,
		status: "partial",
		commandIds: ["workspace.repos", "workspace.pullRequests", "workspace.issues"],
		serviceMethods: ["getRepositoryDetails"],
		scenarios: scenarios("workspace-navigation"),
		requiresLive: true,
	},
	{
		id: "pull-request-browse",
		title: "Pull Request lists, queues, details, and pagination",
		scope: "pullRequest",
		milestone: 0,
		status: "partial",
		commandIds: ["workspace.pullRequests", "item.refresh"],
		serviceMethods: ["listPullRequestPage", "getPullRequestDetails"],
		scenarios: scenarios("pull-request-browse"),
		requiresLive: true,
	},
	{
		id: "issue-browse",
		title: "Issue lists, details, comments, and pagination",
		scope: "issue",
		milestone: 0,
		status: "partial",
		commandIds: ["workspace.issues", "item.refresh"],
		serviceMethods: ["listIssuePage", "listIssueComments"],
		scenarios: scenarios("issue-browse"),
		requiresLive: true,
	},
	{
		id: "themes",
		title: "Bundled and system-aware themes",
		scope: "program",
		milestone: 0,
		status: "complete",
		commandIds: ["appearance.theme"],
		serviceMethods: [],
		scenarios: scenarios("themes", { live: false }),
		requiresLive: false,
	},
	{
		id: "mouse",
		title: "Mouse selection, activation, links, and scrolling",
		scope: "program",
		milestone: 0,
		status: "complete",
		commandIds: ["workspace.pullRequests"],
		serviceMethods: [],
		scenarios: scenarios("mouse", { live: false }),
		requiresLive: false,
	},
	{
		id: "releases",
		title: "Repository Releases list, details, create, edit, and delete",
		scope: "repository",
		milestone: 1,
		status: "partial",
		commandIds: ["workspace.releases", "release.create", "release.edit", "release.delete"],
		serviceMethods: ["listReleases", "createRelease", "editRelease", "deleteRelease"],
		scenarios: scenarios("releases"),
		requiresLive: true,
	},
	{
		id: "surface-registry",
		title: "Scope-aware Surface registry and narrow overflow picker",
		scope: "program",
		milestone: 1,
		status: "complete",
		commandIds: ["workspace.surfacePicker"],
		serviceMethods: [],
		scenarios: scenarios("surface-registry", { live: false }),
		requiresLive: false,
	},
	{
		id: "versioned-config",
		title: "Versioned backward-compatible application configuration",
		scope: "program",
		milestone: 1,
		status: "complete",
		commandIds: ["settings.resetSurface", "settings.resetAll"],
		serviceMethods: [],
		scenarios: scenarios("versioned-config", { live: false }),
		requiresLive: false,
	},
	{
		id: "cache-lifecycle",
		title: "Additive cache-first resource loading and convergence",
		scope: "program",
		milestone: 1,
		status: "complete",
		commandIds: ["item.refresh"],
		serviceMethods: [],
		scenarios: scenarios("cache-lifecycle", { live: false }),
		requiresLive: false,
	},
	{
		id: "issue-management",
		title: "Issue create, edit, close, reopen, delete, and metadata",
		scope: "issue",
		milestone: 2,
		status: "partial",
		commandIds: ["issue.create", "issue.edit", "issue.close", "issue.reopen", "issue.delete", "item.labels", "item.assignees", "item.milestone"],
		serviceMethods: ["createIssue", "editIssue", "closeIssue", "reopenIssue", "deleteIssue"],
		scenarios: scenarios("issue-management"),
		requiresLive: true,
	},
	{
		id: "pull-request-management",
		title: "Pull Request create, edit, reopen, draft, review, and merge metadata",
		scope: "pullRequest",
		milestone: 2,
		status: "partial",
		commandIds: [
			"pullRequest.create",
			"pullRequest.edit",
			"pullRequest.close",
			"pullRequest.reopen",
			"pullRequest.toggleDraft",
			"pullRequest.approve",
			"pullRequest.merge",
			"pullRequest.reviewers",
			"pullRequest.base",
		],
		serviceMethods: ["createPullRequest", "editPullRequest", "closePullRequest", "reopenPullRequest", "toggleDraftStatus", "approvePullRequest", "mergePullRequest"],
		scenarios: scenarios("pull-request-management"),
		requiresLive: true,
	},
	{
		id: "metadata-selectors",
		title: "Searchable metadata selectors",
		scope: "repository",
		milestone: 2,
		status: "partial",
		commandIds: ["item.labels", "item.assignees", "pullRequest.reviewers", "item.milestone", "pullRequest.base"],
		serviceMethods: ["listRepoLabels", "listAssignees", "listReviewers", "listMilestones", "listBranches"],
		scenarios: scenarios("metadata-selectors"),
		requiresLive: true,
	},
	{
		id: "bulk-item-operations",
		title: "Bounded Issue and Pull Request bulk operations",
		scope: "repository",
		milestone: 2,
		status: "partial",
		commandIds: ["items.select", "items.clearSelection", "items.bulkEdit", "items.retryFailed"],
		serviceMethods: ["editIssue", "editPullRequest"],
		scenarios: scenarios("bulk-item-operations"),
		requiresLive: true,
	},
	{
		id: "pending-reviews",
		title: "Server-backed pending review lifecycle and atomic submission",
		scope: "pullRequest",
		milestone: 3,
		status: "partial",
		commandIds: ["review.pending", "review.submit", "review.discard"],
		serviceMethods: ["findPendingReview", "createPendingReview", "addPendingReviewComment", "submitPendingReview", "discardPendingReview"],
		scenarios: scenarios("pending-reviews"),
		requiresLive: true,
	},
	{
		id: "suggestions",
		title: "Accurate single-line and multiline GitHub suggestions",
		scope: "pullRequest",
		milestone: 3,
		status: "partial",
		commandIds: ["diff.suggest"],
		serviceMethods: ["addPendingReviewComment"],
		scenarios: scenarios("suggestions"),
		requiresLive: true,
	},
	{
		id: "diff-rendering",
		title: "Semantic, highlighted, windowed Pull Request diffs",
		scope: "pullRequest",
		milestone: 3,
		status: "partial",
		commandIds: ["pullRequest.diff", "diff.toggleLayout", "diff.toggleWhitespace", "diff.toggleWrap"],
		serviceMethods: ["getPullRequestDiff"],
		scenarios: scenarios("diff-rendering"),
		requiresLive: true,
	},
	{
		id: "actions",
		title: "Repository-wide Actions, jobs, logs, dispatch, retry, and cancel",
		scope: "repository",
		milestone: 4,
		status: "partial",
		commandIds: [
			"workspace.actions",
			"actions.refresh",
			"actions.dispatch",
			"actions.retry",
			"actions.cancel",
			"actions.cycleStatusFilter",
			"actions.cycleWorkflowFilter",
			"filter.open",
		],
		serviceMethods: ["listWorkflowRuns", "getWorkflowRunDetails", "getJobLog", "dispatchWorkflow", "retryRun", "cancelRun"],
		scenarios: scenarios("actions"),
		requiresLive: true,
	},
	{
		id: "action-artifacts",
		title: "Explicit and safe Actions artifact download",
		scope: "repository",
		milestone: 4,
		status: "partial",
		commandIds: ["actions.downloadArtifact"],
		serviceMethods: ["listArtifacts", "downloadArtifact"],
		scenarios: scenarios("action-artifacts"),
		requiresLive: true,
	},
	{
		id: "branches",
		title: "Repository Branches list, create, and guarded delete",
		scope: "repository",
		milestone: 5,
		status: "partial",
		commandIds: ["workspace.branches", "branch.refresh", "branch.create", "branch.delete"],
		serviceMethods: ["listBranches", "createBranch", "deleteBranch"],
		scenarios: scenarios("branches"),
		requiresLive: true,
	},
	{
		id: "milestones",
		title: "Repository Milestones and nested issues",
		scope: "repository",
		milestone: 5,
		status: "partial",
		commandIds: ["workspace.milestones", "milestone.refresh", "milestone.create", "milestone.edit", "milestone.toggleState", "milestone.delete"],
		serviceMethods: ["listMilestones", "listMilestoneIssues", "createMilestone", "editMilestone", "deleteMilestone"],
		scenarios: scenarios("milestones"),
		requiresLive: true,
	},
	{
		id: "environments-deployments",
		title: "Read-only Environments and deployment history",
		scope: "repository",
		milestone: 5,
		status: "partial",
		commandIds: ["workspace.environments", "environment.refresh", "environment.open"],
		serviceMethods: ["listEnvironments", "listDeployments"],
		scenarios: scenarios("environments-deployments"),
		requiresLive: true,
	},
	{
		id: "runners",
		title: "Read-only repository runner status and details",
		scope: "repository",
		milestone: 5,
		status: "partial",
		commandIds: ["workspace.runners", "runner.refresh"],
		serviceMethods: ["listRunners"],
		scenarios: scenarios("runners"),
		requiresLive: true,
	},
	{
		id: "notifications",
		title: "User Notifications browse, open, and mark read",
		scope: "user",
		milestone: 6,
		status: "partial",
		commandIds: [
			"workspace.notifications",
			"notification.refresh",
			"notification.toggleReadFilter",
			"notification.cycleTypeFilter",
			"notification.select",
			"notification.open",
			"notification.markRead",
			"notification.markSelectedRead",
		],
		serviceMethods: ["listNotifications", "markNotificationRead"],
		scenarios: scenarios("notifications"),
		requiresLive: true,
	},
	{
		id: "saved-views",
		title: "Persistent columns, sort, grouping, and value filters",
		scope: "program",
		milestone: 6,
		status: "complete",
		commandIds: ["view.configure", "settings.resetSurface"],
		serviceMethods: [],
		scenarios: scenarios("saved-views", { live: false }),
		requiresLive: false,
	},
	{
		id: "configurable-keybindings",
		title: "Command-id key overrides and diagnostics",
		scope: "program",
		milestone: 6,
		status: "complete",
		commandIds: ["settings.keybindings", "settings.resetAll"],
		serviceMethods: [],
		scenarios: scenarios("configurable-keybindings", { live: false }),
		requiresLive: false,
	},
	{
		id: "cli-operations",
		title: "Doctor, cache, open, and repos CLI commands",
		scope: "program",
		milestone: 7,
		status: "partial",
		commandIds: ["cli.doctor", "cli.cacheList", "cli.cacheClean", "cli.open", "cli.repos"],
		serviceMethods: [],
		scenarios: scenarios("cli-operations"),
		requiresLive: true,
	},
	excluded("gitlab-hosting", "GitLab host support", "ghui remains a GitHub-only product."),
	excluded(
		"gitlab-only-fields",
		"GitLab-only fields and actions",
		"Confidentiality, weight, todos, GitLab runner mutations, manual jobs, and pipeline variables have no GitHub parity target.",
	),
	excluded("pull-request-deletion", "Pull Request deletion", "GitHub does not support deleting Pull Requests."),
	excluded("embedded-terminal", "Embedded terminal Surface", "A terminal multiplexer is not GitHub feature parity and ghui already runs in the user's terminal."),
	excluded(
		"rust-architecture",
		"Copied Rust state/event architecture",
		"Implementation must preserve ghui's TypeScript, React/OpenTUI, Effect, Atom, Surface, and command patterns.",
	),
	excluded("self-updater", "In-app self-updater", "Updates remain the responsibility of npm and Homebrew."),
] as const satisfies readonly ParityCapability[]

export type ParityCapabilityId = (typeof parityManifest)[number]["id"]

export const automatedFactVerificationOwners = {
	"parity-contract": ["test:parity-manifest"],
	"existing-workflows": ["test:fast-gate", "test:package-smoke"],
	"scope-layout": ["capability:surface-registry"],
	"surface-reachability": ["test:parity-interactions"],
	"surface-states": ["test:surface-contract"],
	"surface-registry": ["capability:surface-registry"],
	"github-service": ["test:service-contract"],
	"command-entrypoint": ["test:command-effects"],
	"mutation-safety": ["test:command-confirmations"],
	"config-compatibility": ["capability:versioned-config"],
	"cache-safety": ["capability:cache-lifecycle"],
	releases: ["capability:releases"],
	issues: ["capability:issue-management"],
	"pull-requests": ["capability:pull-request-management"],
	"selectors-and-bulk": ["capability:metadata-selectors", "capability:bulk-item-operations"],
	"atomic-reviews": ["capability:pending-reviews"],
	"suggestions-and-diffs": ["capability:suggestions", "capability:diff-rendering"],
	"syntax-validation": ["test:diff-highlighter-lifecycle"],
	actions: ["capability:actions"],
	artifacts: ["capability:action-artifacts"],
	branches: ["capability:branches"],
	milestones: ["capability:milestones"],
	environments: ["capability:environments-deployments"],
	runners: ["capability:runners"],
	notifications: ["capability:notifications"],
	"saved-views": ["capability:saved-views"],
	keybindings: ["capability:configurable-keybindings"],
	"cli-operations": ["capability:cli-operations"],
	"github-command-contract": ["test:fake-gh"],
	"service-contract-tests": ["test:service-contract"],
	"deterministic-harness": ["test:fake-gh", "test:opentui-parity-harness"],
	"live-validation": ["test:live-safety-guard"],
	"releasable-milestones": ["test:milestone-gate"],
	"final-release-validation": ["test:release-proof"],
	"explicit-exclusions": ["test:parity-manifest"],
} as const satisfies Readonly<Record<string, readonly string[]>>

export interface ParityManifestProblem {
	readonly capabilityId: string
	readonly message: string
}

const duplicateValues = (values: readonly string[]) => {
	const seen = new Set<string>()
	const duplicates = new Set<string>()
	for (const value of values) {
		if (seen.has(value)) duplicates.add(value)
		seen.add(value)
	}
	return [...duplicates]
}

export interface ParityManifestValidationOptions {
	readonly registeredCapabilityIds?: readonly string[]
}

export const validateParityManifest = (
	manifest: readonly ParityCapability[] = parityManifest,
	{ registeredCapabilityIds = [] }: ParityManifestValidationOptions = {},
): readonly ParityManifestProblem[] => {
	const problems: ParityManifestProblem[] = []
	for (const id of duplicateValues(manifest.map((capability) => capability.id))) {
		problems.push({ capabilityId: id, message: "duplicate capability id" })
	}

	for (const capability of manifest) {
		if (capability.status === "excluded") {
			if (capability.milestone !== null) problems.push({ capabilityId: capability.id, message: "excluded capability must not have an owner milestone" })
			if (!capability.exclusionReason?.trim()) problems.push({ capabilityId: capability.id, message: "excluded capability requires a reason" })
			continue
		}

		if (capability.milestone === null) problems.push({ capabilityId: capability.id, message: "in-scope capability requires an owner milestone" })
		if (capability.commandIds.length === 0 && capability.serviceMethods.length === 0) {
			problems.push({ capabilityId: capability.id, message: "in-scope capability requires a command id or service method" })
		}

		if (capability.scenarios.unit.length === 0) problems.push({ capabilityId: capability.id, message: "in-scope capability requires a unit scenario" })
		if (capability.scenarios.render.length === 0) problems.push({ capabilityId: capability.id, message: "in-scope capability requires a render scenario" })
		if (capability.scenarios.interaction.length === 0) problems.push({ capabilityId: capability.id, message: "in-scope capability requires an interaction scenario" })
		if (capability.requiresLive && capability.scenarios.live.length === 0)
			problems.push({ capabilityId: capability.id, message: "in-scope API capability requires a live scenario" })
	}

	for (const capabilityId of registeredCapabilityIds) {
		const capability = manifest.find((entry) => entry.id === capabilityId)
		if (!capability) {
			problems.push({ capabilityId, message: "registered capability is absent from the parity manifest" })
		} else if (capability.status === "missing") {
			problems.push({ capabilityId, message: "registered capability cannot remain missing" })
		} else if (capability.status === "excluded") {
			problems.push({ capabilityId, message: "excluded capability cannot be registered" })
		}
	}

	return problems
}

export interface ParityReport {
	readonly generatedAt: string
	readonly counts: Readonly<Record<ParityStatus, number>>
	readonly milestones: readonly {
		readonly milestone: number
		readonly complete: number
		readonly total: number
		readonly capabilityIds: readonly string[]
	}[]
	readonly exclusions: readonly { readonly id: string; readonly reason: string }[]
	readonly problems: readonly ParityManifestProblem[]
}

export const buildParityReport = (generatedAt = new Date().toISOString(), manifest: readonly ParityCapability[] = parityManifest): ParityReport => {
	const counts = Object.fromEntries(parityStatuses.map((status) => [status, manifest.filter((capability) => capability.status === status).length])) as Record<ParityStatus, number>
	const milestones = Array.from({ length: 8 }, (_, milestone) => {
		const entries = manifest.filter((capability) => capability.milestone === milestone)
		return {
			milestone,
			complete: entries.filter((capability) => capability.status === "complete").length,
			total: entries.length,
			capabilityIds: entries.map((capability) => capability.id),
		}
	})

	return {
		generatedAt,
		counts,
		milestones,
		exclusions: manifest.filter((capability) => capability.status === "excluded").map((capability) => ({ id: capability.id, reason: capability.exclusionReason ?? "" })),
		problems: validateParityManifest(manifest),
	}
}
