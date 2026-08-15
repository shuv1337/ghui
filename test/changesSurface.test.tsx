import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"
import { changeRowText, ChangesSurface } from "../src/surfaces/ChangesSurface.tsx"
import { assembleWorkspaceSnapshot } from "../src/services/ChangeWorkspace.ts"
import { visibleWorkspaceSurfaces } from "../src/workspace/jjAvailability.ts"
import { repositoryWorkspaceSurfaces } from "../src/workspaceSurfaces.ts"
import type { RepositoryContextSnapshot } from "../src/services/RepositoryContext.ts"

process.env.GHUI_MOCK_PR_COUNT = "24"
process.env.GHUI_MOCK_REPO_COUNT = "4"
process.env.GHUI_MOCK_FIXTURE_PATH = "/tmp/ghui-changes-test-no-fixture.json"
process.env.GHUI_MOCK_WORKSPACE_PREFERENCES_PATH = "off"

const snapshot = assembleWorkspaceSnapshot({
	operationId: "op-test",
	workspaces: '{"name":"default","changeId":"c77246d8696ca9b6f2b30d6dbbca7df2"}\n',
	stack:
		'{"changeId":"c77246d8696ca9b6f2b30d6dbbca7df2","commitId":"9152f506d0690d058278c2190631b73a5c9475bc","description":"","empty":true,"conflicted":false,"mutable":true,"divergent":false,"bookmarks":[],"remoteBookmarks":[],"parentChangeIds":["e6708651492df856650358c47d383857"]}\n{"changeId":"e6708651492df856650358c47d383857","commitId":"9d66e2f5ea1c1cbe231ac0a66a1fb4928a610e67","description":"Add comprehensive GitHub feature parity","empty":false,"conflicted":false,"mutable":false,"divergent":false,"bookmarks":["main"],"remoteBookmarks":[],"parentChangeIds":[]}\n',
	workingCopy:
		'{"changeId":"c77246d8696ca9b6f2b30d6dbbca7df2","commitId":"9152f506d0690d058278c2190631b73a5c9475bc","description":"","empty":true,"conflicted":false,"mutable":true,"divergent":false,"bookmarks":[],"remoteBookmarks":[],"parentChangeIds":["e6708651492df856650358c47d383857"]}\n',
	workspaceRoot: "/repo",
	trunkRevision: "main@upstream",
})

const emptyContext = (overrides: Partial<RepositoryContextSnapshot> = {}): RepositoryContextSnapshot => ({
	localKind: "none",
	workspaceRoot: null,
	storeRoot: null,
	githubRepository: null,
	reviewRepository: null,
	pushRemote: null,
	trunkRevision: null,
	remotes: [],
	jjVersion: null,
	diagnostics: [],
	...overrides,
})

describe("Changes Surface availability", () => {
	test("hides CHANGES outside a matching JJ workspace", () => {
		expect(visibleWorkspaceSurfaces(repositoryWorkspaceSurfaces, emptyContext(), "owner/repo")).not.toContain("changes")
		expect(
			visibleWorkspaceSurfaces(
				repositoryWorkspaceSurfaces,
				emptyContext({
					localKind: "jj",
					workspaceRoot: "/repo",
					githubRepository: "shuv1337/ghui",
					reviewRepository: "kitlangton/ghui",
					jjVersion: "0.40.0",
				}),
				"Effect-TS/effect",
			),
		).not.toContain("changes")
		expect(
			visibleWorkspaceSurfaces(
				repositoryWorkspaceSurfaces,
				emptyContext({
					localKind: "jj",
					workspaceRoot: "/repo",
					githubRepository: "shuv1337/ghui",
					reviewRepository: "kitlangton/ghui",
					jjVersion: "0.40.0",
				}),
				"kitlangton/ghui",
			),
		).toContain("changes")
	})
})

describe("Changes Surface rendering", () => {
	test("keeps change ID first and degrades at contract sizes", () => {
		const row = changeRowText(snapshot.stack[0]!, 0, snapshot, 60)
		expect(row).toContain("c77246d8")
		expect(row).toContain("9152f506")
		expect(row.startsWith("@")).toBe(true)
		for (const [width, height] of [
			[60, 16],
			[99, 24],
			[100, 24],
			[160, 40],
		] as const) {
			expect(() =>
				ChangesSurface({
					snapshot,
					selectedIndex: 0,
					status: "ready",
					error: null,
					isWideLayout: width >= 100,
					width,
					height,
					leftWidth: Math.floor(width / 2),
					rightWidth: Math.ceil(width / 2),
					setSelectedIndex: () => undefined,
				}),
			).not.toThrow()
		}
	})
})

describe("GitHub-only mode", () => {
	const loadApp = async () => {
		const { createTestRenderer } = await import("@opentui/core/testing")
		const { createRoot } = await import("@opentui/react")
		const { RegistryProvider } = await import("@effect/atom-react")
		const { App } = await import("../src/App.tsx")
		return { createTestRenderer, createRoot, RegistryProvider, App }
	}
	let cached: Awaited<ReturnType<typeof loadApp>>
	beforeAll(async () => {
		// @ts-expect-error test renderer contract
		globalThis.IS_REACT_ACT_ENVIRONMENT = true
		cached = await loadApp()
	})
	test("does not show CHANGES in mock GitHub-only mode", async () => {
		const rendererSetup = await cached.createTestRenderer({ width: 100, height: 24 })
		const root = cached.createRoot(rendererSetup.renderer)
		act(() => {
			root.render(
				<cached.RegistryProvider>
					<cached.App />
				</cached.RegistryProvider>,
			)
		})
		await act(async () => {
			await rendererSetup.renderOnce()
			await new Promise<void>((resolve) => setTimeout(resolve, 1))
		})
		expect(rendererSetup.captureCharFrame()).not.toContain("CHANGES")
		root.unmount()
	})
})
