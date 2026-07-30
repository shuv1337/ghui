# GitHub parity test contract

`manifest.ts` is the machine-readable ledger for the GitHub-supported
`glab-tui` capability inventory. A capability may move to `complete` only when its
unit, render, interaction, and required live scenario identifiers are present and
their tests pass.

`scenarios.ts` binds every identifier to concrete source-controlled test files.
`parity:report` fails when a capability lacks an evidence owner, an id drifts,
or an evidence file disappears; non-empty placeholder ids are not accepted as
proof.

Generate the current report with:

```bash
bun run parity:report
bun run parity:report -- --json
```

## Milestone 0 baseline

Captured from the live `main` worktree at `653e4bd` on 2026-07-29:

```bash
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run test:keymap
```

The baseline passes 542 application tests and 131 keymap tests. The reference
`glab-tui` baseline passes formatting, clippy with warnings denied, 51 unit tests,
and 71 PTY/e2e tests.

The parity harness is network-free by default. Live scenarios are separate and must
use the exact configured disposable repository, dedicated identity where required,
explicit apply mode, prefixed fixtures, and idempotent cleanup.
