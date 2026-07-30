import { createTestRenderer, type MouseButton, type TestRendererSetup } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { act, type ReactNode } from "react"

export interface ParityTerminalSize {
	readonly width: number
	readonly height: number
}

export const parityTerminalSizes = [
	{ width: 60, height: 16 },
	{ width: 99, height: 24 },
	{ width: 100, height: 24 },
	{ width: 160, height: 40 },
] as const satisfies readonly ParityTerminalSize[]

export interface ParityEffect {
	readonly id: string
	readonly payload?: unknown
}

export type ParityEffectRecorder = (id: string, payload?: unknown) => void

export interface ParityHarnessOptions {
	readonly size: ParityTerminalSize
	readonly render: (recordEffect: ParityEffectRecorder) => ReactNode
}

export interface ParityKey {
	readonly name: string
	readonly modifiers?: {
		readonly shift?: boolean
		readonly ctrl?: boolean
		readonly meta?: boolean
	}
}

const settle = async (setup: TestRendererSetup): Promise<void> => {
	await act(async () => {
		await setup.flush()
		await Promise.resolve()
	})
}

export const withNetworkDisabled = async <A,>(run: () => Promise<A>): Promise<A> => {
	const originalFetch = globalThis.fetch
	globalThis.fetch = (() => {
		throw new Error("Network access is disabled in the OpenTUI parity harness")
	}) as typeof fetch
	try {
		return await run()
	} finally {
		globalThis.fetch = originalFetch
	}
}

export const createParityHarness = async ({ size, render }: ParityHarnessOptions) => {
	const effects: ParityEffect[] = []
	const recordEffect: ParityEffectRecorder = (id, payload) => effects.push(payload === undefined ? { id } : { id, payload })
	const setup = await createTestRenderer({ width: size.width, height: size.height })
	const root = createRoot(setup.renderer)

	act(() => {
		root.render(render(recordEffect))
	})
	await settle(setup)

	const pressKey = async ({ name, modifiers }: ParityKey): Promise<void> => {
		act(() => setup.mockInput.pressKey(name, modifiers))
		await settle(setup)
	}

	const pressSequence = async (sequence: readonly ParityKey[]): Promise<void> => {
		for (const key of sequence) await pressKey(key)
	}

	const typeText = async (text: string): Promise<void> => {
		await act(async () => {
			await setup.mockInput.typeText(text)
		})
		await settle(setup)
	}

	const pasteText = async (text: string): Promise<void> => {
		await act(async () => {
			await setup.mockInput.pasteBracketedText(text)
		})
		await settle(setup)
	}

	const click = async (x: number, y: number, button?: MouseButton): Promise<void> => {
		await act(async () => {
			await setup.mockMouse.click(x, y, button)
		})
		await settle(setup)
	}

	const scroll = async (x: number, y: number, direction: "up" | "down" | "left" | "right"): Promise<void> => {
		await act(async () => {
			await setup.mockMouse.scroll(x, y, direction)
		})
		await settle(setup)
	}

	const resize = async (nextSize: ParityTerminalSize): Promise<void> => {
		act(() => setup.resize(nextSize.width, nextSize.height))
		await settle(setup)
	}

	const effectCount = (id: string): number => effects.filter((effect) => effect.id === id).length
	const requireEffect = (id: string): ParityEffect => {
		const effect = effects.find((candidate) => candidate.id === id)
		if (!effect) throw new Error(`Expected parity effect ${id}; observed ${effects.map((candidate) => candidate.id).join(", ") || "none"}`)
		return effect
	}

	const destroy = (): void => {
		act(() => root.unmount())
		setup.renderer.destroy()
	}

	return {
		size,
		effects,
		recordEffect,
		frame: setup.captureCharFrame,
		spans: setup.captureSpans,
		waitForFrame: setup.waitForFrame,
		pressKey,
		pressSequence,
		typeText,
		pasteText,
		click,
		scroll,
		resize,
		effectCount,
		requireEffect,
		destroy,
	}
}
