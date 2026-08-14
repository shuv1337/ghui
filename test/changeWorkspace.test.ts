import { describe, expect, test } from "bun:test"
import { formatJjHeaderStatus, shortChangeId } from "../src/localDomain.ts"
import {
	assembleWorkspaceSnapshot,
	decodeChangeLine,
	JJ_CHANGE_TEMPLATE,
	JJ_CHANGE_TEMPLATE_VERSION,
	JJ_STACK_REVSET,
	JJ_WORKING_COPY_REVSET,
	JJ_WORKSPACE_TEMPLATE,
	jjRepoArgs,
	parseNdjson,
} from "../src/services/ChangeWorkspace.ts"
import { jjObservationalArgs } from "../src/services/RepositoryContext.ts"

const workingCopyJson =
	'{"changeId":"c77246d8696ca9b6f2b30d6dbbca7df2","commitId":"9152f506d0690d058278c2190631b73a5c9475bc","description":"","empty":false,"conflicted":false,"mutable":true,"divergent":false,"bookmarks":[],"remoteBookmarks":[],"parentChangeIds":["e6708651492df856650358c47d383857"]}'
const trunkJson =
	'{"changeId":"e6708651492df856650358c47d383857","commitId":"9d66e2f5ea1c1cbe231ac0a66a1fb4928a610e67","description":"chore: release 0.9.0","empty":false,"conflicted":false,"mutable":false,"divergent":false,"bookmarks":[],"remoteBookmarks":[{"name":"main","remote":"upstream","target":["9d66e2f5ea1c1cbe231ac0a66a1fb4928a610e67"]}],"parentChangeIds":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]}'

describe("JJ snapshot templates", () => {
	test("version owned templates and observational argv", () => {
		expect(JJ_CHANGE_TEMPLATE_VERSION).toBe(1)
		expect(JJ_CHANGE_TEMPLATE).toContain("change_id.normal_hex()")
		expect(JJ_CHANGE_TEMPLATE).toContain("commit_id.normal_hex()")
		expect(JJ_WORKSPACE_TEMPLATE).toContain("target.change_id().normal_hex()")
		expect(JJ_STACK_REVSET).toBe("trunk()::@")
		expect(jjRepoArgs("/repo", "log", "-r", JJ_WORKING_COPY_REVSET, "--no-graph", "-T", JJ_CHANGE_TEMPLATE)).toEqual([
			...jjObservationalArgs("-R", "/repo", "log", "-r", "@", "--no-graph", "-T", JJ_CHANGE_TEMPLATE),
		])
	})
})

describe("decodeChangeLine", () => {
	test("keeps change ID distinct from commit ID and normalizes bookmarks", () => {
		const change = decodeChangeLine(JSON.parse(trunkJson))
		expect(change.changeId).toBe("e6708651492df856650358c47d383857")
		expect(change.commitId).toBe("9d66e2f5ea1c1cbe231ac0a66a1fb4928a610e67")
		expect(change.changeId).not.toBe(change.commitId)
		expect(change.remoteBookmarks).toEqual(["main@upstream"])
		expect(change.mutable).toBe(false)
	})

	test("accepts empty, conflicted, and undescribed working copies", () => {
		const change = decodeChangeLine({
			changeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			commitId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			description: "",
			empty: true,
			conflicted: true,
			mutable: true,
			divergent: true,
			bookmarks: ["wip"],
			remoteBookmarks: [],
			parentChangeIds: ["cccccccccccccccccccccccccccccccc"],
		})
		expect(change.empty).toBe(true)
		expect(change.conflicted).toBe(true)
		expect(change.divergent).toBe(true)
		expect(change.description).toBe("")
		expect(change.bookmarks).toEqual(["wip"])
	})
})

describe("assembleWorkspaceSnapshot", () => {
	test("preserves change identity when the commit ID is rewritten", () => {
		const before = assembleWorkspaceSnapshot({
			operationId: "op-1",
			workspaces: '{"name":"default","changeId":"c77246d8696ca9b6f2b30d6dbbca7df2"}\n',
			stack: `${workingCopyJson}\n${trunkJson}\n`,
			workingCopy: `${workingCopyJson}\n`,
			workspaceRoot: "/repo",
			trunkRevision: "main@upstream",
		})
		const rewritten = {
			...JSON.parse(workingCopyJson),
			commitId: "ffffffffffffffffffffffffffffffffffffffff",
		}
		const after = assembleWorkspaceSnapshot({
			operationId: "op-2",
			workspaces: '{"name":"default","changeId":"c77246d8696ca9b6f2b30d6dbbca7df2"}\n',
			stack: `${JSON.stringify(rewritten)}\n${trunkJson}\n`,
			workingCopy: `${JSON.stringify(rewritten)}\n`,
			workspaceRoot: "/repo",
			trunkRevision: "main@upstream",
		})
		expect(before.workingCopy.changeId).toBe(after.workingCopy.changeId)
		expect(before.workingCopy.commitId).not.toBe(after.workingCopy.commitId)
	})

	test("keeps sibling workspaces distinct and prepends an unmapped working copy", () => {
		const snapshot = assembleWorkspaceSnapshot({
			operationId: "op-3",
			workspaces: '{"name":"default","changeId":"c77246d8696ca9b6f2b30d6dbbca7df2"}\n{"name":"review","changeId":"dddddddddddddddddddddddddddddddd"}\n',
			stack: `${trunkJson}\n`,
			workingCopy: `${workingCopyJson}\n`,
			workspaceRoot: "/repo",
			trunkRevision: "main@upstream",
		})
		expect(snapshot.workspaces).toHaveLength(2)
		expect(snapshot.stack[0]?.changeId).toBe("c77246d8696ca9b6f2b30d6dbbca7df2")
		expect(snapshot.capabilityReason).toContain("not a descendant of trunk")
	})

	test("marks merge-containing stacks instead of dropping them", () => {
		const merge = {
			...JSON.parse(workingCopyJson),
			parentChangeIds: ["e6708651492df856650358c47d383857", "ffffffffffffffffffffffffffffffff"],
		}
		const snapshot = assembleWorkspaceSnapshot({
			operationId: "op-4",
			workspaces: '{"name":"default","changeId":"c77246d8696ca9b6f2b30d6dbbca7df2"}\n',
			stack: `${JSON.stringify(merge)}\n${trunkJson}\n`,
			workingCopy: `${JSON.stringify(merge)}\n`,
			workspaceRoot: "/repo",
			trunkRevision: "main@upstream",
		})
		expect(snapshot.stack).toHaveLength(2)
		expect(snapshot.capabilityReason).toContain("merge")
	})

	test("parses NDJSON stacks", () => {
		expect(parseNdjson(`${workingCopyJson}\n${trunkJson}\n`, decodeChangeLine)).toHaveLength(2)
	})
})

describe("formatJjHeaderStatus", () => {
	test("drops trailing segments before the working-copy change id", () => {
		const snapshot = assembleWorkspaceSnapshot({
			operationId: "op-5",
			workspaces: '{"name":"review","changeId":"c77246d8696ca9b6f2b30d6dbbca7df2"}\n',
			stack: `${workingCopyJson}\n${trunkJson}\n`,
			workingCopy: `${workingCopyJson}\n`,
			workspaceRoot: "/repo",
			trunkRevision: "main@upstream",
		})
		expect(formatJjHeaderStatus(snapshot, 80)).toContain(`@ ${shortChangeId(snapshot.workingCopy.changeId)}`)
		expect(formatJjHeaderStatus(snapshot, 12).startsWith("@ ")).toBe(true)
		expect(formatJjHeaderStatus(snapshot, 12).length).toBeLessThanOrEqual(12)
	})
})
