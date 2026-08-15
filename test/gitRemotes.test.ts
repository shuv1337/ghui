import { describe, expect, test } from "bun:test"
import { orderGitRemoteNames, parseGitRemoteUrl, selectGithubRepository } from "../src/gitRemotes.ts"

describe("parseGitRemoteUrl", () => {
	test("parses ssh and https GitHub remotes", () => {
		expect(parseGitRemoteUrl("git@github.com:shuv1337/ghui.git")).toBe("shuv1337/ghui")
		expect(parseGitRemoteUrl("https://github.com/kitlangton/ghui.git")).toBe("kitlangton/ghui")
		expect(parseGitRemoteUrl("https://github.com/kitlangton/ghui")).toBe("kitlangton/ghui")
		expect(parseGitRemoteUrl("  git@github.com:owner/repo  ")).toBe("owner/repo")
	})

	test("rejects non-GitHub and malformed remotes", () => {
		expect(parseGitRemoteUrl("git@gitlab.com:owner/repo.git")).toBeNull()
		expect(parseGitRemoteUrl("https://example.com/owner/repo.git")).toBeNull()
		expect(parseGitRemoteUrl("not-a-remote")).toBeNull()
		expect(parseGitRemoteUrl("")).toBeNull()
	})
})

describe("orderGitRemoteNames", () => {
	test("prefers origin, then upstream, then keeps remaining names", () => {
		expect(orderGitRemoteNames(["upstream", "fork", "origin"])).toEqual(["origin", "upstream", "fork"])
		expect(orderGitRemoteNames(["fork", "upstream"])).toEqual(["upstream", "fork"])
		expect(orderGitRemoteNames(["origin"])).toEqual(["origin"])
	})
})

describe("selectGithubRepository", () => {
	test("uses origin before upstream even when origin is a fork", () => {
		expect(
			selectGithubRepository([
				{ name: "upstream", githubRepository: "kitlangton/ghui" },
				{ name: "origin", githubRepository: "shuv1337/ghui" },
			]),
		).toBe("shuv1337/ghui")
	})

	test("skips remotes that are not GitHub repositories", () => {
		expect(
			selectGithubRepository([
				{ name: "origin", githubRepository: null },
				{ name: "upstream", githubRepository: "kitlangton/ghui" },
			]),
		).toBe("kitlangton/ghui")
	})
})
