import { describe, expect, test } from "bun:test"
import type { IssueItem, PullRequestItem } from "../src/domain.ts"
import { useItemMutations } from "../src/item/useItemMutations.ts"

const now = new Date("2026-07-29T00:00:00Z")
const pullRequest: PullRequestItem = {
	repository: "owner/repo",
	number: 7,
	title: "Parity PR",
	body: "",
	state: "open",
	author: "author",
	labels: [],
	createdAt: now,
	updatedAt: now,
	url: "https://github.com/owner/repo/pull/7",
	headRefName: "parity",
	baseRefName: "main",
	defaultBranchName: "main",
	headRefOid: "abc",
	reviewStatus: "review",
	checkStatus: "pending",
	checkSummary: "",
	autoMergeEnabled: false,
}
const issue: IssueItem = {
	repository: "owner/repo",
	number: 8,
	title: "Parity issue",
	body: "",
	state: "open",
	author: "author",
	labels: [],
	commentCount: 0,
	createdAt: now,
	updatedAt: now,
	url: "https://github.com/owner/repo/issues/8",
}

describe("item optimistic mutations", () => {
	test("patches both item kinds and restores a completed pull request on failure", () => {
		let pullRequestOverrides: Readonly<Record<string, PullRequestItem>> = {}
		let issueOverrides: Readonly<Record<string, IssueItem>> = {}
		let completed: Readonly<Record<string, PullRequestItem>> = {}
		const mutations = useItemMutations({
			pullRequests: [pullRequest],
			issues: [issue],
			setPullRequestOverrides: (update) => {
				pullRequestOverrides = update(pullRequestOverrides)
			},
			setIssueOverrides: (update) => {
				issueOverrides = update(issueOverrides)
			},
			setRecentlyCompletedPullRequests: (next) => {
				completed = typeof next === "function" ? next(completed) : next
			},
		})

		mutations.updatePullRequest(pullRequest.url, (current) => ({ ...current, title: "Optimistic PR" }))
		mutations.updateIssue(issue.url, (current) => ({ ...current, state: "closed" }))
		mutations.markPullRequestCompleted(pullRequest, "merged")

		expect(pullRequestOverrides[pullRequest.url]?.title).toBe("Optimistic PR")
		expect(issueOverrides[issue.url]?.state).toBe("closed")
		expect(completed[pullRequest.url]).toMatchObject({ state: "merged", autoMergeEnabled: false })

		mutations.restoreOptimisticPullRequest(pullRequest)
		expect(completed[pullRequest.url]).toBeUndefined()
		expect(pullRequestOverrides[pullRequest.url]).toEqual(pullRequest)
	})
})
