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
	readonly root: string | null
}

export type LocalRemoteRelation =
	| { readonly status: "exact"; readonly changeId: string; readonly commitId: string }
	| { readonly status: "local-ahead"; readonly changeId: string; readonly remoteCommitId: string }
	| { readonly status: "remote-ahead"; readonly changeId: string; readonly remoteCommitId: string }
	| { readonly status: "diverged"; readonly changeId: string; readonly remoteCommitId: string }
	| { readonly status: "conflicted"; readonly changeId: string }
	| { readonly status: "needs-fetch"; readonly headCommitId: string }
	| { readonly status: "unmapped"; readonly headCommitId: string }
	| { readonly status: "ambiguous"; readonly candidates: readonly string[] }

export interface ChangePrLink {
	readonly storeId: string
	readonly githubRepository: string
	readonly prNumber: number
	readonly changeId: string
	readonly bookmark: string | null
	readonly remoteName: string | null
	readonly localCommitId: string
	readonly githubHeadSha: string
	readonly observedAt: string
}

export interface WorkspaceHandoffPlan {
	readonly kind: "workspace-handoff"
	readonly existing: boolean
	readonly operationId: string
	readonly storeRoot: string
	readonly workspaceName: string
	readonly destinationPath: string
	readonly targetCommitId: string
	readonly sourceChangeId: string
	readonly currentWorkspaceName: string
	readonly currentWorkingCopyChangeId: string
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

export const formatRelationBadge = (relation: LocalRemoteRelation): string | null => {
	switch (relation.status) {
		case "exact":
			return "="
		case "local-ahead":
			return "↑"
		case "remote-ahead":
			return "↓"
		case "diverged":
			return "≠"
		case "conflicted":
			return "!"
		case "needs-fetch":
		case "ambiguous":
			return "?"
		case "unmapped":
			return null
	}
}

export const formatRelationExplanation = (relation: LocalRemoteRelation): string => {
	switch (relation.status) {
		case "exact":
			return `local change ${shortChangeId(relation.changeId)} matches PR head ${shortCommitId(relation.commitId)}`
		case "local-ahead":
			return `local change ${shortChangeId(relation.changeId)} was rewritten\nremote head ${shortCommitId(relation.remoteCommitId)} -> local ahead`
		case "remote-ahead":
			return `remote head ${shortCommitId(relation.remoteCommitId)} is ahead of local change ${shortChangeId(relation.changeId)}`
		case "diverged":
			return `local change ${shortChangeId(relation.changeId)} diverged from remote head ${shortCommitId(relation.remoteCommitId)}`
		case "conflicted":
			return `local change ${shortChangeId(relation.changeId)} is conflicted`
		case "needs-fetch":
			return `PR head ${shortCommitId(relation.headCommitId)} is not present locally; fetch to relate`
		case "unmapped":
			return `PR head ${shortCommitId(relation.headCommitId)} has no local JJ relationship`
		case "ambiguous":
			return `PR head matches multiple local changes: ${relation.candidates.map(shortChangeId).join(" ")}`
	}
}

const commitMatches = (change: JjChangeSummary, commitId: string): boolean => change.commitId === commitId

const changeById = (stack: readonly JjChangeSummary[]): Map<string, JjChangeSummary> => new Map(stack.map((change) => [change.changeId, change]))

const ancestorChangeIds = (stack: readonly JjChangeSummary[], startChangeId: string): Set<string> => {
	const byId = changeById(stack)
	const seen = new Set<string>()
	const walk = (id: string) => {
		if (seen.has(id)) return
		seen.add(id)
		const change = byId.get(id)
		if (!change) return
		for (const parent of change.parentChangeIds) walk(parent)
	}
	walk(startChangeId)
	seen.delete(startChangeId)
	return seen
}

const changeForCommit = (stack: readonly JjChangeSummary[], commitId: string): readonly JjChangeSummary[] => stack.filter((change) => commitMatches(change, commitId))

export const relateFromSnapshot = (snapshot: WorkspaceSnapshot, headCommitId: string, persistedChangeId: string | null): LocalRemoteRelation => {
	if (persistedChangeId) {
		const change = snapshot.stack.find((candidate) => candidate.changeId === persistedChangeId) ?? null
		if (!change) return { status: "unmapped", headCommitId }
		if (change.divergent) return { status: "ambiguous", candidates: [change.changeId] }
		if (change.conflicted) return { status: "conflicted", changeId: change.changeId }
		if (commitMatches(change, headCommitId)) return { status: "exact", changeId: change.changeId, commitId: change.commitId }
		const headChanges = changeForCommit(snapshot.stack, headCommitId)
		if (headChanges.length === 1 && ancestorChangeIds(snapshot.stack, change.changeId).has(headChanges[0]!.changeId)) {
			return { status: "local-ahead", changeId: change.changeId, remoteCommitId: headCommitId }
		}
		if (headChanges.length === 1 && ancestorChangeIds(snapshot.stack, headChanges[0]!.changeId).has(change.changeId)) {
			return { status: "remote-ahead", changeId: change.changeId, remoteCommitId: headCommitId }
		}
		return { status: "diverged", changeId: change.changeId, remoteCommitId: headCommitId }
	}

	const exact = changeForCommit(snapshot.stack, headCommitId).filter((change) => !change.divergent)
	if (exact.length === 1) {
		const change = exact[0]!
		if (change.conflicted) return { status: "conflicted", changeId: change.changeId }
		return { status: "exact", changeId: change.changeId, commitId: change.commitId }
	}
	if (exact.length > 1) return { status: "ambiguous", candidates: exact.map((change) => change.changeId) }
	const divergentMatches = changeForCommit(snapshot.stack, headCommitId).filter((change) => change.divergent)
	if (divergentMatches.length > 0) return { status: "ambiguous", candidates: divergentMatches.map((change) => change.changeId) }
	return { status: "unmapped", headCommitId }
}
