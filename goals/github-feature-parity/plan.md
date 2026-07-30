# GitHub feature parity for ghui — execution plan

## Solution approach

Deliver GitHub-supported `glab-tui` breadth as eight independently releasable
milestones without replacing `ghui`'s architecture. Keep `GitHubService` as the
public Effect service, make Surfaces and commands the interaction boundaries, use
additive cache/config migrations, and prove each slice with deterministic command
contracts, OpenTUI interaction tests, guarded live GitHub scenarios, and packaged
binary checks.

The machine-readable parity manifest introduced in Milestone 0 is the program
ledger. A capability may move to `complete` only when its service, mock, UI,
interaction, and live scenario identifiers all pass. Incomplete Surfaces remain
unregistered and therefore unreachable in production.

The accepted scope and behavior are authoritative in
`goals/github-feature-parity/facts.md`. The longer design inventory in
`plans/glab-tui-feature-parity.md` remains useful reference material, but this file
controls execution order and validation.

## Execution rules

- Execute Milestones 0 through 7 in dependency order. Work autonomously unless
  external access is missing, a destructive or externally visible live action needs
  approval, or a new product decision would change the accepted facts.
- Begin each milestone from a green baseline and finish it with the fast and packaged
  gates below.
- Add a changeset for every milestone with user-visible behavior.
- Keep native `gh` subcommands as the default. Use `gh api` only where native output
  or mutation support is insufficient, with explicit endpoint/method/body tests.
- Add every public `GitHubService` method and its deterministic
  `MockGitHubService` behavior in the same slice.
- Route all actions through stable command ids. Confirmation and disabled-reason
  checks live at the command boundary.
- Keep cache migrations additive. Do not cache logs, artifact bytes, secrets, review
  bodies, notification subjects in snapshots, or workflow input values.
- Preserve unknown configuration keys and migrate old files per field.
- Record live fixtures and cleanup inventory. Never run destructive live tests outside
  the exact configured parity repository.
- Update the parity manifest and relevant plan status in the same change that ships a
  capability.

## Shared verification gates

### Fast gate

Run before and after each implementation slice:

```bash
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run test:keymap
```

### Milestone gate

Run before declaring any milestone complete:

```bash
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run test:keymap
bun run package:smoke
bun run build:standalone
```

Also run that milestone's parity-manifest scenarios at `60x16`, `99x24`,
`100x24`, and `160x40`.

### Service contract gate

Each added `GitHubService` method must cover:

- success;
- pagination or an explicit bounded limit;
- empty response;
- malformed response;
- non-zero `gh` exit;
- timeout;
- authentication and permission failures;
- primary and secondary rate limits;
- telemetry/snapshot redaction;
- exact native argv or API endpoint, method, and body.

### UI contract gate

Each added Surface or modal must cover:

- keyboard and command-palette routes;
- mouse selection/activation where equivalent existing UI supports it;
- loading, cached-refresh, empty, error, retry, and permission states;
- selection identity through refresh, search, filter, sort, and grouping;
- narrow `60x16` and wide two-pane layouts;
- modal border junctions required by `AGENTS.md`;
- command-level confirmation and disabled reasons.

## Milestone 0 — Freeze parity and strengthen the harness

### Fact coverage

`parity-contract`, `existing-workflows`, `github-command-contract`,
`service-contract-tests`, `deterministic-harness`, `live-validation`,
`explicit-exclusions`.

### Build

1. Add `test/parity/manifest.ts`.
   - Define stable capability ids, scope, owner milestone, status
     (`existing`, `partial`, `missing`, `excluded`, `complete`), command ids,
     service methods, mock scenario ids, interaction scenario ids, and live scenario
     ids.
   - Seed it from the GitHub-backed inventory in
     `plans/glab-tui-feature-parity.md`.
   - Mark the explicit exclusions with reasons; do not treat unsupported GitHub
     behavior as a missing implementation.
2. Add deterministic GitHub fixtures under `test/fixtures/github/`.
   - Include paginated list/detail responses, empty responses, malformed payloads,
     permission and rate-limit errors, logs, workflow metadata, and mutation results.
   - Sanitize all private text and identifiers.
3. Add `test/support/fakeGh.ts`.
   - Capture executable, argv, stdin, environment allowlist, exit code, stdout,
     stderr, and invocation order.
   - Support pagination, timeouts, cancellation, malformed output, and redaction
     assertions.
4. Add OpenTUI harness support under `test/e2e/`.
   - Render fixed-size frames.
   - Dispatch keys, key sequences, mouse clicks, wheel events, and text entry.
   - Inspect rendered text and assert the resulting service/command effects.
5. Generate a parity report from the manifest in a test or script that fails when:
   - an in-scope entry lacks an owner;
   - a `complete` entry lacks required scenarios;
   - an excluded entry lacks a reason;
   - a registered capability remains `missing`.

### Verify

- Run harness self-tests with no network at all four terminal sizes.
- Prove that an interaction invokes the expected command/service effect, not merely
  that it opens a modal.
- Assert snapshots and telemetry contain no tokens, notification subjects, review
  bodies, or workflow input values.
- Re-run the full existing suite and record the current green baseline in test
  documentation.

### Milestone exit

- CI can generate the parity report.
- Every accepted fact with automated verification has a manifest or test owner.
- No feature can be marked complete without unit, render, interaction, and live
  scenario ids.

## Milestone 1 — Surface registry, versioned config, and Releases exemplar

### Fact coverage

`scope-layout`, `surface-reachability`, `surface-states`, `surface-registry`,
`github-service`, `command-entrypoint`, `mutation-safety`,
`config-compatibility`, `cache-safety`, `releases`.

### Build foundation

1. Add `src/workspace/surfaceRegistry.ts`.
   - Move stable ids, labels, scope availability, badge sources, refresh command ids,
     filterability, full-screen behavior, and capability reasons into descriptors.
   - Replace the parallel conditionals in:
     - `src/workspaceSurfaces.ts`
     - `src/workspace/atoms.ts`
     - `src/workspace/derivations.ts`
     - `src/ui/WorkspaceTabs.tsx`
     - `src/surfaces/WorkspaceContent.tsx`
     - `src/surfaces/WorkspaceFooter.tsx`
     - `src/commands/builtins.ts`
     - `src/keymap/listNav.ts`
   - Add a compact overflow Surface picker so every registered Surface remains
     reachable at narrow widths.
2. Add `src/configStore.ts`.
   - Introduce `configVersion`.
   - Parse existing unversioned theme, editor, repository-path, whitespace,
     system-theme, and scrollbar settings.
   - Preserve unknown keys and use atomic replace-on-success writes.
   - Add typed sections for per-Surface views and command-id key overrides.
   - Keep `src/themeStore.ts` as a compatibility wrapper until callers migrate.
3. Split private GitHub capability implementation under `src/services/github/`
   without changing the public `GitHubService` Context tag:
   - begin with `items.ts` and `releases.ts`;
   - centralize typed command/API helpers and error classification;
   - preserve current callers and tests.

### Build Releases

1. Add release domain types and Effect schemas in `src/domain.ts` and
   `src/services/githubSchemas.ts` or a focused release schema module.
2. Add list/create/edit/delete methods in `src/services/github/releases.ts`, preferring
   `gh release list/create/edit/delete`.
3. Add deterministic mutable release state to `src/services/MockGitHubService.ts`.
4. Add additive release tables and methods to `src/services/CacheService.ts`.
5. Add release atoms, load state, repository Surface, details pane, create/edit
   modals, and delete confirmation under focused `src/surfaces/release/` and
   `src/ui/modals/` files.
6. Register stable release commands, keymap context, palette entries, footer hints,
   and mouse behavior.

### Verify

- Test user/repository Surface availability and overflow-picker bounds.
- Test old/unversioned/unknown/invalid config fields and interrupted atomic writes.
- Test release normalization, bounded listing, cache round-trip, corrupt rows, and
  authoritative refresh after mutation.
- Assert exact `gh release` argv and blank tag/name plus multiline-note validation.
- Prove delete cannot bypass the command confirmation.
- In the configured disposable repository, with explicit live apply approval:
  create a draft or pre-release, observe it, edit it, delete it, refresh, and compare
  GitHub with cache state.

### Milestone exit

- Releases are fully usable by keyboard, palette, and mouse.
- Existing Pull Request and Issue navigation remains green.
- Add a user-facing changeset and pass the milestone gate.

## Milestone 2 — Complete Issue and Pull Request management

### Fact coverage

`issues`, `pull-requests`, `selectors-and-bulk`, `mutation-safety`,
`surface-reachability`, `surface-states`.

### Build

1. Extend domain models and schemas for editable Issue/PR metadata in:
   - `src/domain.ts`
   - `src/services/githubSchemas.ts`
   - `src/services/githubNormalize.ts`
2. Add native command implementations in `src/services/github/items.ts` for:
   - Issue create, edit, close, reopen, and delete;
   - Pull Request create, edit, close, reopen, draft transitions, approve, and merge;
   - labels, assignees, reviewers, milestones, and branch metadata.
3. Add paginated selector data and UI for labels, assignees, reviewers, milestones,
   and branches.
4. Add a shared date input only for GitHub-supported date fields.
5. Centralize optimistic patch, rollback, cache eviction/patch, refresh, and error
   reporting in `src/item/useItemMutations.ts`.
6. Extend `src/item/useItemModalActions.ts`,
   `src/surfaces/issue/useIssueSurface.ts`,
   `src/surfaces/pullRequest/usePullRequestSurface.ts`,
   `src/surfaces/IssueSurface.tsx`, `src/surfaces/PullRequestSurface.tsx`, and focused
   modal files.
7. Add a generic multi-selection state for Issues/PRs only.
   - Support status, labels, assignees, and milestone operations.
   - Use bounded concurrency and stable item ordering.
   - Report succeeded, failed, skipped, and retryable items.
   - Allow retry of failed items only and cancellation of remaining work.
8. Register all commands, disabled reasons, confirmations, keymaps, palette entries,
   footer hints, and mouse actions.

### Verify

- Assert exact native `gh issue` and `gh pr` argv for every mutation.
- Test selector paging, empty data, archived/deleted users, and permission failures.
- Test optimistic success, rollback, cache convergence, and stale refresh races.
- Test bulk concurrency limit, stable results, partial failure, retry-failed, and
  cancellation.
- Preserve existing queues, pagination, selection, comments, merge, and cache tests.
- With explicit live apply approval:
  - create/edit/close/reopen/delete a fixture Issue;
  - create a fixture PR from a prepared branch, edit all supported metadata, close,
    and reopen it;
  - run a three-item bulk label change with one deliberately invalid target and
    verify the partial-failure report.

### Milestone exit

- The parity manifest contains no Issue/PR management gap other than unsupported PR
  deletion.
- Add a user-facing changeset and pass the milestone gate.

## Milestone 3 — Atomic reviews, suggestions, and diff completion

### Fact coverage

`atomic-reviews`, `suggestions-and-diffs`, `syntax-validation`,
`existing-workflows`, `mutation-safety`.

### Build pending reviews

1. Add pending-review types and schemas in `src/domain.ts` and
   `src/services/githubSchemas.ts`.
2. Add `src/services/github/reviews.ts` methods to:
   - find the viewer's pending review;
   - create it if absent;
   - add ordered inline or multi-line comments;
   - edit/delete queued comments;
   - discard the review after confirmation;
   - submit it atomically as Comment, Approve, or Request changes with optional
     summary.
3. Add pending-review hydration and state in `src/ui/diff/atoms.ts` and
   `src/ui/comments/atoms.ts`.
4. Extend:
   - `src/ui/PullRequestDiffPane.tsx`
   - `src/ui/diff/comments.ts`
   - `src/ui/modals/CommentModal.tsx`
   - `src/ui/modals/SubmitReviewModal.tsx`
   - `src/keymap/diffView.ts`
   - `src/commands/builtins.ts`
5. Add a pending-review pane with navigate, edit, delete, discard, and submission
   routes.

### Build diff completion

1. Evolve `src/ui/diff.ts` into a semantic row model shared by rendering, geometry,
   selection, comments, and navigation.
2. Preserve current raw patch behavior until the new model passes parity fixtures for
   GitHub patches and comment anchors.
3. Add accurate suggestion-block serialization for selected ranges and preview.
4. Add syntax tokens and word-level change spans.
5. Add file-section geometry and viewport windowing with placeholder height
   preservation in `src/ui/PullRequestDiffPane.tsx`.
6. Add a bounded highlight cache keyed by content, language, theme, view mode, and
   whitespace mode, with viewport-near prefetch and teardown ownership.

### Verify

- Test pending-review discovery/create/resume across restart.
- Test comment order, left/right range sides, outdated positions, head-SHA changes,
  and idempotent submission.
- Test suggestion serialization for one/many lines, added/deleted sides, rename,
  binary files, no-newline markers, and paths with spaces.
- Test identical geometry and anchors across split/unified, wrap, whitespace, and
  windowing combinations.
- Benchmark generated large patches and record initial render time, peak RSS, and
  repeated scroll latency against an agreed budget captured in the manifest.
- Remove or contain the current Tree-sitter teardown warning and directly assert
  syntax-highlight output and lifecycle.
- With explicit live apply approval, queue comments on two files, include a multiline
  suggestion, restart ghui, resume, submit once, and verify GitHub shows one review
  containing every comment.

### Milestone exit

- Pending reviews survive restart and submit atomically.
- Existing diff navigation and comments remain green.
- Update `plans/queued-reviews.md` and `plans/diff-rendering-performance.md` status.
- Add a user-facing changeset and pass the milestone gate.

## Milestone 4 — Complete GitHub Actions

### Fact coverage

`actions`, `artifacts`, `surface-reachability`, `surface-states`,
`github-command-contract`, `cache-safety`.

### Build

1. Add workflow, run, job, step, input, artifact, and log domain schemas.
2. Add `src/services/github/actions.ts` using:
   - `gh run list/view/rerun/cancel`;
   - `gh workflow list/view/run`;
   - `gh run view --job ... --log`;
   - `gh run download`;
   - raw API only for an unsupported per-job action after checking the minimum
     supported `gh` version.
3. Extend deterministic action scenarios in `src/services/MockGitHubService.ts`.
4. Add repository-wide Actions to the Surface registry while reusing the current
   per-PR run data model and view.
5. Extend:
   - `src/ui/runs/atoms.ts`
   - `src/ui/runs/RunsPane.tsx`
   - `src/ui/runs/runsRows.ts`
   - `src/hooks/useRunsView.ts`
   - `src/keymap/runsView.ts`
6. Add workflow/run filters, full job and step drill-down, on-demand scrollable logs,
   retry/cancel commands, a schema-driven dispatch modal, and artifact destination
   selection.
7. Add cache-first run summaries/details with authoritative invalidation; do not cache
   logs, artifacts, or input values.
8. Start bounded auto-refresh only while the terminal is focused and an in-progress
   run is visible.

### Verify

- Assert exact `gh run` and `gh workflow` argv and any fallback API contract.
- Test paging, rerun attempts, matrix jobs, absent timestamps, cancelled/skipped jobs,
  large log streaming, interruption, and permission failures.
- Test auto-refresh start/stop on Surface visibility and terminal focus.
- Test required/default/boolean/choice inputs and input redaction.
- Test artifact traversal, existing destination, interruption, cleanup, and no-artifact
  states.
- With explicit live apply approval, dispatch a typed fixture workflow, observe it
  through completion, cancel one fixture run, rerun a failed fixture, inspect a job
  log, and download an artifact to a temporary directory.

### Milestone exit

- Repository and per-PR Actions share one data model.
- Supported run/job operations work by keyboard, palette, and mouse.
- Add a user-facing changeset and pass the milestone gate.

## Milestone 5 — Repository resource Surfaces

### Fact coverage

`branches`, `milestones`, `environments`, `runners`, `surface-states`,
`mutation-safety`, `cache-safety`.

### Build in order

1. **Branches**
   - Add domain/schema/service/mock/cache state.
   - List name, default/protected state, and SHA.
   - Create from a selected ref.
   - Confirm delete and disable it for default, protected, or currently selected
     branches with a reason.
2. **Extract proven resource primitives**
   - After Releases and Branches demonstrate the repeated shape, extract only common
     list/detail/load-state behavior under:
     - `src/surfaces/resource/`
     - `src/ui/resource/`
   - Do not force Pull Requests, Issues, Actions, or Environments into this
     abstraction.
3. **Milestones**
   - Add list/details with state, issue progress, due date, and nested issues.
   - Add create/edit/close/reopen/delete.
   - Reuse selector and date components from Milestone 2.
4. **Environments and deployments**
   - Add environment summaries with latest deployment state and URL.
   - Add paginated deployment drill-down and browser opening.
   - Keep all environment/deployment behavior read-only.
5. **Runners**
   - Add repository runner status, busy state, labels, and details.
   - Render missing admin permission as a capability reason.
   - Do not register pause, resume, or edit commands.
6. Implement private capability modules:
   - `src/services/github/branches.ts`
   - `src/services/github/milestones.ts`
   - `src/services/github/deployments.ts`
   - `src/services/github/runners.ts`
7. Add additive cache tables with resource-appropriate TTLs and invalidation.

### Verify

- Test schema decoding, normalization, pagination, mocks, and cache migration for every
  resource.
- Assert exact endpoint, method, body, and percent-encoding for raw APIs.
- Test branch deletion guards and ref validation.
- Test milestone progress math and date serialization.
- Test environments with no deployment, inactive state, missing URLs, and multiple
  deployment pages.
- Test runner online/offline, busy/idle, ephemeral labels, and permission failures.
- With explicit live apply approval:
  - create/delete a prefixed non-protected branch;
  - create/edit/close/reopen/delete a milestone linked to fixture Issues;
  - deploy a fixture workflow to a test environment and inspect history;
  - list a test runner when available, otherwise validate a controlled permission
    failure.

### Milestone exit

- All four Surfaces meet the UI contract at narrow and wide sizes.
- Add a user-facing changeset and pass the milestone gate.

## Milestone 6 — Notifications, saved views, and configurable keybindings

### Fact coverage

`notifications`, `saved-views`, `keybindings`, `config-compatibility`,
`command-entrypoint`, `scope-layout`.

### Build

1. Add `src/services/github/notifications.ts`.
   - Page unread/all notifications.
   - Normalize reason, type, repository, subject, updated time, and target URL.
   - Mark one or selected notification threads read with rollback.
2. Add the user-scoped Notifications Surface with search, filters, target opening,
   multi-selection, empty/error/permission states, and short-lived cache summaries.
3. Add schema-driven list/resource column definitions.
4. Persist per-Surface visible columns, sort, grouping, and value filters through
   `src/configStore.ts`.
5. Extend `packages/keymap/src/`, `src/keymap/all.ts`, and command registration for
   command-id key overrides.
6. Diagnose conflicts, prefix ambiguity, invalid keys, reserved keys, and unreachable
   commands before dispatch.
7. Add reset-to-default commands for one Surface and all app settings.

### Verify

- Test notification pagination, unread/all, unknown subject types, inaccessible or
  deleted targets, and mark-read rollback.
- Test that ordinary user notifications are never used by fixtures or snapshots.
- Test deterministic composition of search/filter/group/sort and selected-id
  preservation.
- Test restart persistence and removed/renamed column compatibility.
- Test config migration from every supported unversioned shape.
- Test scoped key overrides, collision diagnostics, palette display, safety
  preservation, and reset.
- With the dedicated test identity, create or receive a controlled notification, mark
  only it read, save a grouped/filtered view, restart, remap one command, verify the
  old key no longer dispatches it in that scope, and reset.

### Milestone exit

- Bad view or binding values are recoverable and diagnosable without hand-editing.
- Add a user-facing changeset and pass the milestone gate.

## Milestone 7 — CLI operations, parity closeout, and release proof

### Fact coverage

`cli-operations`, `releasable-milestones`, `final-release-validation`,
`parity-contract`, `live-validation`, `autonomous-execution`.

### Build

1. Refactor `src/standalone.ts` into a tested command parser and add:
   - `ghui doctor [--json]`;
   - `ghui cache list`;
   - `ghui cache clean [--dry-run]`;
   - `ghui open <issue|pr|run|job|milestone|release|environment> <id>`;
   - `ghui repos`.
2. Make `doctor` check:
   - `gh` availability and supported version;
   - authentication;
   - current repository context;
   - config parsing and diagnostics;
   - cache migration, health, lock, and size;
   - writable config/cache directories;
   - terminal capabilities;
   - optional runner/environment permissions.
3. Make cache cleanup path-safe, dry-run by default where ambiguity exists, and report
   exact targets and reclaimed sizes.
4. Generate the final parity report from `test/parity/manifest.ts`.
5. Update README, CLI help, screenshots, and relevant plan statuses.
6. Add the final changeset and prepare the release through the existing
   `.github/workflows/publish.yml` contract.

### Verify

- Test parsing, help, typo suggestions, stable JSON, exit codes, and no-TTY behavior.
- Test healthy/degraded/failing doctor fixtures.
- Test cache dry-run/apply, corrupt/locked databases, symlink/path safety, and
  idempotence.
- Test `open` mapping and invalid ids.
- Run the full manifest locally with deterministic mocks.
- With explicit live apply approval, run every live scenario against the exact
  disposable repository and dedicated identity, perform idempotent cleanup, and
  review the final resource inventory.
- Install the built standalone artifact in a temporary prefix outside the source tree
  and run:
  - `ghui --version`;
  - `ghui doctor`;
  - one read-only launch from another repository;
  - representative `cache`, `open`, and `repos` commands.
- Run `bun run package:smoke` and `bun run build:standalone`.
- Before any actual public release, obtain the required external-action approval, then
  verify:
  - publish workflow success;
  - npm version and install;
  - Homebrew tap workflow success;
  - formula metadata;
  - a clean Homebrew install and version/smoke check.

### Milestone exit

- The parity report contains only `complete` or approved `excluded` entries.
- Source, mock, installed standalone, live GitHub, npm, and Homebrew results agree.
- Documentation and plan statuses describe shipped behavior accurately.

## Live validation harness requirements

Use an explicit variable such as:

```bash
GHUI_PARITY_TEST_REPO=owner/repo
```

The live harness must refuse mutations unless all of these are true:

- repository owner/name exactly matches the configured value;
- the authenticated identity has the required permission;
- the repository carries a dedicated parity-test marker;
- explicit apply mode is present;
- destructive or externally visible work has current user approval;
- every cleanup target uses a run-specific prefix and is recorded.

The fixture setup should be able to create:

- open and closed Issues plus a milestone;
- a PR with multiple text files, a rename, binary content, and a large diff;
- labels, assignees, and reviewer candidates;
- passing, failing, cancelled, and dispatchable workflows;
- an artifact;
- a protected default branch and disposable feature branches;
- a test environment and deployment;
- a draft or pre-release.

Cleanup must be idempotent and end with a resource inventory. Runner and notification
scenarios may use the dedicated test identity/repository because those resources
cannot always be synthesized safely.

## Risks and controls

- **Surface sprawl:** registry first, Surface-owned atoms/hooks, no resource-specific
  prop threading through `useAppShell`, and no registration before completion.
- **Service sprawl:** one public Effect Context composed from narrow private modules,
  each with schemas, mocks, and contract tests.
- **GitHub CLI/API drift:** exact command contracts, typed decoding, minimum `gh`
  version checks, and explicit capability errors.
- **Rate limits:** lazy Surface loading, bounded pagination, short targeted refreshes,
  cached stable summaries, and no hidden auto-refresh.
- **Cache/config loss:** additive migrations, backward decoders, atomic config writes,
  corrupt-row fallbacks, and previous-binary reopen checks.
- **Mutation safety:** command-boundary confirmation, disabled reasons, exact live repo
  matching, explicit apply mode, prefixed fixtures, and idempotent cleanup.
- **False parity confidence:** reference source is inventory only; the manifest,
  command effects, UI assertions, installed binary, and live GitHub are the proof.
- **Long-running integration:** independently releasable milestones, changesets, and
  hidden incomplete Surfaces.

## Deferred implementation-time choices

These do not block the goal and should use the default unless current evidence
requires escalation:

1. Surface overflow defaults to a compact picker backed by the same registry and
   commands; switch to a filtered “Go to Surface” modal only if narrow-layout testing
   shows the picker is insufficient.
2. Per-job cancel uses native `gh` when the supported version exposes it; otherwise
   use the raw API with explicit capability tests.
3. Runner read/details ships even without management mutations because that is the
   GitHub-backed reference behavior.
4. Cache stable resource summaries, use short TTLs for notifications and runners, and
   never cache logs or workflow input values.

## Done condition

The goal is complete when all accepted facts are satisfied; every in-scope parity
manifest entry is `complete`; every exclusion is approved and GitHub-specific; all
fast, milestone, interaction, contract, migration, and guarded live scenarios pass;
cleanup leaves no unrecorded fixtures; and source, mocks, installed standalone, npm,
and Homebrew packaging agree without regressing existing ghui workflows.
