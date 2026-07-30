import type { SurfaceViewConfig } from "../configStore.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"

export interface SurfaceColumn {
	readonly id: string
	readonly label: string
	readonly sortable: boolean
	readonly groupable: boolean
	readonly filterable: boolean
}

const columns = (ids: readonly string[]): readonly SurfaceColumn[] =>
	ids.map((id) => ({ id, label: id.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()), sortable: true, groupable: true, filterable: true }))

export const surfaceColumnSchemas = {
	repos: columns(["repository", "pullRequests", "issues", "updatedAt"]),
	pullRequests: columns(["title", "repository", "author", "state", "reviewStatus", "checkStatus", "updatedAt"]),
	issues: columns(["title", "repository", "author", "state", "comments", "updatedAt"]),
	releases: columns(["tagName", "name", "author", "draft", "prerelease", "publishedAt"]),
	actions: columns(["workflow", "title", "branch", "event", "status", "conclusion", "updatedAt"]),
	branches: columns(["name", "sha", "default", "protected"]),
	milestones: columns(["title", "state", "progress", "dueOn"]),
	environments: columns(["name", "state", "ref", "protectionRules"]),
	runners: columns(["name", "status", "busy", "os", "labels"]),
	notifications: columns(["subject", "repository", "reason", "subjectType", "updatedAt", "unread"]),
} as const satisfies Record<WorkspaceSurface, readonly SurfaceColumn[]>

export interface NormalizedSurfaceView {
	readonly view: SurfaceViewConfig
	readonly diagnostics: readonly string[]
}

export const normalizeSurfaceView = (surface: WorkspaceSurface, input: SurfaceViewConfig | undefined): NormalizedSurfaceView => {
	const schema = surfaceColumnSchemas[surface]
	const ids = new Set(schema.map((column) => column.id))
	const diagnostics: string[] = []
	const visibleColumns = (input?.visibleColumns ?? schema.map((column) => column.id)).filter((field) => {
		const valid = ids.has(field)
		if (!valid) diagnostics.push(`Removed unknown ${surface} column ${field}.`)
		return valid
	})
	const groupBy = input?.groupBy && ids.has(input.groupBy) && schema.find((column) => column.id === input.groupBy)?.groupable ? input.groupBy : null
	if (input?.groupBy && !groupBy) diagnostics.push(`Removed unsupported ${surface} group ${input.groupBy}.`)
	const sort = input?.sort && ids.has(input.sort.field) && schema.find((column) => column.id === input.sort?.field)?.sortable ? input.sort : undefined
	if (input?.sort && !sort) diagnostics.push(`Removed unsupported ${surface} sort ${input.sort.field}.`)
	const valueFilters = Object.fromEntries(
		Object.entries(input?.valueFilters ?? {}).filter(([field]) => {
			const valid = ids.has(field) && schema.find((column) => column.id === field)?.filterable
			if (!valid) diagnostics.push(`Removed unsupported ${surface} filter ${field}.`)
			return valid
		}),
	)
	return {
		view: {
			visibleColumns: visibleColumns.length > 0 ? visibleColumns : schema.map((column) => column.id),
			groupBy,
			...(sort ? { sort } : {}),
			valueFilters,
		},
		diagnostics,
	}
}

const fieldAliases: Readonly<Partial<Record<WorkspaceSurface, Readonly<Record<string, string>>>>> = {
	repos: { pullRequests: "pullRequestCount", issues: "issueCount", updatedAt: "lastActivityAt" },
	issues: { comments: "commentCount" },
	releases: { draft: "isDraft", prerelease: "isPrerelease" },
	actions: { workflow: "workflowName", title: "displayTitle", branch: "headBranch" },
	branches: { default: "isDefault" },
}

const valueAt = (item: Readonly<Record<string, unknown>>, field: string, surface?: WorkspaceSurface): string => {
	if (surface === "milestones" && field === "progress") {
		const open = Number(item.openIssues ?? 0)
		const closed = Number(item.closedIssues ?? 0)
		return String(open + closed === 0 ? 0 : Math.round((closed / (open + closed)) * 100))
	}
	if (surface === "environments" && (field === "state" || field === "ref")) {
		const deployment = item.latestDeployment
		if (deployment && typeof deployment === "object") {
			const key = field === "state" ? "state" : "ref"
			return String((deployment as Readonly<Record<string, unknown>>)[key] ?? "")
		}
		return ""
	}
	const resolvedField = fieldAliases[surface ?? "notifications"]?.[field] ?? field
	const value = item[resolvedField]
	if (value instanceof Date) return value.toISOString()
	if (Array.isArray(value))
		return value.map((entry) => (entry && typeof entry === "object" && "name" in entry ? String((entry as { readonly name: unknown }).name) : String(entry))).join(",")
	return value === null || value === undefined ? "" : String(value)
}

export const applySurfaceView = <T extends object>(items: readonly T[], view: SurfaceViewConfig, surface?: WorkspaceSurface): readonly T[] => {
	const records = items as readonly (T & Readonly<Record<string, unknown>>)[]
	const filtered = records.filter((item) =>
		Object.entries(view.valueFilters ?? {}).every(([field, accepted]) => accepted.length === 0 || accepted.includes(valueAt(item, field, surface))),
	)
	const sorted = view.sort
		? [...filtered].sort((left, right) => {
				const comparison = valueAt(left, view.sort!.field, surface).localeCompare(valueAt(right, view.sort!.field, surface), undefined, { numeric: true })
				return view.sort!.direction === "ascending" ? comparison : -comparison
			})
		: [...filtered]
	return view.groupBy
		? sorted.sort((left, right) => valueAt(left, view.groupBy!, surface).localeCompare(valueAt(right, view.groupBy!, surface), undefined, { numeric: true }))
		: sorted
}
