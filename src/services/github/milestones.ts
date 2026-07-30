import { Effect, Schema } from "effect"
import type { CreateMilestoneInput, EditMilestoneInput, MilestoneIssue, MilestoneItem } from "../../domain.js"
import { flattenPages, type GitHubClient } from "./client.js"

const NullableString = Schema.NullOr(Schema.String)
const MilestoneSchema = Schema.Struct({
	number: Schema.Number,
	title: Schema.String,
	description: NullableString,
	state: Schema.String,
	open_issues: Schema.Number,
	closed_issues: Schema.Number,
	due_on: NullableString,
	html_url: Schema.String,
})
const MilestonePagesSchema = Schema.Union([Schema.Array(MilestoneSchema), Schema.Array(Schema.Array(MilestoneSchema))])
const MilestoneIssueSchema = Schema.Array(
	Schema.Struct({
		number: Schema.Number,
		title: Schema.String,
		state: Schema.String,
		url: Schema.String,
	}),
)

const normalize = (repository: string, milestone: Schema.Schema.Type<typeof MilestoneSchema>): MilestoneItem => ({
	repository,
	number: milestone.number,
	title: milestone.title,
	description: milestone.description ?? "",
	state: milestone.state.toLowerCase() === "closed" ? "closed" : "open",
	openIssues: milestone.open_issues,
	closedIssues: milestone.closed_issues,
	dueOn: milestone.due_on ? new Date(milestone.due_on) : null,
	url: milestone.html_url,
})

export const milestoneProgressPercent = (milestone: Pick<MilestoneItem, "openIssues" | "closedIssues">): number => {
	const total = milestone.openIssues + milestone.closedIssues
	return total === 0 ? 0 : Math.round((milestone.closedIssues / total) * 100)
}

const dueOnJson = (date: Date | null) => (date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59)).toISOString() : null)

export const makeGitHubMilestones = (client: GitHubClient) => {
	const listMilestones = (repository: string) =>
		client
			.json("listRepositoryMilestones", MilestonePagesSchema, ["api", "--paginate", "--slurp", `repos/${repository}/milestones?state=all&per_page=100`])
			.pipe(Effect.map((pages): readonly MilestoneItem[] => flattenPages(pages).map((milestone) => normalize(repository, milestone))))

	const listMilestoneIssues = (repository: string, milestoneTitle: string, limit = 1000) =>
		client
			.json("listMilestoneIssues", MilestoneIssueSchema, [
				"issue",
				"list",
				"--repo",
				repository,
				"--milestone",
				milestoneTitle,
				"--state",
				"all",
				"--limit",
				String(Math.max(1, Math.min(1000, limit))),
				"--json",
				"number,title,state,url",
			])
			.pipe(
				Effect.map((issues): readonly MilestoneIssue[] =>
					issues.map((issue) => ({
						repository,
						number: issue.number,
						title: issue.title,
						state: issue.state.toLowerCase() === "closed" ? "closed" : "open",
						url: issue.url,
					})),
				),
			)

	const createMilestone = (input: CreateMilestoneInput) =>
		client
			.json("createMilestone", MilestoneSchema, ["api", "--method", "POST", `repos/${input.repository}/milestones`, "--input", "-"], {
				stdin: JSON.stringify({ title: input.title, description: input.description, due_on: dueOnJson(input.dueOn) }),
			})
			.pipe(Effect.map((milestone) => normalize(input.repository, milestone)))

	const editMilestone = (input: EditMilestoneInput) =>
		client
			.json("editMilestone", MilestoneSchema, ["api", "--method", "PATCH", `repos/${input.repository}/milestones/${input.number}`, "--input", "-"], {
				stdin: JSON.stringify({ title: input.title, description: input.description, state: input.state, due_on: dueOnJson(input.dueOn) }),
			})
			.pipe(Effect.map((milestone) => normalize(input.repository, milestone)))

	const deleteMilestone = (repository: string, number: number) => client.void("deleteMilestone", ["api", "--method", "DELETE", `repos/${repository}/milestones/${number}`])

	return { listMilestones, listMilestoneIssues, createMilestone, editMilestone, deleteMilestone } as const
}
