import { useEffect, useMemo, useState } from "react"
import { readStoredConfig, subscribeStoredConfig, type SurfaceViewConfig } from "../configStore.js"
import { devLog } from "../devLog.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import { normalizeSurfaceView } from "./viewConfig.js"

export const useSurfaceView = (surface: WorkspaceSurface): { readonly view: SurfaceViewConfig; readonly diagnostics: readonly string[] } => {
	const [stored, setStored] = useState<SurfaceViewConfig | undefined>(undefined)
	useEffect(() => {
		let active = true
		void readStoredConfig().then(
			(result) => {
				if (active) setStored(result.config.surfaceViews[surface])
			},
			(cause) => devLog("useSurfaceView:configReadFailed", { surface, cause: String(cause) }),
		)
		const unsubscribe = subscribeStoredConfig((result) => setStored(result.config.surfaceViews[surface]))
		return () => {
			active = false
			unsubscribe()
		}
	}, [surface])
	return useMemo(() => normalizeSurfaceView(surface, stored), [stored, surface])
}
