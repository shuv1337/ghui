import * as Atom from "effect/unstable/reactivity/Atom"
import type { BulkItemAction } from "../ui/modals/types.js"

export const selectedItemUrlsAtom = Atom.make<readonly string[]>([]).pipe(Atom.keepAlive)
export const lastBulkRetryUrlsAtom = Atom.make<readonly string[]>([]).pipe(Atom.keepAlive)
export const lastBulkRetrySpecAtom = Atom.make<{ readonly urls: readonly string[]; readonly action: BulkItemAction; readonly value: string } | null>(null).pipe(Atom.keepAlive)
