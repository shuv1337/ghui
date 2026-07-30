export type LiveParityAction = "read" | "mutate" | "destructive"

export interface LiveParityContext {
	readonly configuredRepository: string | null
	readonly actualRepository: string
	readonly dedicatedIdentity: boolean
	readonly viewerPermission: "none" | "read" | "triage" | "write" | "maintain" | "admin"
	readonly repositoryHasMarker: boolean
	readonly apply: boolean
	readonly approved: boolean
}

export interface LiveParityProblem {
	readonly code:
		| "missing-configured-repository"
		| "repository-mismatch"
		| "dedicated-identity-required"
		| "marker-required"
		| "admin-required"
		| "apply-required"
		| "approval-required"
	readonly message: string
}

export class LiveParitySafetyError extends Error {
	readonly problems: readonly LiveParityProblem[]

	constructor(problems: readonly LiveParityProblem[]) {
		super(problems.map((problem) => problem.message).join("; "))
		this.name = "LiveParitySafetyError"
		this.problems = problems
	}
}

export const validateLiveParityContext = (context: LiveParityContext, action: LiveParityAction): readonly LiveParityProblem[] => {
	const problems: LiveParityProblem[] = []
	if (!context.configuredRepository) {
		problems.push({ code: "missing-configured-repository", message: "GHUI_PARITY_TEST_REPO must name the disposable repository exactly" })
	} else if (context.actualRepository !== context.configuredRepository) {
		problems.push({
			code: "repository-mismatch",
			message: `Refusing live parity action in ${context.actualRepository}; configured repository is ${context.configuredRepository}`,
		})
	}
	if (!context.dedicatedIdentity) {
		problems.push({ code: "dedicated-identity-required", message: "Live parity scenarios require the dedicated test identity" })
	}
	if (!context.repositoryHasMarker) {
		problems.push({ code: "marker-required", message: "Disposable repository is missing the ghui parity-test marker" })
	}
	if (action === "destructive" && context.viewerPermission !== "admin") {
		problems.push({ code: "admin-required", message: "Destructive live parity scenarios require repository admin permission" })
	}
	if (action !== "read" && !context.apply) {
		problems.push({ code: "apply-required", message: "Mutating live parity scenarios require explicit apply mode" })
	}
	if (action !== "read" && !context.approved) {
		problems.push({ code: "approval-required", message: "Mutating or externally visible live parity scenarios require current user approval" })
	}
	return problems
}

export const assertLiveParityAllowed = (context: LiveParityContext, action: LiveParityAction): void => {
	const problems = validateLiveParityContext(context, action)
	if (problems.length > 0) throw new LiveParitySafetyError(problems)
}

export type LiveFixtureKind =
	| "issue"
	| "pullRequest"
	| "branch"
	| "milestone"
	| "workflow"
	| "workflowRun"
	| "artifact"
	| "environment"
	| "deployment"
	| "release"
	| "notification"
	| "label"

export interface LiveFixtureRecord {
	readonly kind: LiveFixtureKind
	readonly id: string
	readonly name: string
	cleanup: "pending" | "removed" | "retained" | "failed"
	cleanupDetail: string | null
}

export const createLiveFixtureLedger = (runPrefix: string) => {
	if (!/^[a-z0-9][a-z0-9-]{5,63}$/i.test(runPrefix)) throw new Error("Live parity run prefix must be 6-64 alphanumeric or hyphen characters")
	const records: LiveFixtureRecord[] = []

	const record = (fixture: Omit<LiveFixtureRecord, "cleanup" | "cleanupDetail">): LiveFixtureRecord => {
		if (!fixture.name.startsWith(`${runPrefix}-`)) {
			throw new Error(`Live parity fixture ${fixture.name} must start with ${runPrefix}-`)
		}
		if (records.some((recorded) => recorded.kind === fixture.kind && recorded.id === fixture.id)) {
			throw new Error(`Live parity fixture already recorded: ${fixture.kind}:${fixture.id}`)
		}
		const next: LiveFixtureRecord = { ...fixture, cleanup: "pending", cleanupDetail: null }
		records.push(next)
		return next
	}

	const recordCleanup = (kind: LiveFixtureKind, id: string, cleanup: Exclude<LiveFixtureRecord["cleanup"], "pending">, detail: string | null = null): void => {
		const fixture = records.find((recorded) => recorded.kind === kind && recorded.id === id)
		if (!fixture) throw new Error(`Cannot record cleanup for unknown fixture ${kind}:${id}`)
		fixture.cleanup = cleanup
		fixture.cleanupDetail = detail
	}

	const inventory = (): readonly LiveFixtureRecord[] => records.map((recorded) => ({ ...recorded }))
	const pending = (): readonly LiveFixtureRecord[] => inventory().filter((recorded) => recorded.cleanup === "pending" || recorded.cleanup === "failed")

	return { runPrefix, record, recordCleanup, inventory, pending }
}

export interface LiveFixtureOperation<A = unknown> {
	readonly id: string
	readonly setup: () => Promise<A>
	readonly verify: (fixture: A) => Promise<void>
	readonly cleanup: (fixture: A) => Promise<void>
}

export interface LiveFixtureOperationResult {
	readonly id: string
	readonly setup: "passed" | "failed" | "not-run"
	readonly verify: "passed" | "failed" | "not-run"
	readonly cleanup: "passed" | "failed" | "not-run"
	readonly detail: string | null
	readonly cleanupDetail: string | null
}

/**
 * Runs fixture operations in declaration order and always cleans successfully
 * created fixtures in reverse order. The first setup/verification failure stops
 * further mutations, but it never suppresses cleanup attempts or their residue.
 */
export const executeLiveFixtureOperations = async <A>(
	operations: readonly LiveFixtureOperation<A>[],
	onUpdate: (results: readonly LiveFixtureOperationResult[]) => Promise<void> = async () => {},
): Promise<readonly LiveFixtureOperationResult[]> => {
	const results: LiveFixtureOperationResult[] = operations.map((operation) => ({
		id: operation.id,
		setup: "not-run",
		verify: "not-run",
		cleanup: "not-run",
		detail: null,
		cleanupDetail: null,
	}))
	const created: { readonly index: number; readonly operation: LiveFixtureOperation<A>; readonly fixture: A }[] = []

	const update = async () => onUpdate(results.map((result) => ({ ...result })))
	try {
		for (const [index, operation] of operations.entries()) {
			let fixture: A
			try {
				fixture = await operation.setup()
				results[index] = { ...results[index]!, setup: "passed" }
				created.push({ index, operation, fixture })
				await update()
			} catch (cause) {
				results[index] = { ...results[index]!, setup: "failed", detail: cause instanceof Error ? cause.message : String(cause) }
				await update()
				break
			}

			try {
				await operation.verify(fixture)
				results[index] = { ...results[index]!, verify: "passed" }
				await update()
			} catch (cause) {
				results[index] = { ...results[index]!, verify: "failed", detail: cause instanceof Error ? cause.message : String(cause) }
				await update()
				break
			}
		}
	} finally {
		for (const { index, operation, fixture } of created.reverse()) {
			try {
				await operation.cleanup(fixture)
				results[index] = { ...results[index]!, cleanup: "passed" }
			} catch (cause) {
				results[index] = { ...results[index]!, cleanup: "failed", cleanupDetail: cause instanceof Error ? cause.message : String(cause) }
			}
			await update()
		}
	}
	return results
}
