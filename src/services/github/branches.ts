import { Effect, Schema } from "effect"
import type { BranchItem, CreateBranchInput } from "../../domain.js"
import { CommandError } from "../CommandRunner.js"
import { flattenPages, type GitHubClient } from "./client.js"

const BranchPagesSchema = Schema.Union([
	Schema.Array(Schema.Struct({ name: Schema.String, protected: Schema.Boolean, commit: Schema.Struct({ sha: Schema.String }) })),
	Schema.Array(Schema.Array(Schema.Struct({ name: Schema.String, protected: Schema.Boolean, commit: Schema.Struct({ sha: Schema.String }) }))),
])
const DefaultBranchSchema = Schema.Struct({ defaultBranchRef: Schema.NullOr(Schema.Struct({ name: Schema.String })) })

export const branchNameValidationError = (name: string): string | null => {
	const value = name.trim()
	if (!value) return "Branch name is required."
	if (value.startsWith("/") || value.endsWith("/") || value.endsWith(".") || value.includes("..") || value.includes("@{")) return "Branch name is not a valid Git ref."
	const hasForbiddenCharacter = [...value].some((character) => {
		const code = character.charCodeAt(0)
		return code <= 32 || code === 127 || "~^:?*[\\".includes(character)
	})
	if (hasForbiddenCharacter || value.includes("//") || value.includes("\\") || value.split("/").some((part) => !part || part.endsWith(".lock"))) {
		return "Branch name is not a valid Git ref."
	}
	return null
}

export const branchDeleteDisabledReason = (branch: BranchItem | null, selectedBranchName: string | null): string | null => {
	if (!branch) return "No branch selected"
	if (branch.isDefault) return "The default branch cannot be deleted"
	if (branch.protected) return "Protected branches cannot be deleted"
	if (branch.name === selectedBranchName) return "The currently selected branch cannot be deleted"
	return null
}

export const makeGitHubBranches = (client: GitHubClient) => {
	const listBranches = (repository: string) =>
		Effect.all(
			[
				client.json("listBranches", BranchPagesSchema, ["api", "--paginate", "--slurp", `repos/${repository}/branches?per_page=100`]),
				client.json("getDefaultBranch", DefaultBranchSchema, ["repo", "view", repository, "--json", "defaultBranchRef"]),
			],
			{ concurrency: 2 },
		).pipe(
			Effect.map(([pages, details]): readonly BranchItem[] =>
				flattenPages(pages).map((branch) => ({
					repository,
					name: branch.name,
					sha: branch.commit.sha,
					protected: branch.protected,
					isDefault: branch.name === details.defaultBranchRef?.name,
				})),
			),
		)

	const createBranch = (input: CreateBranchInput) => {
		const validation = branchNameValidationError(input.name)
		if (validation) return Effect.fail(new CommandError({ command: "gh", args: [], detail: validation, cause: input.name }))
		return client
			.void("createBranch", ["api", "--method", "POST", `repos/${input.repository}/git/refs`, "--input", "-"], {
				stdin: JSON.stringify({ ref: `refs/heads/${input.name.trim()}`, sha: input.sourceSha }),
			})
			.pipe(
				Effect.as({
					repository: input.repository,
					name: input.name.trim(),
					sha: input.sourceSha,
					protected: false,
					isDefault: false,
				} satisfies BranchItem),
			)
	}

	const deleteBranch = (repository: string, branch: BranchItem, selectedBranchName: string | null) => {
		const disabled = branchDeleteDisabledReason(branch, selectedBranchName)
		return disabled
			? Effect.fail(new CommandError({ command: "gh", args: [], detail: disabled, cause: branch.name }))
			: client.void("deleteBranch", ["api", "--method", "DELETE", `repos/${repository}/git/refs/heads/${encodeURIComponent(branch.name)}`])
	}

	return { listBranches, createBranch, deleteBranch } as const
}
