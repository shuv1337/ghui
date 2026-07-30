import { useEffect } from "react"
import { registerHandoff } from "../../commands/handoffs.js"
import type { MilestoneItem } from "../../domain.js"
import { errorMessage } from "../../errors.js"
import { branchDeleteDisabledReason, branchNameValidationError } from "../../services/github/branches.js"
import type { DeleteResourceModalState, ResourceEditorField, ResourceEditorModalState } from "../../ui/modals/types.js"
import type { RepositoryResourcesModel } from "./useResourceSurfaces.js"

type Setter<T> = (next: T | ((current: T) => T)) => void

export interface UseResourceActionsInput {
	readonly repository: string | null
	readonly model: RepositoryResourcesModel
	readonly editor: ResourceEditorModalState
	readonly deletion: DeleteResourceModalState
	readonly setEditor: Setter<ResourceEditorModalState>
	readonly setDeletion: Setter<DeleteResourceModalState>
	readonly closeModal: () => void
	readonly notify: (message: string) => void
	readonly openUrl: (url: string) => Promise<void>
}

const parseDueDate = (value: string): Date | null | undefined => {
	const trimmed = value.trim()
	if (!trimmed) return null
	if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined
	const date = new Date(`${trimmed}T00:00:00.000Z`)
	return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed ? undefined : date
}

export const useResourceActions = (input: UseResourceActionsInput) => {
	const openCreateBranch = () => {
		if (!input.repository || input.model.branches.length === 0) return
		const defaultIndex = Math.max(
			0,
			input.model.branches.findIndex((branch) => branch.isDefault),
		)
		input.setEditor({
			kind: "branch",
			mode: "create",
			repository: input.repository,
			branchName: "",
			sourceIndex: defaultIndex,
			sourceBranches: input.model.branches,
			milestoneNumber: null,
			title: "",
			description: "",
			dueOn: "",
			state: "open",
			focus: "name",
			running: false,
			error: null,
		})
	}
	const openDeleteBranch = () => {
		const branch = input.model.selectedBranch
		if (!branch) return
		const reason = branchDeleteDisabledReason(branch, null)
		if (reason) {
			input.notify(reason)
			return
		}
		input.setDeletion({
			kind: "branch",
			repository: branch.repository,
			title: branch.name,
			branch,
			milestoneNumber: null,
			selectedBranchName: null,
			running: false,
			error: null,
		})
	}
	const openCreateMilestone = () => {
		if (!input.repository) return
		input.setEditor({
			kind: "milestone",
			mode: "create",
			repository: input.repository,
			branchName: "",
			sourceIndex: 0,
			sourceBranches: [],
			milestoneNumber: null,
			title: "",
			description: "",
			dueOn: "",
			state: "open",
			focus: "title",
			running: false,
			error: null,
		})
	}
	const openEditMilestone = () => {
		const milestone = input.model.selectedMilestone
		if (!milestone) return
		input.setEditor({
			kind: "milestone",
			mode: "edit",
			repository: milestone.repository,
			branchName: "",
			sourceIndex: 0,
			sourceBranches: [],
			milestoneNumber: milestone.number,
			title: milestone.title,
			description: milestone.description,
			dueOn: milestone.dueOn?.toISOString().slice(0, 10) ?? "",
			state: milestone.state,
			focus: "title",
			running: false,
			error: null,
		})
	}
	const openDeleteMilestone = () => {
		const milestone = input.model.selectedMilestone
		if (!milestone) return
		input.setDeletion({
			kind: "milestone",
			repository: milestone.repository,
			title: milestone.title,
			branch: null,
			milestoneNumber: milestone.number,
			selectedBranchName: null,
			running: false,
			error: null,
		})
	}
	const toggleMilestoneState = () => {
		const milestone = input.model.selectedMilestone
		if (!milestone) return
		void input.model
			.editMilestone({
				repository: milestone.repository,
				number: milestone.number,
				title: milestone.title,
				description: milestone.description,
				dueOn: milestone.dueOn,
				state: milestone.state === "open" ? "closed" : "open",
			})
			.then(() => {
				input.model.active?.refresh()
				input.notify(`${milestone.state === "open" ? "Closed" : "Reopened"} ${milestone.title}`)
			})
			.catch((error) => input.notify(errorMessage(error)))
	}
	const openEnvironmentInBrowser = () => {
		const environment = input.model.selectedEnvironment
		if (!environment) return
		void input.openUrl(environment.latestDeployment?.url ?? environment.url).catch((error) => input.notify(errorMessage(error)))
	}

	useEffect(() => registerHandoff("refreshBranches", () => input.model.active?.refresh()), [input.model.active])
	useEffect(() => registerHandoff("openCreateBranch", openCreateBranch), [input.repository, input.model.branches, input.setEditor])
	useEffect(() => registerHandoff("openDeleteBranch", openDeleteBranch), [input.model.selectedBranch, input.setDeletion, input.notify])
	useEffect(() => registerHandoff("refreshMilestones", () => input.model.active?.refresh()), [input.model.active])
	useEffect(() => registerHandoff("openCreateMilestone", openCreateMilestone), [input.repository, input.setEditor])
	useEffect(() => registerHandoff("openEditMilestone", openEditMilestone), [input.model.selectedMilestone, input.setEditor])
	useEffect(() => registerHandoff("toggleMilestoneState", toggleMilestoneState), [input.model.selectedMilestone, input.model.editMilestone, input.notify])
	useEffect(() => registerHandoff("openDeleteMilestone", openDeleteMilestone), [input.model.selectedMilestone, input.setDeletion])
	useEffect(() => registerHandoff("refreshEnvironments", () => input.model.active?.refresh()), [input.model.active])
	useEffect(() => registerHandoff("openEnvironmentInBrowser", openEnvironmentInBrowser), [input.model.selectedEnvironment, input.openUrl, input.notify])
	useEffect(() => registerHandoff("refreshRunners", () => input.model.active?.refresh()), [input.model.active])

	const moveFocus = (delta: -1 | 1) =>
		input.setEditor((current) => {
			const available: readonly ResourceEditorField[] = current.kind === "branch" ? ["name", "source"] : ["title", "description", "dueOn", "state"]
			const index = Math.max(0, available.indexOf(current.focus))
			return { ...current, focus: available[(index + delta + available.length) % available.length]! }
		})
	const cycleChoice = (delta: -1 | 1) =>
		input.setEditor((current) => {
			if (current.kind === "branch" && current.focus === "source" && current.sourceBranches.length > 0) {
				return { ...current, sourceIndex: (current.sourceIndex + delta + current.sourceBranches.length) % current.sourceBranches.length }
			}
			if (current.kind === "milestone" && current.focus === "state") return { ...current, state: current.state === "open" ? "closed" : "open" }
			return current
		})
	const submit = () => {
		const state = input.editor
		if (state.kind === "branch") {
			const validation = branchNameValidationError(state.branchName)
			const source = state.sourceBranches[state.sourceIndex]
			if (validation || !source) {
				input.setEditor((current) => ({ ...current, error: validation ?? "Select a source ref.", focus: validation ? "name" : "source" }))
				return
			}
			input.setEditor((current) => ({ ...current, running: true, error: null }))
			void input.model
				.createBranch({ repository: state.repository, name: state.branchName.trim(), sourceRef: source.name, sourceSha: source.sha })
				.then((branch) => {
					input.closeModal()
					input.model.active?.refresh()
					input.notify(`Created ${branch.name} from ${source.name}`)
				})
				.catch((error) => input.setEditor((current) => ({ ...current, running: false, error: errorMessage(error) })))
			return
		}
		const dueOn = parseDueDate(state.dueOn)
		if (!state.title.trim() || dueOn === undefined) {
			input.setEditor((current) => ({
				...current,
				error: !state.title.trim() ? "Title is required." : "Due date must use YYYY-MM-DD.",
				focus: !state.title.trim() ? "title" : "dueOn",
			}))
			return
		}
		input.setEditor((current) => ({ ...current, running: true, error: null }))
		const payload = {
			repository: state.repository,
			title: state.title.trim(),
			description: state.description,
			dueOn,
		}
		const operation = state.mode === "create" ? input.model.createMilestone(payload) : input.model.editMilestone({ ...payload, number: state.milestoneNumber!, state: state.state })
		void operation
			.then((milestone: MilestoneItem) => {
				input.closeModal()
				input.model.active?.refresh()
				input.notify(`${state.mode === "create" ? "Created" : "Updated"} ${milestone.title}`)
			})
			.catch((error) => input.setEditor((current) => ({ ...current, running: false, error: errorMessage(error) })))
	}
	const confirmDelete = () => {
		const state = input.deletion
		input.setDeletion((current) => ({ ...current, running: true, error: null }))
		const operation =
			state.kind === "branch" && state.branch
				? input.model.deleteBranch({ repository: state.repository, branch: state.branch, selectedBranchName: state.selectedBranchName })
				: input.model.deleteMilestone({ repository: state.repository, number: state.milestoneNumber! })
		void operation
			.then(() => {
				input.closeModal()
				input.model.active?.refresh()
				input.notify(`Deleted ${state.title}`)
			})
			.catch((error) => input.setDeletion((current) => ({ ...current, running: false, error: errorMessage(error) })))
	}

	return { moveFocus, cycleChoice, submit, confirmDelete }
}
