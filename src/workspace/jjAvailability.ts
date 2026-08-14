import { isSupportedJjVersion, type RepositoryContextSnapshot } from "../services/RepositoryContext.js"

export const jjLocalStateConnected = (context: RepositoryContextSnapshot): boolean =>
	context.localKind === "jj" && (context.jjVersion === null || isSupportedJjVersion(context.jjVersion))

export const jjChangesSurfaceAvailable = (context: RepositoryContextSnapshot, selectedRepository: string | null): boolean => {
	if (!jjLocalStateConnected(context) || !selectedRepository) return false
	const repositories = new Set(
		[context.githubRepository, context.reviewRepository, context.pushRemote?.githubRepository].filter((value): value is string => value !== null && value !== undefined),
	)
	return repositories.has(selectedRepository)
}

export const visibleWorkspaceSurfaces = (
	surfaces: readonly import("./surfaceRegistry.js").WorkspaceSurface[],
	context: RepositoryContextSnapshot,
	selectedRepository: string | null,
): readonly import("./surfaceRegistry.js").WorkspaceSurface[] =>
	jjChangesSurfaceAvailable(context, selectedRepository) ? surfaces : surfaces.filter((surface) => surface !== "changes")
