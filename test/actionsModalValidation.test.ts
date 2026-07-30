import { describe, expect, test } from "bun:test"
import type { ActionArtifact } from "../src/domain.js"
import { artifactDownloadValidation } from "../src/hooks/useActionsModalActions.js"

const artifact = (overrides: Partial<ActionArtifact> = {}): ActionArtifact => ({
	id: 1,
	name: "build",
	sizeInBytes: 10,
	expired: false,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	expiresAt: null,
	...overrides,
})

describe("Actions modal validation", () => {
	test("covers empty, expired, missing-destination, and valid artifact states", () => {
		expect(artifactDownloadValidation(null, "/tmp/out")).toBe("No artifact selected.")
		expect(artifactDownloadValidation(artifact({ expired: true }), "/tmp/out")).toBe("build has expired.")
		expect(artifactDownloadValidation(artifact(), "  ")).toBe("Choose an explicit destination directory.")
		expect(artifactDownloadValidation(artifact(), "/tmp/out")).toBeNull()
	})
})
