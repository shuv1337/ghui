import * as Atom from "effect/unstable/reactivity/Atom"
import type { LoadStatus } from "../../domain.js"
import type { ChangePrLink, WorkspaceSnapshot } from "../../localDomain.js"
import { ChangeWorkspace } from "../../services/ChangeWorkspace.js"
import { EditorOpener } from "../../services/EditorOpener.js"
import type { WorkspaceHandoffPlan } from "../../localDomain.js"
import { CacheService } from "../../services/CacheService.js"
import { githubRuntime } from "../../services/runtime.js"
import { errorMessage } from "../../errors.js"

export const changeSnapshotAtom = Atom.make<WorkspaceSnapshot | null>(null).pipe(Atom.keepAlive)
export const changeStatusAtom = Atom.make<LoadStatus>("ready").pipe(Atom.keepAlive)
export const changeErrorAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)
export const changeSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)
export const changeRefreshGenerationAtom = Atom.make(0).pipe(Atom.keepAlive)
export const changePrLinksAtom = Atom.make<readonly ChangePrLink[]>([]).pipe(Atom.keepAlive)

export const loadChangeSnapshotAtom = githubRuntime.fn<{ readonly force?: boolean } | undefined>()((input) =>
	ChangeWorkspace.use((workspace) => workspace.snapshot({ force: input?.force === true })),
)

export const loadChangePrLinksAtom = githubRuntime.fn<{ readonly storeId: string; readonly repository: string }>()((input) =>
	CacheService.use((cache) => cache.listChangePrLinks(input.storeId, input.repository)),
)

export const writeChangePrLinkAtom = githubRuntime.fn<ChangePrLink>()((link) => CacheService.use((cache) => cache.writeChangePrLink(link)))

export const deleteChangePrLinkAtom = githubRuntime.fn<{ readonly storeId: string; readonly repository: string; readonly prNumber: number }>()((input) =>
	CacheService.use((cache) => cache.deleteChangePrLink(input.storeId, input.repository, input.prNumber)),
)

export const fetchChangesAtom = githubRuntime.fn()(() => ChangeWorkspace.use((workspace) => workspace.fetch()))

export const executeChangePlanAtom = githubRuntime.fn<WorkspaceHandoffPlan>()((plan) => ChangeWorkspace.use((workspace) => workspace.execute(plan)))

export const openEditorPathAtom = githubRuntime.fn<{ readonly path: string }>()((input) => EditorOpener.use((opener) => opener.openPath(input.path)))

export const refreshChangesEffect = () => Atom.update(changeRefreshGenerationAtom, (generation) => generation + 1)

export const describeChangeLoadError = (error: unknown): string => errorMessage(error)
