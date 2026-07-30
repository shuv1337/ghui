import { Stream } from "effect"

export const cacheFirstStream = <A, E, R>(cached: A | null, live: Stream.Stream<A, E, R>): Stream.Stream<A, E, R> =>
	cached === null
		? live
		: Stream.concat(
				Stream.succeed(cached),
				Stream.catchCause(live, () => Stream.empty),
			)
