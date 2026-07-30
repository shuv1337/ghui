export type BulkItemStatus = "succeeded" | "failed" | "skipped"

export interface BulkItemResult<Item> {
	readonly item: Item
	readonly status: BulkItemStatus
	readonly retryable: boolean
	readonly error: string | null
}

export interface BulkResult<Item> {
	readonly results: readonly BulkItemResult<Item>[]
	readonly succeeded: number
	readonly failed: number
	readonly skipped: number
	readonly retryable: number
}

export interface BulkRunOptions {
	readonly concurrency?: number
	readonly signal?: AbortSignal
	readonly isRetryable?: (error: unknown) => boolean
}

export class BulkSkipError extends Error {}

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const summarize = <Item>(results: readonly BulkItemResult<Item>[]): BulkResult<Item> => ({
	results,
	succeeded: results.filter((result) => result.status === "succeeded").length,
	failed: results.filter((result) => result.status === "failed").length,
	skipped: results.filter((result) => result.status === "skipped").length,
	retryable: results.filter((result) => result.status === "failed" && result.retryable).length,
})

export const runBulkItems = async <Item>(
	items: readonly Item[],
	worker: (item: Item, index: number, signal: AbortSignal | undefined) => Promise<unknown>,
	{ concurrency = 3, signal, isRetryable = () => true }: BulkRunOptions = {},
): Promise<BulkResult<Item>> => {
	const limit = Math.max(1, Math.min(10, Math.floor(concurrency)))
	const results: (BulkItemResult<Item> | undefined)[] = Array.from({ length: items.length })
	let nextIndex = 0

	const runNext = async (): Promise<void> => {
		while (true) {
			const index = nextIndex++
			const item = items[index]
			if (item === undefined) return
			if (signal?.aborted) {
				results[index] = { item, status: "skipped", retryable: false, error: "Cancelled before starting." }
				continue
			}
			try {
				await worker(item, index, signal)
				results[index] = { item, status: "succeeded", retryable: false, error: null }
			} catch (error) {
				if (error instanceof BulkSkipError) {
					results[index] = { item, status: "skipped", retryable: false, error: error.message }
					continue
				}
				results[index] = {
					item,
					status: signal?.aborted ? "skipped" : "failed",
					retryable: !signal?.aborted && isRetryable(error),
					error: failureMessage(error),
				}
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()))
	return summarize(results.flatMap((result) => (result ? [result] : [])))
}

export const retryFailedBulkItems = <Item>(
	previous: BulkResult<Item>,
	worker: (item: Item, index: number, signal: AbortSignal | undefined) => Promise<unknown>,
	options?: BulkRunOptions,
): Promise<BulkResult<Item>> =>
	runBulkItems(
		previous.results.filter((result) => result.status === "failed" && result.retryable).map((result) => result.item),
		worker,
		options,
	)
