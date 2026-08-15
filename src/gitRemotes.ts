const GITHUB_REMOTE_PATTERN = /^(?:https?:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/

export const parseGitRemoteUrl = (url: string): string | null => {
	const match = url.trim().match(GITHUB_REMOTE_PATTERN)
	if (!match) return null
	const owner = match[1]
	const repo = match[2]
	if (!owner || !repo) return null
	return `${owner}/${repo}`
}

export const orderGitRemoteNames = (names: readonly string[]): readonly string[] =>
	[...names].sort((left, right) => (left === "origin" ? -1 : right === "origin" ? 1 : left === "upstream" ? -1 : right === "upstream" ? 1 : 0))

export const selectGithubRepository = (remotes: readonly { readonly name: string; readonly githubRepository: string | null }[]): string | null => {
	for (const name of orderGitRemoteNames(remotes.map((remote) => remote.name))) {
		const remote = remotes.find((candidate) => candidate.name === name)
		if (remote?.githubRepository) return remote.githubRepository
	}
	return null
}
