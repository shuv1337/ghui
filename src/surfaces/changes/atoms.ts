import * as Atom from "effect/unstable/reactivity/Atom"
import type { LoadStatus } from "../../domain.js"
import type { WorkspaceSnapshot } from "../../localDomain.js"
import { ChangeWorkspace } from "../../services/ChangeWorkspace.js"
import { githubRuntime } from "../../services/runtime.js"
import { errorMessage } from "../../errors.js"

export const changeSnapshotAtom = Atom.make<WorkspaceSnapshot | null>(null).pipe(Atom.keepAlive)
export const changeStatusAtom = Atom.make<LoadStatus>("ready").pipe(Atom.keepAlive)
export const changeErrorAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)
export const changeSelectionAtom = Atom.make(0).pipe(Atom.keepAlive)
export const changeRefreshGenerationAtom = Atom.make(0).pipe(Atom.keepAlive)

export const loadChangeSnapshotAtom = githubRuntime.fn<{ readonly force?: boolean } | undefined>()((input) =>
	ChangeWorkspace.use((workspace) => workspace.snapshot({ force: input?.force === true })),
)

export const refreshChangesEffect = () => Atom.update(changeRefreshGenerationAtom, (generation) => generation + 1)

export const describeChangeLoadError = (error: unknown): string => errorMessage(error)
