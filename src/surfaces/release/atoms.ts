import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { CreateReleaseInput, EditReleaseInput, ReleaseItem } from "../../domain.js"
import { CacheService } from "../../services/CacheService.js"
import { GitHubService } from "../../services/GitHubService.js"
import { githubRuntime } from "../../services/runtime.js"

export const releaseItemsAtom = Atom.make<readonly ReleaseItem[]>([]).pipe(Atom.keepAlive)
export const selectedReleaseIndexAtom = Atom.make(0).pipe(Atom.keepAlive)
export const selectedReleaseAtom = Atom.make<ReleaseItem | null>(null).pipe(Atom.keepAlive)

export const loadReleasesAtom = githubRuntime.fn<string>()((repository) =>
	Effect.gen(function* () {
		const cache = yield* CacheService
		const github = yield* GitHubService
		const cached = yield* cache.readReleaseList(repository).pipe(Effect.catch(() => Effect.succeed(null)))
		return yield* github.listReleases(repository).pipe(
			Effect.tap((data) => cache.writeReleaseList({ repository, data, fetchedAt: new Date() })),
			Effect.catch((error) => (cached ? Effect.succeed(cached.data) : Effect.fail(error))),
		)
	}),
)

export const createReleaseAtom = githubRuntime.fn<CreateReleaseInput>()((input) =>
	GitHubService.use((github) => github.createRelease(input)).pipe(Effect.tap((release) => CacheService.use((cache) => cache.upsertRelease(release)))),
)

export const editReleaseAtom = githubRuntime.fn<EditReleaseInput>()((input) =>
	GitHubService.use((github) => github.editRelease(input)).pipe(Effect.tap((release) => CacheService.use((cache) => cache.upsertRelease(release)))),
)

export const deleteReleaseAtom = githubRuntime.fn<{ readonly repository: string; readonly tagName: string }>()(({ repository, tagName }) =>
	GitHubService.use((github) => github.deleteRelease(repository, tagName)).pipe(Effect.tap(() => CacheService.use((cache) => cache.deleteRelease(repository, tagName)))),
)
