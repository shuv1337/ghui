import { describe, expect, test } from "bun:test"
import { TreeSitterClient } from "@opentui/core"
import { createDiffSyntaxStyle } from "../src/ui/diff.ts"

describe("diff highlighter lifecycle", () => {
	test("creates theme syntax styles repeatedly without retaining mutable state", () => {
		const first = createDiffSyntaxStyle()
		const second = createDiffSyntaxStyle()
		expect(first).not.toBe(second)
	})

	test("destroys repeated parser clients without workers, buffers, or cleanup warnings", async () => {
		const warnings: string[] = []
		for (let run = 0; run < 3; run++) {
			const client = new TreeSitterClient({ dataPath: "/tmp/ghui-tree-sitter-lifecycle" }, { autoStartWorker: false })
			client.on("warning", (warning) => warnings.push(warning))
			expect(client.getAllBuffers()).toEqual([])
			await client.destroy()
			await client.destroy()
			expect(client.getAllBuffers()).toEqual([])
		}
		expect(warnings).toEqual([])
	})
})
