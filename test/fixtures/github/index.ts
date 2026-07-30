import { readFileSync } from "node:fs"

const fixtureUrl = (name: string) => new URL(name, import.meta.url)

export const readGitHubFixtureText = (name: "success.json" | "empty.json" | "errors.json" | "malformed.txt"): string => readFileSync(fixtureUrl(name), "utf8")

export const readGitHubFixtureJson = <A>(name: "success.json" | "empty.json" | "errors.json"): A => JSON.parse(readGitHubFixtureText(name)) as A
