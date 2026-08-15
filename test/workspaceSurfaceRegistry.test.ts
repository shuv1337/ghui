import { describe, expect, test } from "bun:test"
import { computeWorkspaceTabLayout, workspaceTabSeparatorColumns } from "../src/ui/WorkspaceTabs.tsx"
import { repositoryWorkspaceSurfaces, userWorkspaceSurfaces, workspaceSurfaceDescriptor, workspaceSurfaceRegistry, workspaceSurfacesForScope } from "../src/workspaceSurfaces.ts"

describe("workspace Surface registry", () => {
	test("is the only source for user and repository navigation", () => {
		expect(userWorkspaceSurfaces).toEqual(["repos", "pullRequests", "issues", "notifications"])
		expect(repositoryWorkspaceSurfaces).toEqual(["pullRequests", "changes", "issues", "releases", "actions", "branches", "milestones", "environments", "runners"])
		expect(workspaceSurfacesForScope("user")).toEqual(userWorkspaceSurfaces)
		expect(workspaceSurfacesForScope("repository")).toEqual(repositoryWorkspaceSurfaces)
	})

	test("owns behavior metadata for every registered Surface", () => {
		expect(workspaceSurfaceRegistry.map((descriptor) => descriptor.id)).toEqual([
			"repos",
			"pullRequests",
			"changes",
			"issues",
			"releases",
			"actions",
			"branches",
			"milestones",
			"environments",
			"runners",
			"notifications",
		])
		expect(workspaceSurfaceDescriptor("pullRequests")).toMatchObject({
			badgeSource: "pullRequests",
			loadingSource: "pullRequests",
			refreshCommandId: "pull.refresh",
			filterable: true,
			fullscreen: "pullRequest",
		})
		expect(workspaceSurfaceDescriptor("issues").refreshCommandId).toBe("issue.refresh")
		expect(workspaceSurfaceDescriptor("releases")).toMatchObject({
			scopes: ["repository"],
			refreshCommandId: "release.refresh",
			badgeSource: "releases",
		})
		expect(workspaceSurfaceDescriptor("actions")).toMatchObject({
			scopes: ["repository"],
			refreshCommandId: "actions.refresh",
			badgeSource: "actions",
			filterable: true,
		})
		expect(workspaceSurfaceDescriptor("branches").refreshCommandId).toBe("branch.refresh")
		expect(workspaceSurfaceDescriptor("milestones").refreshCommandId).toBe("milestone.refresh")
		expect(workspaceSurfaceDescriptor("environments").refreshCommandId).toBe("environment.refresh")
		expect(workspaceSurfaceDescriptor("runners")).toMatchObject({ refreshCommandId: "runner.refresh", capabilityReason: expect.any(String) })
		expect(workspaceSurfaceDescriptor("repos").scopes).toEqual(["user"])
	})

	test("moves excess tabs into a compact cycling picker instead of truncating them", () => {
		const counts = { repos: 12, pullRequests: 34, issues: 56 }
		const narrow = computeWorkspaceTabLayout("pullRequests", 24, counts)
		expect(narrow.primary.length).toBeLessThan(workspaceSurfaceRegistry.length)
		expect(narrow.overflow.length).toBeGreaterThan(0)
		expect(narrow.overflowText).toContain("PULL REQUESTS")
		expect(narrow.primary.length + narrow.overflow.length).toBe(workspaceSurfaceRegistry.length)

		const separators = workspaceTabSeparatorColumns(counts, userWorkspaceSurfaces, 24, "pullRequests")
		expect(separators.at(-1)).toBeLessThanOrEqual(23)
	})

	test("keeps every Surface as a primary tab when the row fits", () => {
		expect(computeWorkspaceTabLayout("issues", 100, {}, userWorkspaceSurfaces)).toEqual({
			primary: userWorkspaceSurfaces,
			overflow: [],
			overflowText: null,
		})
	})
})
