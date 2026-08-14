export interface JjChangeSummary {
	readonly changeId: string
	readonly commitId: string
	readonly description: string
	readonly empty: boolean
	readonly conflicted: boolean
	readonly mutable: boolean
	readonly divergent: boolean
	readonly parentChangeIds: readonly string[]
	readonly bookmarks: readonly string[]
	readonly remoteBookmarks: readonly string[]
}

export interface JjWorkspaceSummary {
	readonly name: string
	readonly changeId: string
}

export interface WorkspaceSnapshot {
	readonly operationId: string
	readonly workspaceName: string
	readonly workspaceRoot: string
	readonly workingCopy: JjChangeSummary
	readonly stack: readonly JjChangeSummary[]
	readonly workspaces: readonly JjWorkspaceSummary[]
	readonly trunkRevision: string
	readonly capabilityReason: string | null
}

export const shortChangeId = (changeId: string): string => changeId.slice(0, 8)
export const shortCommitId = (commitId: string): string => commitId.slice(0, 8)

export const changeDisplayDescription = (change: JjChangeSummary): string => {
	const description = change.description.trim()
	return description.length > 0 ? description : "no description"
}

export const changeStateLabels = (change: JjChangeSummary): readonly string[] => {
	const labels: string[] = []
	if (change.empty) labels.push("empty")
	if (change.conflicted) labels.push("conflict")
	if (change.divergent) labels.push("divergent")
	if (!change.mutable) labels.push("immutable")
	return labels
}

export const unpublishedChangeCount = (snapshot: WorkspaceSnapshot): number =>
	snapshot.stack.filter((change) => change.mutable && !change.empty && change.remoteBookmarks.length === 0).length

export const conflictedChangeCount = (snapshot: WorkspaceSnapshot): number => snapshot.stack.filter((change) => change.conflicted).length

export const formatJjHeaderStatus = (snapshot: WorkspaceSnapshot, budget: number): string => {
	const segments = [
		`@ ${shortChangeId(snapshot.workingCopy.changeId)}`,
		conflictedChangeCount(snapshot) > 0 ? `${conflictedChangeCount(snapshot)} conflict` : null,
		unpublishedChangeCount(snapshot) > 0 ? `${unpublishedChangeCount(snapshot)} unpublished` : null,
		snapshot.trunkRevision ? `trunk ${snapshot.trunkRevision}` : null,
		snapshot.workspaceName !== "default" ? snapshot.workspaceName : null,
	].filter((segment): segment is string => segment !== null)
	while (segments.length > 1 && segments.join(" · ").length > budget) segments.pop()
	const text = segments.join(" · ")
	return text.length > budget ? text.slice(0, Math.max(0, budget)) : text
}
