# Implementation notes

## Milestone 0 — complete 2026-07-29

Delivered:

- `test/parity/manifest.ts` inventories 26 in-scope capabilities and six explicit
  exclusions, assigns all 35 accepted automated facts to verification owners, and
  rejects duplicate ids, missing milestone owners/scenarios, unreasoned exclusions,
  and missing registered capabilities.
- `bun run parity:report` emits the current ledger; CI now runs it.
- `test/fixtures/github/` contains synthetic paginated, detail, empty, malformed,
  permission, rate-limit, log, workflow-input, and mutation fixtures.
- `test/support/fakeGh.ts` captures raw command evidence for exact assertions while
  producing redacted snapshots. It supports ordered responses, pagination, non-zero
  exits, timeouts, malformed JSON, and interruption.
- `test/e2e/parityHarness.tsx` wraps the existing OpenTUI test renderer rather than
  introducing a second renderer. It handles key sequences, text, paste, mouse,
  scrolling, resize, frame capture, and named effect assertions at `60x16`, `99x24`,
  `100x24`, and `160x40`.
- `test/support/liveParity.ts` prevents live mutations unless repository, identity,
  marker, permission, apply mode, and approval checks pass, and records prefixed
  fixtures plus cleanup residue.
- `dev/package-smoke.ts` now creates isolated npm/Bun projects, passes explicit
  install roots, and uses a per-run Bun cache. This fixes local-tarball state leaking
  across smoke runs in embedded desktop runtimes.

Interpretations:

- Raw fake-`gh` invocations remain available in memory for exact command-contract
  assertions. Serializable snapshots redact sensitive arguments, stdin, environment
  values, stdout, and stderr.
- Non-networked program/config capabilities do not require live scenario ids.
- Milestone 0 adds no user-visible product behavior, so no changeset is required.

Validation:

```text
bun run format:check       pass
bun run typecheck          pass
bun run lint               pass
bun run test               pass — 558 tests
bun run test:keymap        pass — 131 tests
bun run parity:report      pass — no manifest problems
bun run package:smoke      pass — npm and Bun installed tarballs
bun run build:standalone   pass — linux-x64
```

## Milestone 1 — complete 2026-07-29

Delivered:

- `src/workspace/surfaceRegistry.ts` is the scope-aware source of truth for stable
  Surface ids, labels, availability, refresh commands, filtering, badges, and
  full-screen behavior. Repository workspaces now expose Releases while the user
  workspace hides them with an explicit unavailable reason.
- Workspace tabs derive from the registry and retain access to every registered
  Surface at narrow widths through a compact overflow control. Numeric navigation,
  commands, refresh, filtering, badges, and loading state use the same descriptors.
- `src/configStore.ts` migrates existing unversioned configuration per field,
  preserves unknown root and nested keys, validates typed Surface views and
  command-id keybindings, serializes concurrent updates, and writes with a
  same-directory temporary file plus atomic rename. `src/themeStore.ts` remains a
  compatibility wrapper.
- Private GitHub implementation is split behind the unchanged public
  `GitHubService` Context. Shared command/error helpers live under
  `src/services/github/`; item loading and Releases use focused modules.
- Releases support bounded list/detail loading and create/edit/delete through native
  `gh release` commands. Notes are sent through stdin, draft and pre-release flags
  are explicit, and deleting a release deliberately preserves its Git tag.
- The deterministic mock, additive SQLite migration, cache snapshot lifecycle,
  repository Surface, wide and narrow details layouts, create/edit form, delete
  confirmation, commands, palette routes, footer hints, keyboard routes, paste,
  and mouse selection all cover Releases.
- The parity ledger marks all four Milestone 1 capabilities complete, and the
  registered-Surface validation now includes Releases.

Validation:

```text
test/configStore.test.ts                 pass
test/githubReleases.test.ts              pass
test/cacheService.test.ts                pass
test/workspaceSurfaceRegistry.test.ts    pass
test/releasesSurface.test.tsx            pass — keyboard, palette, paste, mouse, 60x16
bun run format:check                     pass
bun run typecheck                        pass
bun run lint                             pass
bun run test                             pass — 574 tests
bun run test:keymap                      pass — 131 tests
bun run parity:report                    pass — M1 4/4 complete
bun run package:smoke                    pass — npm and Bun installed tarballs
bun run build:standalone                 pass — linux-x64
bun run changeset:status                 pass — patch bump
```

Live validation:

- The destructive create/edit/delete scenario is defined as `live.releases` but was
  not run during implementation. It remains guarded by the exact disposable
  repository, identity, marker, permission, apply-mode, and explicit-approval
  checks in `test/support/liveParity.ts`.

## Milestone 2 — complete 2026-07-29

Delivered:

- Issues now support native `gh issue` create, full edit, close, reopen, and
  confirmed delete flows. Pull Requests support native create, full edit, close,
  reopen, draft transitions, approval, and the existing guarded merge flow.
  Private bodies are passed through stdin.
- A shared item editor and searchable metadata selector cover labels, assignees,
  reviewers, milestones, and base branches. Selector resources are paginated,
  schema-validated, permission-aware, and backed by deterministic mutable mocks.
- Multi-selection is available on Issue and Pull Request lists through Space and
  Ctrl-click, with persistent row markers and footer counts. Bulk status, label,
  assignee, and milestone changes run at concurrency three, retain input order,
  distinguish succeeded/failed/skipped/retryable results, allow cancellation, and
  preserve only failed retryable targets for retry.
- Destructive bulk close requires a second Enter at the modal boundary. Existing
  optimistic item helpers restore failed Pull Request mutations, Issue mutations
  restore their prior override, and authoritative refreshes converge stale
  optimistic state.
- The parity ledger marks all four Milestone 2 capabilities complete and the
  user-facing changes are recorded in `.changeset/brave-items-batch.md`.

Validation:

```text
test/githubItemsManagement.test.ts       pass — exact argv/stdin, paging, empty, malformed, permission, mock convergence
test/itemMutations.test.ts               pass — optimistic patch and rollback
test/bulkItems.test.ts                   pass — bounded concurrency, stable order, partial failure, skip, retry, cancellation
test/itemManagementSurface.test.tsx      pass — create/edit/selectors/delete
test/bulkItemSurface.test.tsx            pass — keyboard, Ctrl-click, results, destructive confirmation
bun run format:check                     pass
bun run typecheck                        pass
bun run lint                             pass
bun run test                             pass — 589 tests
bun run test:keymap                      pass — 131 tests
bun run parity:report                    pass — M2 4/4 complete
bun run package:smoke                    pass — npm and Bun installed tarballs
bun run build:standalone                 pass — linux-x64
bun run changeset:status                 pass — patch bump
```

Live validation:

- The destructive Issue, Pull Request, and three-item bulk scenarios remain
  unexecuted because explicit live apply approval was not supplied. The guarded
  scenarios require the disposable repository, dedicated identity, marker,
  permissions, apply mode, and explicit approval before they may mutate GitHub.
## M3 — Pending reviews, suggestions, and large diffs

- Added exact `gh api` contracts for finding, creating, adding to, submitting, and discarding the authenticated viewer's server-backed pending review. JSON bodies travel over stdin so review text and suggestions are not exposed in argv.
- Added deterministic mock pending-review convergence and unit coverage for pagination, hydration, resume, submit, and discard.
- Diff comment authoring now toggles post/queue and comment/suggestion modes. Suggestion serialization covers single-line, multiline, CRLF, empty replacement, invalid deleted-side targets, and nested-fence rejection.
- Added pending count and distinct queued-anchor coloring, a `review.pending` pane with navigation/edit/delete/submit/two-step discard controls, plus stable `review.submit` and `review.discard` command ids.
- The existing submit-review modal reports the queued count and atomically submits the server pending review when present; successful submission clears only the matching revision cache.
- Added exact-height file virtualization with a one-viewport halo and selected-file pinning. Tree-sitter syntax styling and OpenTUI word-change content colors remain active in split and unified renderers.
- Added `benchmark:diff` (500 files) and `test:diff-highlighter-lifecycle` gates. Updated the queued-review and diff-rendering plans with the shipped design.
- Live mutation scenarios remain intentionally unrun until the user explicitly approves them.
## M4 — Actions and artifacts

- Added repository workflow/run, typed workflow-input, artifact, and on-demand job-log domain contracts.
- Added `src/services/github/actions.ts` with native `gh workflow list/view/run`, `gh run list/rerun/cancel/view --job --log`, and `gh run download` mappings; only artifact listing uses the REST API because `gh` has no native list command.
- Workflow dispatch values are sorted into JSON on stdin and never placed in argv. The focused workflow YAML parser covers required/default/string/boolean/choice/environment inputs.
- Artifact downloads reject path-like names and occupied destinations, download into a sibling staging directory, atomically rename on success, and remove staging residue on interruption.
- Added deterministic exact-argv, redaction, nullable timestamp, retry/cancel/log, artifact traversal, occupied-destination, and interruption cleanup tests.
- Added repository run/workflow atoms plus uncached mutation, log, workflow-input,
  artifact-list, and artifact-download effects.
- Registered the repository Actions Surface using the existing per-PR run model,
  with cache-first repository summaries/details, stable selection across refresh
  and filtering, workflow/status/search filters, run/job/step drill-down, browser
  opening, and bounded keyboard-scrollable large-log windows.
- Added stable palette/keymap commands and guarded modals for retry, cancel,
  schema-driven workflow dispatch, and artifact download. Dispatch values travel
  through redacted stdin; artifact extraction uses a sibling staging directory,
  atomic destination rename, path/name validation, occupied-destination rejection,
  and interruption cleanup.
- Added bounded focus-aware refresh only while the Actions Surface is visible and
  a queued or in-progress run is present.
- Added additive cache migration `007_actions_runs`; only run summaries and
  job/step details are stored. Job logs, artifact bytes, and workflow input values
  remain ephemeral, and mutation success invalidates authoritative snapshots.
- Deterministic coverage now includes paginated artifacts, bounded native limits,
  rerun attempts, matrix jobs, absent timestamps, cancelled/skipped rows, large
  logs, permission and timeout errors, corrupt cache rows, modal validation, and
  keyboard interaction flows.
- Live dispatch, cancel, rerun, log, and artifact-download scenarios remain
  intentionally unrun until the user explicitly approves externally visible
  fixture mutations.

## M5 — Repository resources

- Added Branches, Milestones, Environments/Deployments, and Runners as
  repository-scoped Surfaces with stable registry entries, palette commands,
  keyboard navigation, mouse selection, narrow layouts, and wide list/detail
  layouts.
- Added focused GitHub capability modules for branch refs, milestones and nested
  issues, paginated deployment hydration, and repository runners. Native `gh`
  commands are used where available; raw API writes use JSON stdin and branch
  deletion percent-encodes the ref.
- Branch creation validates Git refs. Deletion is confirmed and guarded for the
  default, protected, and currently selected branches.
- Milestones support create, edit, close/reopen, confirmed delete, due dates,
  progress calculation, and nested Issue details.
- Environments and deployments are deliberately read-only and support browser
  opening. Runners expose online/offline, busy/idle, OS, and custom/read-only
  labels without registering mutation commands.
- Added deterministic mutable mock behavior, generic additive resource snapshots
  in cache migration `008_repository_resources`, corrupt-row recovery, and
  invalidation after mutations.
- Extracted shared resource list/detail/load-state behavior only after the
  Releases and Branches shapes were proven; Pull Requests, Issues, and Actions
  remain outside the abstraction.
- Added exact command/API contracts, guard/progress tests, cache reopen and
  corruption tests, registry/command tests, and interaction coverage for
  create/edit/state/delete flows at `60x16`, `99x24`, `100x24`, and `160x40`.
- Live branch, milestone, deployment, and runner scenarios remain intentionally
  unrun until the user explicitly approves externally visible fixture mutations.

## M6 — Notifications, saved views, and keybindings

- Added a user-scoped Notifications Surface with unread/all and subject-type
  filters, text search, stable visible selection, multi-selection, keyboard and
  mouse routes, safe target opening, and optimistic one-or-many mark-read with
  per-thread rollback.
- Added exact paginated `gh api notifications` and thread mark-read contracts,
  malformed/permission/deleted-target handling, deterministic mutable mock
  state, and short-lived cache summaries. Cached JSON deliberately omits private
  notification subjects.
- Added schema-driven columns for every registered Surface and versioned
  per-Surface persistence for visible columns, grouping, sort, and value
  filters. Saved views are normalized against renamed or removed columns,
  compose deterministically, update mounted Surfaces at runtime, and preserve
  selected identities while ordering changes.
- The `view.configure` route cycles durable default, compact, grouped, and
  filtered presets; one-Surface and all-settings reset commands recover bad
  values without requiring direct config edits.
- Added runtime command-id key overrides for scoped list, detail, diff, run,
  action, notification, and resource routes. Invalid, reserved, conflicting,
  prefix-ambiguous, and unknown entries are diagnosed before dispatch; invalid
  overrides retain safe defaults, old keys are removed for valid remaps, and
  the command palette displays the active configured shortcut.
- Added focused service, cache privacy, config migration/subscription/reset,
  saved-view composition, keybinding diagnostic/dispatch, responsive render,
  and interaction coverage. Live notification receipt and mark-read remain
  intentionally unrun until the user explicitly approves the dedicated live
  identity and fixture workflow.

## M7 — CLI operations and local parity closeout

- Refactored standalone startup around an injectable CLI parser and added
  `doctor`, `cache list`, dry-run-by-default `cache clean`, typed `open`, and
  `repos` commands with stable text/JSON output, typo guidance, validation, and
  explicit no-TTY behavior.
- Added production diagnostics for GitHub CLI/version/auth/repository context,
  configuration parsing, writable paths, SQLite health/locking/corruption,
  terminal capabilities, and optional runner/environment permissions.
- Cache cleanup targets only the configured database and exact WAL/SHM
  sidecars, refuses symlinks and directories, previews by default, and is
  idempotent.
- Added exact open mappings, bounded repository listing, healthy/degraded/failing
  doctor fixtures, corrupt/missing/unsafe cache cases, and CLI exit-code tests.
- Expanded standalone and installed npm/Bun package smoke tests to exercise the
  operational commands outside the source checkout with a deterministic fake
  `gh`.
- Updated package metadata, README/help, plan status, and the parity ledger.
  Seven program-only capabilities are `complete`; the 19 GitHub-backed
  capabilities awaiting guarded live acceptance remain honestly `partial`; the
  six GitHub-specific exclusions remain documented.
- Guarded live mutations, public npm publication, and Homebrew update/install
  proof remain intentionally unrun pending their separate explicit approvals.
- Added `bun run parity:live`, an executable fail-closed acceptance runner that
  accounts for all 19 live capability ids. Its preflight verifies the exact
  repository, dedicated authenticated identity, `ghui-parity-test` topic,
  permission, apply mode, and current approval before any scenario can run.
  Read acceptance uses the production `GitHubService` and CLI implementations,
  emits redacted count/identity evidence, writes owner-only JSON, and reports
  mutation prerequisites as blocked rather than claiming them complete.
- The live harness now has an interruption-safe fixture executor: setup and
  verification stop at the first failure, every successfully created fixture
  is still cleaned in reverse order, cleanup failures remain visible as
  residue, and checkpoint callbacks can persist each transition.
- The guarded apply slice now creates uniquely prefixed labels, three Issues,
  a Milestone, draft Release, branch, changed file, and draft Pull Request. It
  exercises Issue edit/close/reopen, bounded bulk labels, Milestone
  close/reopen and nested Issues, Release edit, Pull Request edit/draft
  transitions/close/reopen, diff hydration, and an atomic pending review with
  a suggestion. Setup failures reconcile discoverable partial fixtures before
  cleanup; normal and failed runs clean in reverse order and retain only the
  necessarily closed Pull Request with an explicit ledger reason.
- The apply slice also commits a prefixed `workflow_dispatch` workflow to the
  disposable default branch, validates string/choice/boolean/environment
  inputs, cancels its delayed run, reruns it to success, inspects jobs and
  logs, downloads and verifies an artifact, hydrates the generated environment
  and deployment, and uses `github-actions[bot]` to mention the dedicated
  identity in one controlled Issue. Only the resulting matching notification
  is marked read. The runner then deletes the bot Issue, run/artifact,
  environment/deployment, and workflow file and checkpoints owner-only JSON
  after every fixture transition so interruption residue is recoverable.
- Added `test/parity/scenarios.ts`, binding all 26 in-scope capabilities and
  every unit/render/interaction/live scenario id to concrete existing test
  files. The parity report and manifest tests now fail on unowned ids, drift,
  orphaned evidence, or missing files instead of accepting placeholder strings.
