import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { ParityCapability } from "./manifest.js"

export interface ScenarioEvidence {
	readonly id: string
	readonly files: readonly string[]
}

export interface CapabilityScenarioEvidence {
	readonly unit: ScenarioEvidence
	readonly render: ScenarioEvidence
	readonly interaction: ScenarioEvidence
	readonly live: ScenarioEvidence | null
}

const test = (name: string) => `test/${name}`
const liveFile = "dev/live-parity.ts"

const evidence = (id: string, unit: readonly string[], render: readonly string[], interaction: readonly string[], live = true): readonly [string, CapabilityScenarioEvidence] => [
	id,
	{
		unit: { id: `unit.${id}`, files: unit },
		render: { id: `render.${id}`, files: render },
		interaction: { id: `interaction.${id}`, files: interaction },
		live: live ? { id: `live.${id}`, files: [liveFile, test("liveParityRunner.test.ts")] } : null,
	},
]

export const parityScenarioEvidence = Object.fromEntries([
	evidence("workspace-navigation", [test("workspaceScope.test.ts")], [test("workspaceLayout.test.ts")], [test("parityHarness.test.tsx")]),
	evidence("pull-request-browse", [test("pullRequestPagination.test.ts")], [test("pullRequestList.test.ts")], [test("workspaceScope.test.ts")]),
	evidence("issue-browse", [test("item.test.ts")], [test("issueList.test.ts")], [test("itemManagementSurface.test.tsx")]),
	evidence("themes", [test("themeConfig.test.ts")], [test("smallTerminal.test.tsx")], [test("parityHarness.test.tsx")], false),
	evidence("mouse", [test("scrolling.test.tsx")], [test("paneLayout.test.tsx")], [test("parityHarness.test.tsx")], false),
	evidence("releases", [test("githubReleases.test.ts")], [test("releasesSurface.test.tsx")], [test("releasesSurface.test.tsx")]),
	evidence("surface-registry", [test("workspaceSurfaceRegistry.test.ts")], [test("workspaceLayout.test.ts")], [test("workspaceSurfaceRegistry.test.ts")], false),
	evidence("versioned-config", [test("configStore.test.ts")], [test("settingsParity.test.ts")], [test("settingsParity.test.ts")], false),
	evidence("cache-lifecycle", [test("cacheService.test.ts")], [test("cacheFirst.test.ts")], [test("cacheFirst.test.ts")], false),
	evidence("issue-management", [test("githubItemsManagement.test.ts")], [test("itemManagementSurface.test.tsx")], [test("itemManagementSurface.test.tsx")]),
	evidence("pull-request-management", [test("githubItemsManagement.test.ts")], [test("itemManagementSurface.test.tsx")], [test("itemManagementSurface.test.tsx")]),
	evidence("metadata-selectors", [test("githubItemsManagement.test.ts")], [test("itemManagementSurface.test.tsx")], [test("itemManagementSurface.test.tsx")]),
	evidence("bulk-item-operations", [test("bulkItems.test.ts")], [test("bulkItemSurface.test.tsx")], [test("bulkItemSurface.test.tsx")]),
	evidence("pending-reviews", [test("githubPendingReviews.test.ts")], [test("parityHarness.test.tsx")], [test("parityHarness.test.tsx")]),
	evidence("suggestions", [test("diffSuggestions.test.ts")], [test("diffStacking.test.ts")], [test("parityHarness.test.tsx")]),
	evidence("diff-rendering", [test("diffStacking.test.ts")], [test("diffHighlighterLifecycle.test.ts")], [test("parityHarness.test.tsx")]),
	evidence("actions", [test("githubActions.test.ts")], [test("actionsSurface.test.tsx")], [test("actionsSurface.test.tsx")]),
	evidence("action-artifacts", [test("githubActions.test.ts")], [test("actionsModalValidation.test.ts")], [test("actionsSurface.test.tsx")]),
	evidence("branches", [test("githubRepositoryResources.test.ts")], [test("repositoryResourcesSurface.test.tsx")], [test("repositoryResourcesSurface.test.tsx")]),
	evidence("milestones", [test("githubRepositoryResources.test.ts")], [test("repositoryResourcesSurface.test.tsx")], [test("repositoryResourcesSurface.test.tsx")]),
	evidence("environments-deployments", [test("githubRepositoryResources.test.ts")], [test("repositoryResourcesSurface.test.tsx")], [test("repositoryResourcesSurface.test.tsx")]),
	evidence("runners", [test("githubRepositoryResources.test.ts")], [test("repositoryResourcesSurface.test.tsx")], [test("repositoryResourcesSurface.test.tsx")]),
	evidence("notifications", [test("githubNotifications.test.ts")], [test("notificationsSurface.test.tsx")], [test("notificationsSurface.test.tsx")]),
	evidence("saved-views", [test("settingsParity.test.ts")], [test("settingsParity.test.ts")], [test("settingsParity.test.ts")], false),
	evidence("configurable-keybindings", [test("settingsParity.test.ts")], [test("commandRuntime.test.ts")], [test("settingsParity.test.ts")], false),
	evidence("cli-operations", [test("cli.test.ts")], [test("cli.test.ts")], [test("liveParityRunner.test.ts")]),
]) as Readonly<Record<string, CapabilityScenarioEvidence>>

export interface ScenarioEvidenceProblem {
	readonly capabilityId: string
	readonly message: string
}

export const validateScenarioEvidence = (
	manifest: readonly ParityCapability[],
	root: string,
	evidenceRegistry: Readonly<Record<string, CapabilityScenarioEvidence>> = parityScenarioEvidence,
): readonly ScenarioEvidenceProblem[] => {
	const problems: ScenarioEvidenceProblem[] = []
	const inScope = manifest.filter((capability) => capability.status !== "excluded")
	for (const capability of inScope) {
		const owned = evidenceRegistry[capability.id]
		if (!owned) {
			problems.push({ capabilityId: capability.id, message: "capability has no scenario evidence owner" })
			continue
		}
		for (const kind of ["unit", "render", "interaction", "live"] as const) {
			const expectedIds = capability.scenarios[kind]
			const scenario = owned[kind]
			if (expectedIds.length === 0) {
				if (scenario !== null) problems.push({ capabilityId: capability.id, message: `${kind} evidence exists but the manifest declares no scenario` })
				continue
			}
			if (!scenario || !expectedIds.includes(scenario.id)) {
				problems.push({ capabilityId: capability.id, message: `${kind} scenario lacks matching evidence` })
				continue
			}
			if (scenario.files.length === 0) problems.push({ capabilityId: capability.id, message: `${scenario.id} has no evidence files` })
			for (const file of scenario.files) {
				if (!existsSync(resolve(root, file))) problems.push({ capabilityId: capability.id, message: `${scenario.id} evidence file is missing: ${file}` })
			}
		}
	}
	for (const capabilityId of Object.keys(evidenceRegistry)) {
		if (!inScope.some((capability) => capability.id === capabilityId)) {
			problems.push({ capabilityId, message: "scenario evidence has no in-scope manifest capability" })
		}
	}
	return problems
}
