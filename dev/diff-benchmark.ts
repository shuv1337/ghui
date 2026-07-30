import { buildStackedDiffFiles, getStackedDiffCommentAnchors, windowedStackedDiffFileIndexes, type DiffFilePatch } from "../src/ui/diff.js"

const fileCount = 500
const linesPerFile = 80
const files: DiffFilePatch[] = Array.from({ length: fileCount }, (_, fileIndex) => {
	const body = Array.from({ length: linesPerFile }, (_, lineIndex) =>
		lineIndex % 9 === 0 ? `+const value${lineIndex} = ${fileIndex + lineIndex}` : ` const value${lineIndex} = ${lineIndex}`,
	)
	return {
		name: `src/benchmark/file-${fileIndex}.ts`,
		filetype: "typescript",
		patch: [
			`diff --git a/src/benchmark/file-${fileIndex}.ts b/src/benchmark/file-${fileIndex}.ts`,
			`--- a/src/benchmark/file-${fileIndex}.ts`,
			`+++ b/src/benchmark/file-${fileIndex}.ts`,
			`@@ -1,${linesPerFile} +1,${linesPerFile} @@`,
			...body,
		].join("\n"),
	}
})

const started = performance.now()
const stacked = buildStackedDiffFiles(files, "unified", "none", 120)
const anchors = getStackedDiffCommentAnchors(stacked, "unified", "none", 120)
const middle = stacked[Math.floor(stacked.length / 2)]!
const mounted = windowedStackedDiffFileIndexes(stacked, middle.headerLine, 50, middle.index)
const elapsedMs = performance.now() - started
const result = {
	fileCount,
	linesPerFile,
	anchorCount: anchors.length,
	mountedFileCount: mounted.size,
	elapsedMs: Math.round(elapsedMs * 100) / 100,
	budgetMs: 500,
}
console.log(JSON.stringify(result))
if (mounted.size >= fileCount / 10) throw new Error(`Diff window mounted ${mounted.size}/${fileCount} files`)
if (elapsedMs > result.budgetMs) throw new Error(`Diff model exceeded ${result.budgetMs}ms budget: ${elapsedMs.toFixed(2)}ms`)
