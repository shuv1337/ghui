# GitHub feature parity with `glab-tui`

## Status

In progress — all eight implementation milestones are complete locally as of
2026-07-29. Guarded live mutation scenarios and public npm/Homebrew release proof
remain pending explicit approval. Plan written from live reviews of:

- `ghui` at `653e4bd` (`main`, aligned with `origin/main`)
- `glab-tui` at `72b962f` (`main`, aligned with `origin/main`)

The current baseline is clean:

- `ghui`: format, typecheck, lint, 542 application tests, and 131 keymap tests pass.
- `glab-tui`: format, clippy, 51 unit tests, and 71 PTY/e2e tests pass.

Milestone progress:

- **M0 complete (2026-07-29):** added the capability manifest/report, deterministic
  fixtures, fake-`gh` command harness, four-size OpenTUI interaction harness, live
  safety guard, CI report step, and package-smoke isolation. The milestone gate passes
  with 558 application tests, 131 keymap tests, package smoke, and the Linux x64
  standalone build.
- **M1–M6 complete (2026-07-29):** shipped the Surface/config foundation,
  Releases, complete Issue and Pull Request management, atomic reviews and
  suggestions, repository Actions and artifacts, repository resources,
  Notifications, saved views, and configurable keybindings.
- **M7 implementation complete (2026-07-29):** added doctor, safe cache
  inspection/cleanup, open, and repository CLI commands plus installed npm/Bun
  and standalone smoke coverage. `bun run parity:live` now provides an
  executable, fail-closed production-service read suite and accounts for every
  live capability id. The ledger records the 19 capabilities awaiting guarded
  mutation acceptance as partial rather than overstating parity. Final guarded
  mutation and public release proof remains pending explicit approval.

## Why

`ghui` is already the stronger GitHub pull-request workspace: it has multi-repository
queues, repository scope, SQLite-backed cache-first loading, a command registry,
composable keymaps, rich PR details, inline comments, split/unified diffs, and a
read-only per-PR Actions view.

`glab-tui` is broader. Its GitHub backend and UI cover issue/PR creation and metadata
editing, repository-wide Actions and jobs, artifacts, runners, releases, notifications,
milestones, branches, environments/deployments, bulk editing, configurable table
layouts, configurable keybindings, diagnostics, and cache management.

The goal is to bring that breadth into `ghui` without replacing `ghui`'s architecture,
regressing its current workflows, or reproducing GitLab-only behavior that GitHub
cannot support.

## Parity contract

For this plan, **feature parity** means:

1. Every user-visible `glab-tui` capability that its GitHub backend genuinely supports
   is either:
   - available in `ghui`,
   - deliberately mapped to a more native `ghui` interaction, or
   - explicitly documented as unsupported by GitHub with a clear disabled reason.
2. A capability is not "done" merely because a service method exists. It must have:
   - a reachable Surface, view mode, modal, or command;
   - keyboard and command-palette access, plus mouse access where the surrounding
     component already supports mouse interaction;
   - loading, empty, error, retry, and permission-denied states;
   - deterministic mock coverage and command-contract tests;
   - live validation against a disposable GitHub test repository when it performs API
     reads or mutations.
3. Parity is behavioral, not pixel-for-pixel. New work keeps `ghui`'s OpenTUI/React,
   Effect, Atom, Surface, command-registry, and keymap patterns.
4. The `glab-tui` source and GitHub backend are the reference inventory, but its test
   names are not a sufficient oracle. Several current PTY/e2e cases instantiate a
   session without asserting the advertised behavior.

## Scope

### In scope

- GitHub Issues and Pull Requests: create, edit, reopen, close, labels, assignees,
  reviewers, milestones, base/head metadata, and safe bulk operations.
- Pending/queued PR reviews, multi-comment atomic submission, suggestions, and diff
  quality/performance parity.
- Repository-wide Actions, run/job details, logs, retry, cancel, dispatch inputs, and
  artifact download.
- Repository runners (GitHub-supported read/details behavior).
- Releases, notifications, milestones, branches, environments, and deployments.
- Live search, value filters, grouping/sorting, configurable views, and user-remappable
  keybindings.
- `doctor`, cache inspection/cleanup, and non-TUI `open` commands.
- Cache-first loading, refresh semantics, error handling, mouse interaction, and
  packaging/release validation for every new Surface.

### Explicitly out of scope

- GitLab host support or a second backend.
- GitLab-only fields and actions: confidentiality, weight, GitLab runner
  pause/resume/description mutation, todos, manual GitLab jobs, and GitLab pipeline
  variables.
- Deleting Pull Requests, which GitHub does not support.
- An embedded terminal Surface. `ghui` already runs inside the user's terminal, and
  adding a terminal multiplexer is not GitHub feature parity.
- Copying `glab-tui`'s Rust state/event architecture or its table visuals.
- A self-updater inside the TUI. `ghui` already ships through Homebrew/npm and should
  continue to defer upgrades to the package manager.

## Current-state capability matrix

| Capability | `glab-tui` GitHub behavior | Current `ghui` | Parity work |
|---|---|---|---|
| Workspace/repository navigation | Current repo plus repository switcher | User/repository scopes, repo hub, favorites/recents | Preserve; use as the host for new Surfaces |
| Pull Request browse/detail | List, detail, search, filters, metadata columns | Stronger multi-repo queues, hydration, cache, detail modes | Preserve; add missing metadata and mutations |
| Pull Request mutations | Create, edit, close/reopen, draft, approve, merge, labels, assignees, reviewers, milestone, target branch | Close, draft, review, merge, labels | Add create/edit/reopen and metadata selectors |
| Issues | List, create, edit, close/reopen/delete, labels, assignees, milestone, due date | List/detail/comments, labels, close | Add create/edit/reopen/delete and metadata selectors |
| Code review/diff | Inline/multi-line comments, draft review, suggestions, syntax highlighting, split/unified | Strong navigation, immediate comments, review modal, split/unified, whitespace/wrap | Add pending review lifecycle, suggestions, and finish diff performance/highlighting plan |
| Actions/runs/jobs | Repo-wide runs, jobs, logs, retry/cancel, dispatch, artifacts | Read-only per-PR runs and job/step summaries | Add repo Surface and complete run/job operations |
| Runners | Repository runner list/details; GitHub mutations are not implemented | Absent | Add read/details with honest capability gating |
| Releases | List/create/edit/delete | Absent | Add repository Surface and confirmed mutations |
| Notifications | Unread/all, search, open subject, mark read | Absent | Add user-scoped Surface and mark-read flow |
| Milestones | List/progress/issues, create/edit/close/reopen/delete | Absent | Add repository Surface, date input, and confirmed mutations |
| Branches | List, create, delete | Absent | Add repository Surface and protected/default guards |
| Environments/deployments | Environment list and nested deployment history | Absent | Add repository Surface with environment-to-deployment drill-down |
| Bulk operations | Multi-select Issues/PRs and batch metadata/status changes | Absent | Add generic selection model, bounded concurrency, partial-failure report |
| Search/view layout | Fuzzy search, columns, value filters, group/order persistence | Text/query filters and fixed row layouts | Add schema-driven columns, grouping, sorting, and saved views |
| Themes | 13 bundled plus custom TOML themes | 27 built-in themes and system light/dark pairs | Already exceeds; preserve |
| Keybindings | User-remappable config | Strong composable keymap, fixed bindings | Add validated command-id overrides and conflict reporting |
| Mouse | Tabs, rows, overlays, scrolling | Tabs, rows, diffs, links, files, runs, palette, scrolling | Extend existing row/modal primitives to new Surfaces |
| Cache/lazy loading | Per-project JSON cache and lazy tabs | SQLite cache-first queues/details and progressive hydration | Extend selectively with additive migrations |
| CLI diagnostics | `doctor`, `cache`, `clean-cache`, `open`, `repos` | Help/version/repo only | Add diagnostics and cache lifecycle commands |

## Product and architecture decisions

### 1. Keep user scope small and put repository resources in repository scope

User scope remains:

- Repositories
- Pull Requests
- Issues
- Notifications

Repository scope becomes:

- Pull Requests
- Issues
- Actions
- Releases
- Milestones
- Branches
- Environments
- Runners

Jobs remain nested under Actions, and deployments remain nested under Environments.
This preserves `ghui`'s Surface model and avoids reproducing `glab-tui`'s eleven-tab
bar literally.

### 2. Make Surface registration data-driven before adding seven Surfaces

Extend `src/workspaceSurfaces.ts` with scope-aware Surface descriptors rather than
adding more parallel conditionals. The descriptor owns:

- stable id and label;
- allowed workspace scope;
- count/badge source;
- loading and refresh command ids;
- filterability and full-screen behavior;
- optional capability/permission reason.

Proposed new path: `src/workspace/surfaceRegistry.ts`.

Update the existing consumers:

- `src/workspace/atoms.ts`
- `src/ui/WorkspaceTabs.tsx`
- `src/surfaces/WorkspaceContent.tsx`
- `src/surfaces/WorkspaceFooter.tsx`
- `src/workspace/derivations.ts`
- `src/commands/builtins.ts`
- `src/keymap/listNav.ts`

The tab renderer must handle overflow at narrow widths with a compact secondary
Surface picker rather than truncating unreachable tabs.

### 3. Preserve one public GitHub service while splitting implementation by capability

`src/services/GitHubService.ts` remains the public Effect Context service. Its
implementation should be composed from proposed private modules under
`src/services/github/`:

- `items.ts`
- `reviews.ts`
- `actions.ts`
- `releases.ts`
- `notifications.ts`
- `milestones.ts`
- `branches.ts`
- `deployments.ts`
- `runners.ts`

Each module receives the existing typed `CommandRunner` helpers and returns a narrow
method group. Native `gh` subcommands are mandatory when they expose the required
fields and pagination. Raw `gh api` is limited to capabilities without a sufficient
native command.

`src/services/MockGitHubService.ts` must implement every public method in the same
slice that introduces it. No runtime method may land without a deterministic mock.

### 4. Build one concrete resource Surface before extracting generic UI

Releases is the first new repository resource Surface because it has:

- a bounded list;
- useful details;
- create/edit/delete mutations;
- no nested paging model.

Implement it concretely first. Extract shared resource primitives only after Branches
or Milestones proves the repeated shape. Likely proposed paths after that proof:

- `src/surfaces/resource/ResourceSurface.tsx`
- `src/surfaces/resource/useResourceSurface.ts`
- `src/ui/resource/ResourceList.tsx`
- `src/ui/resource/atoms.ts`

Do not force PRs, Issues, Actions, or Environments into a generic table abstraction;
their interaction models are materially different.

### 5. Keep commands as the only action entry point

Every new user action gets a stable command id in `src/commands/builtins.ts`.
Keymaps, the command palette, buttons, mouse handlers, and contextual footer hints
dispatch that command instead of owning mutation logic.

Each destructive action uses a confirmation modal and a command-level disabled reason.
The confirmation requirement is tested at the command boundary so a future keybinding
cannot bypass it.

### 6. Extend the cache only where stale-first behavior is valuable

Add additive migrations in `src/services/CacheService.ts` for:

- Actions run summaries and details;
- releases;
- milestones;
- branches;
- environments/deployments;
- runner summaries;
- notifications, with short TTLs and no mutation bodies.

Do not cache job logs, artifact bytes, secrets, or workflow input values. Mutations
must patch/evict the relevant cached row and then schedule an authoritative refresh.
Every migration needs forward, reopen, corrupt-row, and old-database tests.

### 7. Turn `config.json` into a versioned app configuration

`src/themeStore.ts` currently stores themes, scrollbar settings, diff whitespace, and
editor configuration despite its name. Introduce a proposed `src/configStore.ts`
facade with:

- `configVersion`;
- existing theme/editor values;
- per-Surface visible columns, group, sort, and value filters;
- command-id-to-key-sequence overrides;
- backward-compatible parsing of the existing unversioned file;
- atomic writes and preservation of unknown keys.

Keep `themeStore.ts` as a compatibility wrapper until all callers migrate. Invalid
bindings or view settings fall back per-field and appear in `ghui doctor`; they must
not prevent startup.

## API and command mapping

Use these command families as the implementation contract. Exact JSON fields and
schemas are pinned in command-contract tests before UI work starts.

| Capability | Preferred command | Raw API only when required |
|---|---|---|
| Issue create/edit/reopen/delete | `gh issue create/edit/reopen/delete` | None unless a current `gh` release lacks a required field |
| PR create/edit/reopen | `gh pr create/edit/reopen` | Inline review positions and pending-review lifecycle |
| Repo Actions | `gh run list/view/rerun/cancel`, `gh workflow list/view/run` | Per-job cancel if still not exposed natively |
| Logs/artifacts | `gh run view --job … --log`, `gh run download` | None |
| Runners | — | `GET repos/{repo}/actions/runners` |
| Releases | `gh release list/create/edit/delete` | Asset metadata only if native JSON is insufficient |
| Notifications | — | `GET notifications`, `PATCH notifications/threads/{id}` |
| Milestones | — | `GET/POST/PATCH/DELETE repos/{repo}/milestones` |
| Branches | — | `GET repos/{repo}/branches`, Git refs create/delete |
| Environments/deployments | — | `GET repos/{repo}/environments` and `/deployments` |
| Labels | `gh label list`, `gh issue edit`, `gh pr edit` | None |
| Members/reviewers | native edit commands for mutations | Repository collaborators/assignees queries when selectors need them |

Raw API code must:

- use typed Effect Schema decoding;
- request explicit pagination and drain pages deterministically;
- classify permission/rate-limit failures through existing error handling;
- avoid logging bodies, review text, workflow inputs, or notification subjects in
  telemetry.

## Ordered implementation plan

Each milestone is independently mergeable. A user-facing milestone includes a
changeset and updates this plan's Status section.

### Milestone 0 — Freeze the parity contract and strengthen the harness

**Build**

- Add a machine-readable proposed `test/parity/manifest.ts` that lists each capability,
  status (`existing`, `partial`, `missing`, `excluded`), command ids, service methods,
  required mock scenario, and live-validation scenario.
- Add proposed deterministic fixtures under `test/fixtures/github/`.
- Add a proposed fake-`gh` command harness under `test/support/fakeGh.ts` to capture
  argv/stdin and return paginated JSON, text logs, permission errors, rate limits, and
  malformed responses.
- Add a proposed OpenTUI parity harness under `test/e2e/` that can render a fixed
  terminal frame, dispatch key/mouse input, inspect text, and assert service effects.
- Record the two clean baseline command sets in the test documentation.

**Test**

- Manifest completeness test: every in-scope capability has an owner milestone and
  acceptance scenario.
- Fake-CLI tests: pagination, non-zero exit, timeout, malformed JSON, and redaction.
- Harness self-test at `60x16`, `99x24`, `100x24`, and `160x40`.

**Validate**

- The harness runs without network access.
- The harness proves that a named command was invoked, not merely that a modal opened.
- No snapshot contains tokens, raw notification subjects, review bodies, or workflow
  input values.

**Done when**

- Parity status is generated from the manifest in CI.
- A feature cannot be marked complete without unit, render, interaction, and live
  scenario identifiers.

### Milestone 1 — Surface registry, config foundation, and resource exemplar

**Build**

- Add the scope-aware Surface registry and overflow picker.
- Introduce `configStore.ts` with versioned, backward-compatible reads/writes.
- Implement Releases end to end:
  - domain types and schemas;
  - `GitHubService` and `MockGitHubService`;
  - atoms/load state;
  - repository Surface and detail pane;
  - create/edit/delete modals;
  - commands, keymap context, footer hints, mouse selection;
  - additive cache table and invalidation.

**Modify**

- `src/workspaceSurfaces.ts`
- `src/workspace/atoms.ts`
- `src/ui/WorkspaceTabs.tsx`
- `src/surfaces/WorkspaceContent.tsx`
- `src/surfaces/WorkspaceFooter.tsx`
- `src/commands/builtins.ts`
- `src/keymap/all.ts`
- `src/keymap/listNav.ts`
- `src/services/GitHubService.ts`
- `src/services/MockGitHubService.ts`
- `src/services/CacheService.ts`
- `src/domain.ts`
- `CONTEXT.md` if a new load-bearing domain term is introduced

**Test**

- Surface availability in user versus repository scope.
- Overflow picker keyboard/mouse behavior and narrow-terminal bounds.
- Release normalization, pagination/limit, cache round-trip, and corrupt-row fallback.
- Exact `gh release` argv for list/create/edit/delete.
- Confirmation cannot be bypassed for delete.
- Create/edit validation for blank tag/name and multiline notes.

**Validate live**

- In a disposable repository: create a draft/pre-release, observe it in the Surface,
  edit name/notes, delete it, refresh, and confirm GitHub and cache agree.

**Done when**

- Releases are fully usable without the command palette, fully usable through the
  command palette, and no existing PR/Issue navigation test regresses.

### Milestone 2 — Complete Issue and Pull Request management

**Build**

- Issue create, full edit, reopen, and delete flows.
- PR create, full edit, and reopen flows.
- Searchable selectors for labels, assignees, reviewers, milestones, and branches.
- Shared date input for GitHub-supported due dates.
- Optimistic mutation helpers with authoritative refresh and rollback.
- Bulk selection for Issues/PRs with operations for status, labels, assignees, and
  milestone.
- Partial-failure results: succeeded, failed, skipped, and retryable items.

**Modify**

- `src/domain.ts`
- `src/services/GitHubService.ts`
- `src/services/MockGitHubService.ts`
- `src/item/useItemMutations.ts`
- `src/item/useItemModalActions.ts`
- `src/surfaces/issue/useIssueSurface.ts`
- `src/surfaces/pullRequest/usePullRequestSurface.ts`
- `src/surfaces/IssueSurface.tsx`
- `src/surfaces/PullRequestSurface.tsx`
- `src/ui/modals/types.ts`
- `src/ui/modals.tsx` and focused modal components
- `src/commands/builtins.ts`
- relevant keymap context files under `src/keymap/`

**Test**

- Exact native `gh issue`/`gh pr` arguments for every mutation.
- Selector pagination, empty results, archived users, deleted users, and permission
  failures.
- Optimistic success and rollback-on-failure.
- Bulk concurrency cap, stable result ordering, partial failures, retry-only-failed,
  and cancellation.
- Destructive confirmations for Issue delete and close/reopen state gating.
- Current PR/Issue queue, selection, cache, comments, and merge tests remain green.

**Validate live**

- Create an Issue; edit title/body/labels/assignee/milestone/due date; close, reopen,
  and delete it.
- Create a PR from a prepared branch; edit title/body/base/labels/assignees/reviewers/
  milestone; close and reopen it.
- Run a three-item bulk label operation with one deliberately invalid target and verify
  the partial-failure report.

**Done when**

- The parity manifest has no Issue/PR management gaps other than GitHub's unsupported
  PR deletion.

### Milestone 3 — Atomic reviews, suggestions, and diff completion

This milestone merges the intent of existing `plans/queued-reviews.md` and
`plans/diff-rendering-performance.md`; those plans remain historical design inputs and
are updated to point at the shipped implementation when complete.

**Build**

- Server-backed pending review discovery/create/resume.
- Queue inline and multi-line comments into one pending review.
- Pending-review pane with navigate/edit/delete/discard.
- Atomic Comment/Approve/Request changes submission with optional summary.
- GitHub suggestion blocks with accurate selected-range serialization and preview.
- Finish semantic diff rows, viewport windowing, syntax highlighting, and word-diff
  spans without breaking current comment anchors, split/unified layout, whitespace
  filtering, wrap, or file navigation.

**Modify**

- `src/domain.ts`
- `src/services/GitHubService.ts`
- `src/services/githubNormalize.ts`
- `src/ui/diff.ts`
- `src/ui/PullRequestDiffPane.tsx`
- `src/ui/diff/atoms.ts`
- `src/ui/diff/comments.ts`
- `src/ui/comments/atoms.ts`
- `src/ui/modals/CommentModal.tsx`
- `src/ui/modals/SubmitReviewModal.tsx`
- `src/keymap/diffView.ts`
- `src/commands/builtins.ts`

**Test**

- Pending-review API lifecycle and recovery after restart.
- Queued comment order, range sides, outdated diff positions, and head-SHA changes.
- Suggestion serialization for one/many lines, added/deleted sides, rename, binary
  file, no-newline marker, and paths with spaces.
- Diff geometry parity across split/unified, wrapping, whitespace modes, and viewport
  windowing.
- Large generated patches meet an agreed render/scroll budget and do not mount every
  file.
- The Tree-sitter teardown warning currently seen in render tests is removed or
  explicitly contained; a green test with a destroyed highlighter is not accepted as
  syntax-validation success.

**Validate live**

- Queue comments on at least two files, include a multi-line suggestion, restart
  `ghui`, resume the pending review, submit it once, and verify GitHub shows one review
  containing all comments.
- Exercise a large PR and record initial diff render time, peak RSS, and repeated
  scroll latency before/after.

**Done when**

- Pending reviews survive restart, submit atomically, and all existing diff navigation
  and comment tests remain green.

### Milestone 4 — Complete GitHub Actions

**Build**

- Repository-wide Actions Surface with workflow/run filters.
- Reuse the current per-PR `runs` view for run details.
- Full job/step drill-down and on-demand scrollable logs.
- Retry all/failed jobs, cancel run, per-job retry/cancel when supported.
- Workflow dispatch modal generated from workflow input metadata.
- Artifact list and explicit download destination.
- Manual refresh plus bounded auto-refresh only while viewing an in-progress run.

**Modify**

- `src/domain.ts`
- `src/services/GitHubService.ts`
- `src/services/MockGitHubService.ts`
- `src/ui/runs/atoms.ts`
- `src/ui/runs/RunsPane.tsx`
- `src/ui/runs/runsRows.ts`
- `src/hooks/useRunsView.ts`
- `src/keymap/runsView.ts`
- `src/surfaces/WorkspaceContent.tsx`
- `src/commands/builtins.ts`
- `src/services/CacheService.ts`

**Test**

- Exact `gh run` and `gh workflow` argv.
- Pagination, attempts, matrix jobs, missing timestamps, cancelled/skipped jobs, and
  large log streaming.
- Auto-refresh starts/stops with visibility and terminal focus.
- Dispatch input types, defaults, required values, booleans/choices, and redaction.
- Artifact path traversal, existing destination, interrupted download, and no-artifact
  states.
- Retry/cancel confirmation, stale-state reconciliation, and permission failures.

**Validate live**

- Dispatch a fixture workflow with typed inputs.
- Observe queued → running → completed.
- Cancel one run, rerun a failed run, inspect a job log, and download a fixture
  artifact to a temporary directory.

**Done when**

- Repo-wide and per-PR Actions share one data model and all supported run/job actions
  work from keyboard, palette, and mouse.

### Milestone 5 — Repository resource Surfaces

**Build in this order**

1. Branches
2. Milestones
3. Environments/deployments
4. Runners

After Branches lands, extract only the resource list/detail primitives proven common
with Releases.

**Branches**

- List default/protected/SHA.
- Create from a selectable ref.
- Delete behind confirmation.
- Disable deletion for default/protected/currently selected branch with a reason.

**Milestones**

- List state, issue progress, due date, and nested issues.
- Create/edit/close/reopen/delete.
- Reuse selectors and date input from Milestone 2.

**Environments/deployments**

- List environments and latest deployment state/URL.
- Drill into paginated deployment history.
- Open environment/deployment URL in browser.
- Read-only in the first parity slice because `glab-tui`'s GitHub behavior is read-only.

**Runners**

- List repository runners with status/busy/labels/details.
- Do not expose pause/resume/edit commands: the reference GitHub backend returns errors
  for those operations.
- Render missing administration permission as a capability reason, not an empty list.

**Test**

- Schema/normalization and pagination for every resource.
- Exact raw API endpoint/method/body and percent-encoding for branch names.
- Default/protected branch deletion guards.
- Milestone progress math and date serialization.
- Environment with no deployment, inactive environment, missing URL, and deployment
  pagination.
- Runner offline/busy/ephemeral states and permission errors.
- Resource cache TTL, invalidation, and old-database migration.

**Validate live**

- Create/delete a non-protected branch.
- Create/edit/close/reopen/delete a milestone linked to fixture Issues.
- Deploy the fixture workflow to a test environment and inspect its deployment history.
- List a test runner when available; otherwise validate the documented permission
  failure with an account/repository lacking runner-admin access.

**Done when**

- All four Surfaces satisfy the parity contract, including empty/error/permission
  states and narrow-terminal navigation.

### Milestone 6 — Notifications, saved views, and configurable keybindings

**Build**

- User-scoped Notifications Surface: unread/all, reason/type/repository/subject/updated,
  fuzzy search, open target, mark one read, mark selected read.
- Schema-driven column definitions for list/resource Surfaces.
- Column visibility, sorting, grouping, and value filters with per-Surface persistence.
- User keybinding overrides keyed by stable command id.
- Conflict, prefix ambiguity, invalid key, unreachable command, and reserved-key
  diagnostics.
- A reset-to-default action for one Surface or all app settings.

**Modify**

- `src/workspaceSurfaces.ts`
- `src/workspace/surfaceRegistry.ts` (proposed)
- `src/configStore.ts` (proposed)
- `src/commands/builtins.ts`
- `src/keymap/all.ts`
- `packages/keymap/src/`
- `src/ui/WorkspaceTabs.tsx`
- resource/list renderers and filter atoms
- `src/services/GitHubService.ts`
- `src/services/MockGitHubService.ts`
- `src/services/CacheService.ts`

**Test**

- Notification pagination, unread/all, unknown subject types, inaccessible/deleted
  targets, and mark-read rollback.
- Column settings survive restart and ignore removed/renamed columns safely.
- Group/sort/filter compose deterministically and preserve selected item identity.
- Config migration from every currently supported unversioned shape.
- Keybinding overrides work in scoped contexts; collisions are reported before
  dispatch; reset restores defaults.
- No custom binding can bypass disabled reasons or confirmation flows.

**Validate live**

- Use a dedicated test account or generated test notification; do not mark the user's
  ordinary notifications as read.
- Save a grouped/filtered view, restart, and verify it restores.
- Remap one command, verify the old key no longer dispatches it in that scope, inspect
  it in the command palette, then reset.

**Done when**

- View and keybinding configuration is versioned, recoverable, and diagnosable without
  hand-editing the file after a bad value.

### Milestone 7 — CLI operations and parity closeout

**Build**

- Extend `src/standalone.ts` and packaged CLI help with:
  - `ghui doctor [--json]`
  - `ghui cache list`
  - `ghui cache clean [--dry-run]`
  - `ghui open <issue|pr|run|job|milestone|release|environment> <id>`
  - `ghui repos`
- `doctor` checks `gh`, authentication, current/repository context, config parsing,
  cache migrations/size, writable config/cache directories, terminal capability, and
  optional runner/environment permissions.
- Add a generated parity report from `test/parity/manifest.ts`.
- Update README, help, screenshots, and every relevant plan Status.
- Add a changeset and run the full release pipeline.

**Test**

- CLI parsing, help, suggestions, JSON stability, exit codes, and no-TTY behavior.
- `doctor` healthy/degraded/failing fixtures.
- Cache dry-run versus apply, corrupt database, locked database, and path safety.
- `open` entity mapping and invalid ids.
- Package smoke and standalone build for supported targets.

**Validate live**

- Run every manifest live scenario against a disposable repository and dedicated test
  account.
- Install the built standalone artifact in a temporary prefix and rerun the smoke
  matrix outside the source tree.
- Run `ghui doctor`, source-link `ghui --version`, packaged `ghui --version`, and one
  live read-only launch from another repository.

**Done when**

- The generated parity report contains only `complete` or approved `excluded` entries.
- Source, mock, packaged binary, and live GitHub results agree.

## Validation strategy

### Per-commit fast gate

```bash
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run test:keymap
```

Expected signal: zero failures and no new warnings from the changed capability.

### Per-milestone integration gate

```bash
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run test:keymap
bun run package:smoke
bun run build:standalone
```

Also run the proposed parity harness for the milestone's manifest entries at all
supported terminal sizes.

### Contract-test requirements

Every `GitHubService` method requires:

- success;
- pagination or bounded limit;
- empty;
- malformed response;
- non-zero `gh` exit;
- timeout;
- authentication/permission failure;
- primary and secondary rate limit;
- telemetry redaction;
- exact native command or API endpoint/method/body.

### UI interaction requirements

Every new Surface/modal requires:

- keyboard route;
- command-palette route;
- mouse selection/activation where equivalent existing UI supports it;
- loading, cached-refresh, empty, error, retry, and permission states;
- selection identity preserved across refresh/filter/sort/group;
- `60x16` minimum and wide two-pane rendering;
- modal border junctions following `AGENTS.md`;
- destructive action confirmation and disabled-reason coverage.

### Live acceptance repository

Use an explicitly configured disposable repository, for example via a future
`GHUI_PARITY_TEST_REPO=owner/repo` variable. The harness must refuse destructive live
tests unless:

- the repository matches the configured exact owner/name;
- the authenticated user has admin permission;
- the repository carries a dedicated parity-test marker;
- the command is running in explicit apply mode;
- cleanup targets are prefixed and recorded by the harness.

Fixtures should create:

- open/closed Issues and a milestone;
- a PR with multiple text files, rename, binary file, and large diff;
- labels, assignees, and reviewer candidates;
- passing, failing, cancelled, and dispatchable workflows;
- an artifact;
- a protected default branch and disposable feature branches;
- a GitHub environment and deployment;
- a test release.

Cleanup must be idempotent and produce a final resource inventory. Runner and
notification validation may use a dedicated test account/repository because those
resources are not safely synthesized in every repository.

## Acceptance criteria

Parity is complete only when:

- all in-scope manifest entries are `complete`;
- no excluded entry is merely an unimplemented GitHub-supported feature;
- every service method has contract tests and a mock implementation;
- every mutation has confirmation where destructive, optimistic rollback, and live
  acceptance evidence;
- cached and fresh state converge after every tested mutation;
- all Surfaces remain usable at `60x16` and in wide mode;
- configuration migration preserves current users' themes, editor command, repository
  paths, whitespace mode, system-theme settings, and scrollbar preference;
- `ghui`'s existing PR/Issue queues, comments, diffs, cache, editor handoff, themes,
  mouse interactions, and package smoke remain green;
- the installed standalone binary, not just source execution, passes the final smoke;
- README/help and plan statuses describe the shipped behavior accurately.

## Risks and mitigations

### Surface explosion

Seven new Surfaces can recreate a monolithic App shell. Land the registry first,
keep state in Surface-owned atoms/hooks, and do not thread resource-specific props
through `useAppShell`.

### Monolithic service growth

Keep one public Effect service but compose private capability modules. Require narrow
schemas and tests per module.

### GitHub CLI/API drift

Pin exact command contracts in tests, decode with schemas, prefer native commands, and
show capability errors instead of silently dropping fields.

### Rate-limit pressure

Keep lazy Surface loading, use bounded pagination, cache stable data, suspend hidden
refreshes, and reuse existing rate-limit classification.

### Cache migration/data loss

Use additive migrations, retain backward decoders during one release cycle, never
cache secrets/logs/artifact bodies, and test old/corrupt databases.

### Mutation safety

Centralize mutations in commands, require confirmation at the command boundary,
constrain live tests to an exact disposable repository, and make cleanup idempotent.

### False confidence from the reference test suite

Treat `glab-tui` source behavior as inventory only. The new manifest, command
contracts, interaction assertions, and live acceptance repository are the proof.

### Long-running parity branch

Do not build this as one branch. Each milestone is independently releasable, keeps the
manifest accurate, adds a changeset for user-visible work, and leaves incomplete
Surfaces out of the registry.

## Rollback

- Surface registration is the exposure boundary. An incomplete or regressing Surface
  can be removed from the registry without deleting its code or data.
- Cache migrations are additive; older binaries ignore new tables. Do not drop or
  rename existing tables during this program.
- Config parsing accepts old and new shapes; if a new section is invalid, fall back
  only that section.
- Each mutation slice lands separately and can be reverted without reverting its
  read-only Surface.
- Release rollback follows the existing Homebrew/npm process; verify the previous
  packaged binary still opens the same cache/config before each release.

## Open questions

No product decision blocks the first four milestones. Re-evaluate these only when
their milestone starts:

1. Whether the secondary Surface picker should be a compact tab overflow menu or a
   command-palette-filtered "Go to Surface" modal. Default: a compact picker backed by
   the same Surface registry and commands.
2. Whether job-level cancel is exposed by the minimum supported `gh` version at
   implementation time. Default: use native `gh` if available, otherwise the raw API
   with explicit capability tests.
3. Whether repository runner details are useful enough without management mutations.
   Default: ship read/details because that matches the reference GitHub backend;
   revisit runner removal/label management as a separate GitHub-native enhancement.
4. Which resource lists benefit from SQLite persistence after live use. Default:
   cache stable summaries, use short TTLs for notifications/runners, and do not cache
   logs or workflow inputs.
