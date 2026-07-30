export type WorkspaceScopeKind = "user" | "repository"

export type WorkspaceSurfaceBadgeSource =
	| "repositories"
	| "pullRequests"
	| "issues"
	| "releases"
	| "actions"
	| "branches"
	| "milestones"
	| "environments"
	| "runners"
	| "notifications"
export type WorkspaceSurfaceLoadingSource = "pullRequests" | "issues" | "releases" | "actions" | "branches" | "milestones" | "environments" | "runners" | "notifications" | null
export type WorkspaceSurfaceFullscreenMode = "none" | "details" | "pullRequest"

export interface WorkspaceSurfaceDescriptor<Id extends string = string> {
	readonly id: Id
	readonly label: string
	readonly scopes: readonly WorkspaceScopeKind[]
	readonly badgeSource: WorkspaceSurfaceBadgeSource
	readonly loadingSource: WorkspaceSurfaceLoadingSource
	readonly refreshCommandId: string | null
	readonly filterable: boolean
	readonly fullscreen: WorkspaceSurfaceFullscreenMode
	readonly capabilityReason?: string
}

/**
 * The single source of truth for user-reachable workspace Surfaces.
 *
 * A Surface is added here only after its route, service, render path, command,
 * and deterministic scenario are usable. The parity manifest inventories
 * planned Surfaces separately so incomplete work never leaks into navigation.
 */
export const workspaceSurfaceRegistry = [
	{
		id: "repos",
		label: "REPOS",
		scopes: ["user"],
		badgeSource: "repositories",
		loadingSource: null,
		refreshCommandId: null,
		filterable: true,
		fullscreen: "details",
	},
	{
		id: "pullRequests",
		label: "PULL REQUESTS",
		scopes: ["user", "repository"],
		badgeSource: "pullRequests",
		loadingSource: "pullRequests",
		refreshCommandId: "pull.refresh",
		filterable: true,
		fullscreen: "pullRequest",
	},
	{
		id: "issues",
		label: "ISSUES",
		scopes: ["user", "repository"],
		badgeSource: "issues",
		loadingSource: "issues",
		refreshCommandId: "issue.refresh",
		filterable: true,
		fullscreen: "details",
	},
	{
		id: "releases",
		label: "RELEASES",
		scopes: ["repository"],
		badgeSource: "releases",
		loadingSource: "releases",
		refreshCommandId: "release.refresh",
		filterable: false,
		fullscreen: "details",
	},
	{
		id: "actions",
		label: "ACTIONS",
		scopes: ["repository"],
		badgeSource: "actions",
		loadingSource: "actions",
		refreshCommandId: "actions.refresh",
		filterable: true,
		fullscreen: "none",
	},
	{
		id: "branches",
		label: "BRANCHES",
		scopes: ["repository"],
		badgeSource: "branches",
		loadingSource: "branches",
		refreshCommandId: "branch.refresh",
		filterable: false,
		fullscreen: "none",
	},
	{
		id: "milestones",
		label: "MILESTONES",
		scopes: ["repository"],
		badgeSource: "milestones",
		loadingSource: "milestones",
		refreshCommandId: "milestone.refresh",
		filterable: false,
		fullscreen: "none",
	},
	{
		id: "environments",
		label: "ENVIRONMENTS",
		scopes: ["repository"],
		badgeSource: "environments",
		loadingSource: "environments",
		refreshCommandId: "environment.refresh",
		filterable: false,
		fullscreen: "none",
	},
	{
		id: "runners",
		label: "RUNNERS",
		scopes: ["repository"],
		badgeSource: "runners",
		loadingSource: "runners",
		refreshCommandId: "runner.refresh",
		filterable: false,
		fullscreen: "none",
		capabilityReason: "Repository runner management is read-only; admin permission is required to list runners.",
	},
	{
		id: "notifications",
		label: "NOTIFICATIONS",
		scopes: ["user"],
		badgeSource: "notifications",
		loadingSource: "notifications",
		refreshCommandId: "notification.refresh",
		filterable: true,
		fullscreen: "none",
	},
] as const satisfies readonly WorkspaceSurfaceDescriptor[]

export type WorkspaceSurface = (typeof workspaceSurfaceRegistry)[number]["id"]
export type RegisteredWorkspaceSurfaceDescriptor = (typeof workspaceSurfaceRegistry)[number]

export const workspaceSurfaceDescriptor = (surface: WorkspaceSurface): RegisteredWorkspaceSurfaceDescriptor => {
	const descriptor = workspaceSurfaceRegistry.find((candidate) => candidate.id === surface)
	if (!descriptor) throw new Error(`Unregistered workspace surface: ${surface}`)
	return descriptor
}

export const workspaceSurfacesForScope = (scope: WorkspaceScopeKind): readonly WorkspaceSurface[] =>
	workspaceSurfaceRegistry.filter((descriptor) => (descriptor.scopes as readonly WorkspaceScopeKind[]).includes(scope)).map((descriptor) => descriptor.id)
