import { workspaceSurfaceRegistry, workspaceSurfacesForScope, type WorkspaceSurface } from "./workspace/surfaceRegistry.js"

export type { WorkspaceSurface } from "./workspace/surfaceRegistry.js"
export { workspaceSurfaceDescriptor, workspaceSurfaceRegistry, workspaceSurfacesForScope } from "./workspace/surfaceRegistry.js"

export const repositoryWorkspaceSurfaces = workspaceSurfacesForScope("repository")
export const userWorkspaceSurfaces = workspaceSurfacesForScope("user")
export const workspaceSurfaces = workspaceSurfaceRegistry.map((descriptor) => descriptor.id)

export const workspaceSurfaceLabels = Object.fromEntries(workspaceSurfaceRegistry.map((descriptor) => [descriptor.id, descriptor.label])) as Record<WorkspaceSurface, string>

export const nextWorkspaceSurface = (surface: WorkspaceSurface, delta: 1 | -1, surfaces: readonly WorkspaceSurface[] = workspaceSurfaces): WorkspaceSurface => {
	const index = Math.max(0, surfaces.indexOf(surface))
	const next = (index + delta + surfaces.length) % surfaces.length
	return surfaces[next]!
}
