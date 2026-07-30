export const actionLogLines = (text: string): readonly string[] => text.split(/\r?\n/)

export const actionLogWindow = (
	text: string,
	scrollTop: number,
	height: number,
): { readonly lines: readonly string[]; readonly scrollTop: number; readonly totalLines: number } => {
	const lines = actionLogLines(text)
	const windowHeight = Math.max(1, height)
	const top = Math.max(0, Math.min(scrollTop, Math.max(0, lines.length - windowHeight)))
	return { lines: lines.slice(top, top + windowHeight), scrollTop: top, totalLines: lines.length }
}
