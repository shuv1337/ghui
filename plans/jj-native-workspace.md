# JJ-Native Local Change Workspace

## Status

In progress — Milestones 0–3 landed. Remote merge safety and Milestones 4+
are not started.

## Why

ghui is already a broad, remote-first GitHub workspace. Pull Requests, Issues,
reviews, comments, diffs, checks, Actions, releases, notifications, milestones,
branches, environments, deployments, and runners are loaded and mutated through
the authenticated `gh` CLI with explicit repository arguments or GitHub API
endpoints.

The app is not currently a local Git client. Its only direct local Git behavior
is startup repository detection in `src/gitRemotes.ts`, which runs `git remote`
and `git remote get-url`. That works in ordinary Git and colocated Jujutsu
workspaces, but it fails in non-colocated JJ workspaces and does not model the
local working-copy change, stacks, bookmarks, conflicts, workspaces, or
operation history.

JJ users therefore have a strong GitHub workspace but no native connection
between:

- a stable JJ change ID and its rewritten Git commit IDs;
- a local change or stack and the bookmark used to publish it;
- a push remote and the repository hosting review;
- a PR head SHA and the matching local change;
- requested review changes and the local change that should be updated;
- JJ workspaces and ghui's editor handoff.

The goal is to add that connection without weakening ghui's complete
GitHub-only mode or pretending that JJ bookmarks are Git branches.

## Product Decision

ghui remains GitHub-first and gains an optional JJ-native local change plane.
The product has three connected planes:

| Plane | Source of truth | Owns |
|---|---|---|
| GitHub | `GitHubService` / `gh` | PRs, reviews, comments, checks, Issues, Actions, releases, remote branches, and merge state |
| Local JJ | proposed `ChangeWorkspace` | changes, commit IDs, bookmarks, stacks, conflicts, workspaces, revsets, and operation history |
| Synchronization | proposed relationship and planning implementation inside `ChangeWorkspace` | change-to-PR relationships, remote roles, fetch/push plans, publication, divergence, and stale-plan detection |

GitHub-only operation remains a complete supported mode. Missing JJ state may
disable local commands and hide local-only Surfaces, but it must never disable
existing GitHub browsing or mutations.

## User-Visible End State

- ghui detects colocated and non-colocated JJ workspaces as well as ordinary Git
  repositories.
- Repository context distinguishes the review host, push remote, and trunk
  revision instead of treating the first `origin` URL as all three.
- A repository-scoped `CHANGES` Surface appears when a local JJ workspace is
  connected.
- The existing `BRANCHES` Surface continues to represent GitHub remote refs. In
  JJ-connected mode its label becomes `REMOTE BRANCHES` to prevent bookmark
  confusion.
- PR rows and details can show an honest local relationship: exact, local ahead,
  remote ahead, diverged, conflicted, needs fetch, or not present locally.
- A selected local change can be published and used to create a PR through an
  explicit, previewable synchronization plan.
- A rewritten change can update its existing PR without losing the durable JJ
  change identity.
- A remote PR can be opened in a dedicated JJ workspace without moving the
  user's current working-copy change.
- Stack operations state the exact bounded range and every affected bookmark or
  PR before mutation.
- GitHub review, comment, diff, checks, Actions, merge, and repository-resource
  workflows continue to work without a local repository.

## Core Vocabulary and Invariants

### Change

A JJ change is the primary local unit of authoring. It has a stable change ID
and a current Git commit ID. Rewriting preserves the change ID and changes the
commit ID.

### Bookmark

A bookmark is a local label and publication vehicle. It is not a current branch
and need not exist before a change is ready to publish.

### Remote branch

A remote branch is a GitHub `refs/heads/*` resource. Existing `BranchItem`,
`RepositoryBranch`, and GitHub branch commands retain this meaning.

### Pull Request

A Pull Request is a GitHub collaboration object whose head is identified by a
remote branch and Git commit SHA. It may or may not have a local JJ relationship.

### Stack

A stack is an ordered local JJ graph bounded by an explicit trunk revision or
base. PRs are projections of selected stack tips onto GitHub, not the canonical
representation of local ancestry.

### Sync plan

A sync plan is an immutable preview of local and remote mutations computed from
fresh observations. Execution must fail closed if the observed remote or JJ
operation changes before execution.

### Safety invariants

1. Browsing or mutating GitHub resources never requires JJ.
2. No refresh, navigation, editor open, or focus event implicitly fetches,
   rebases, moves a bookmark, pushes, or changes a workspace.
3. Change IDs and commit IDs remain distinct in domain types and UI copy.
4. `PullRequestItem.headRefOid` remains the GitHub head Git SHA because it keys
   caches, comments, pending reviews, diffs, and Actions runs.
5. `BranchItem` remains a GitHub remote branch and is never widened into a
   branch-or-bookmark union.
6. A non-fast-forward remote update is identified explicitly in the preview.
7. Fetch and remote refresh occur before planning a push. A changed remote tip
   invalidates the plan.
8. Stack mutations list the exact selected range and affected descendants.
9. Conflicted, private, immutable, empty, or divergent changes receive explicit
   capability reasons; commands do not silently override JJ policy.
10. GitHub merge and local cleanup are separate operations. A successful remote
    merge is never reported as failed merely because local cleanup failed.
11. Review threads are never automatically resolved or dismissed after a
    rewrite.
12. User-supplied revsets are out of scope until the parser, validation, and UX
    contract are designed. Initial commands use bounded presets.

## Current Architecture and Constraints

### GitHub operations are already isolated

- `src/services/GitHubService.ts` is the public Effect service for GitHub.
- `src/services/github/client.ts` provides schema-decoded `gh` command helpers.
- Capability implementations under `src/services/github/` use explicit
  repositories or API endpoints.
- `src/services/CommandRunner.ts` is the injectable process seam with timeout,
  cancellation, schema decoding, errors, and telemetry.
- `src/services/MockGitHubService.ts` and `test/support/fakeGh.ts` provide
  deterministic GitHub tests.

This plan does not replace, wrap, or generalize `GitHubService` into a provider
abstraction.

### Repository detection is local-Git-specific

- `src/gitRemotes.ts` synchronously shells out during module initialization.
- `src/services/runtime.ts` computes `detectedRepository` at import time.
- `src/cliDependencies.ts` separately asks unscoped `gh repo view` for doctor.
- `ghui open` can also depend on cwd inference when `--repo` is omitted.

These paths can disagree and are not covered by the normal `CommandRunner`
test seam.

### Remote roles are currently conflated

The current remote preference is `origin`, then `upstream`, then any other
GitHub remote. Fork workflows need separate roles:

- review repository, often the upstream GitHub repository;
- push remote, often the user's fork;
- trunk revision, often `main@upstream`;
- current workspace's GitHub scope, which may be either fork or upstream.

Browse scope stays origin-first when `--repo` is omitted, even if origin is a
fork and upstream is the parent. Role fields and diagnostics may record the
fork/upstream split, but they must not change which GitHub repository the TUI
opens. Automatic role inference remains conservative for mutation: ambiguous
repositories ask for or require configuration rather than guessing before a
push, PR create, or remote delete.

### The Branches Surface is remote-only

- `src/domain.ts` defines `BranchItem` with GitHub protection and default-branch
  state.
- `src/services/github/branches.ts` lists and mutates GitHub refs through REST.
- The existing deletion helper accepts a current branch name, but production
  currently supplies `null`; ghui has no local current-branch model.

JJ integration adds separate types instead of modifying these remote-resource
types.

### Editor handoff is an existing local seam

- `src/editorCommand.ts` resolves one configured path per repository and expands
  GitHub PR fields.
- `src/services/EditorOpener.ts` suspends the TUI and launches a user-configured
  shell command.
- The README currently presents `gh pr checkout` recipes that assume Git branch
  checkout semantics.

The first JJ handoff should be structured and safety-aware. Existing arbitrary
shell templates remain available but are not silently rewritten.

### Merge currently combines remote and local intent

`src/mergeActions.ts` appends `--delete-branch` to `gh pr merge`. The GitHub merge
can succeed before `gh` attempts local Git cleanup, producing a partial-success
failure in JJ or unusual Git workspaces. Remote merge, remote ref deletion, and
optional local cleanup must become separately observable steps.

## Proposed Architecture

### Repository context discovery

Introduce a small repository-context module that discovers local capabilities
and remote roles without importing GitHub resource behavior.

Proposed path: `src/services/RepositoryContext.ts`.

Proposed interface:

```ts
interface RepositoryContextSnapshot {
	readonly localKind: "jj" | "git" | "none"
	readonly workspaceRoot: string | null
	readonly storeRoot: string | null
	readonly githubRepository: string | null
	readonly reviewRepository: string | null
	readonly pushRemote: LocalRemote | null
	readonly trunkRevision: string | null
	readonly remotes: readonly LocalRemote[]
	readonly diagnostics: readonly RepositoryContextDiagnostic[]
}
```

Discovery precedence:

1. Explicit `--repo owner/name` remains authoritative for GitHub scope.
2. Probe `jj root`, `jj workspace root`, `jj git root`, and
   `jj git remote list` through an injectable runner.
3. If no JJ workspace is present, probe ordinary Git remotes.
4. Use GitHub fork metadata and JJ repository configuration only as evidence for
   remote roles; never mutate based on an ambiguous role.
5. Fall back to user scope when no repository is detected, preserving current
   startup behavior.

Startup should eventually load this context through Effect instead of executing
synchronous subprocesses at module import. A transitional synchronous adapter
is acceptable only within the first detection slice if moving startup state
would otherwise enlarge that milestone materially.

### ChangeWorkspace deep module

Proposed path: `src/services/ChangeWorkspace.ts`.

`ChangeWorkspace` is the only public module that shells out to `jj`. Its external
interface stays small while its implementation owns CLI templates, graph
normalization, remote relations, planning, concurrency checks, and error
classification.

```ts
interface ChangeWorkspace {
	readonly snapshot: (scope?: ChangeWorkspaceScope) => Effect.Effect<WorkspaceSnapshot, ChangeWorkspaceError>
	readonly relateToGitHub: (input: RelateToGitHubInput) => Effect.Effect<LocalRemoteRelation, ChangeWorkspaceError>
	readonly plan: (intent: LocalIntent) => Effect.Effect<ChangePlan, ChangeWorkspaceError>
	readonly execute: (plan: ChangePlan) => Effect.Effect<LocalResult, ChangeWorkspaceError>
}

type ChangePlan = WorkspaceHandoffPlan | SyncPlan
```

`plan` and `execute` are introduced incrementally rather than reserved for
remote publication. Milestone 3 implements guarded local workspace handoff
intents; Milestone 4 extends the same interface with fetch-backed publication
intents. `EditorOpener` receives only an already-resolved workspace path and
editor command. It never shells out to `jj` itself.

Proposed private implementation modules, introduced only when their milestone
needs them:

- `src/services/jj/snapshot.ts`
- `src/services/jj/relations.ts`
- `src/services/jj/plans.ts`
- `src/services/jj/commands.ts`
- `src/services/jj/templates.ts`

Do not create all private files in the first milestone. Start with one concrete
implementation and extract only after snapshot and relation behavior prove
separate responsibilities.

### Machine-readable JJ output

Use explicit JJ templates and parse only output owned by those templates. Do not
parse default human log rendering, localized prose, graph glyphs, or color.

The adapter must:

- pass `--no-pager` and `--color=never`;
- use full IDs for domain identity and shortest unique IDs only for display;
- version and contract-test every template;
- record the minimum supported JJ version in doctor and package documentation;
- classify unsupported template fields as a capability error;
- avoid accepting arbitrary revset text from GitHub or cached data.

JSON serialization is available in JJ templates, but JJ documents that
serialized fields may evolve. Schema decoding and exact-version contract tests
are still required.

### Proposed local domain types

Proposed path: `src/localDomain.ts`, keeping local VCS concepts out of the
already broad GitHub-oriented `src/domain.ts`.

```ts
interface JjChangeSummary {
	readonly changeId: string
	readonly commitId: string
	readonly description: string
	readonly empty: boolean
	readonly conflicted: boolean
	readonly mutable: boolean
	readonly parentChangeIds: readonly string[]
	readonly bookmarks: readonly string[]
	readonly remoteBookmarks: readonly string[]
}

interface WorkspaceSnapshot {
	readonly operationId: string
	readonly workspaceName: string
	readonly workspaceRoot: string
	readonly workingCopy: JjChangeSummary
	readonly stack: readonly JjChangeSummary[]
	readonly workspaces: readonly JjWorkspaceSummary[]
	readonly trunkRevision: string
}

type LocalRemoteRelation =
	| { readonly status: "exact"; readonly changeId: string; readonly commitId: string }
	| { readonly status: "local-ahead"; readonly changeId: string; readonly remoteCommitId: string }
	| { readonly status: "remote-ahead"; readonly changeId: string; readonly remoteCommitId: string }
	| { readonly status: "diverged"; readonly changeId: string; readonly remoteCommitId: string }
	| { readonly status: "conflicted"; readonly changeId: string }
	| { readonly status: "needs-fetch"; readonly headCommitId: string }
	| { readonly status: "unmapped"; readonly headCommitId: string }
	| { readonly status: "ambiguous"; readonly candidates: readonly string[] }
```

The exact type names may change during implementation, but the distinction
between change ID, commit ID, bookmark, remote bookmark, remote branch, and PR
is mandatory.

### Relationship persistence

Exact SHA matches can infer an observed relationship without persistence.
Updating a rewritten change requires remembering the durable change ID after
the local commit ID no longer matches the current PR head.

Add persistence only with publication or explicit linking, not during passive
browsing. A proposed SQLite table should key by:

- local store identity;
- GitHub repository;
- PR number;
- JJ change ID;
- bookmark and remote name;
- last observed local commit ID;
- last observed GitHub head SHA;
- observation timestamp.

Proposed implementation location: additive migration and methods in
`src/services/CacheService.ts`, unless a dedicated relationship store is proven
necessary. The table stores identifiers and relationship metadata only, not
patches, descriptions, review bodies, or credentials.

### ChangePlan and SyncPlan

`ChangePlan` is the guarded execution envelope. Milestone 3 first implements a
`WorkspaceHandoffPlan` containing the source operation, target revision,
workspace name, destination path, and collision observations. Milestone 4 adds
the remote-mutation `SyncPlan` variant.

Proposed `SyncPlan` contains:

- source operation ID;
- source change IDs and commit IDs;
- selected bounded stack range;
- expected remote bookmark or branch tip;
- bookmark creation or movement;
- selected push remote;
- GitHub review repository and base branch;
- whether the remote update is non-fast-forward;
- PR creation or update intent;
- affected dependent PRs;
- warnings and disabled reasons.

`execute(plan)` re-reads the JJ operation ID and remote state. Any mismatch
returns a stale-plan result and performs no mutation.

### Surface and command integration

Extend the existing data-driven model rather than threading local props through
`useAppShell`.

Modify when the relevant milestone begins:

- `src/workspace/surfaceRegistry.ts`
- `src/workspace/atoms.ts`
- `src/workspace/derivations.ts`
- `src/surfaces/WorkspaceContent.tsx`
- `src/surfaces/WorkspaceFooter.tsx`
- `src/ui/WorkspaceTabs.tsx`
- `src/commands/builtins.ts`
- `src/commands/registry.ts`
- `src/keymap/all.ts`
- `src/keymap/listNav.ts`

The Surface registry needs dynamic availability based on local capabilities.
Repository resources remain statically scoped to GitHub repository context;
`changes` additionally requires a connected JJ workspace whose review or push
repository matches the selected GitHub repository. Hide `changes` in ordinary
Git, no-VCS, and mock modes. When visible, it sits immediately after
`pullRequests` in the repository tab row:

`PULL REQUESTS · CHANGES · ISSUES · RELEASES · ACTIONS · REMOTE BRANCHES · …`

Clamp the active Surface if the user switches to a repository where `changes`
is not available. Relabel `branches` to `REMOTE BRANCHES` only while JJ local
state is connected.

Proposed command families:

| Command ID | Capability | Mutation |
|---|---|---|
| `change.refresh` | JJ | none |
| `change.open` | JJ | none |
| `change.open-editor` | JJ | optional workspace creation in later milestone |
| `change.fetch` | JJ + Git transport | remote observation only |
| `change.link-pr` | JJ + GitHub | ghui relationship metadata only |
| `change.detach-pr` | JJ + GitHub | ghui relationship metadata only |
| `workspace.open-existing` | JJ | none |
| `workspace.create` | JJ | guarded local workspace creation |
| `change.publish` | JJ + Git transport | bookmark/ref push |
| `change.create-pr` | JJ + GitHub | push plus GitHub PR creation through preview |
| `change.update-pr` | JJ + GitHub | remote ref update through preview |
| `change.describe` | JJ | local rewrite |
| `change.edit` | JJ | working-copy movement |
| `change.undo` | JJ | local operation undo |
| `stack.rebase` | JJ | bounded local graph rewrite |
| `stack.publish` | JJ + GitHub | bounded remote publication |

Local mutations must route through commands so keymaps, palette, buttons, and
mouse handlers cannot bypass capability checks or previews.

## UI Shape

### Repository header

Connected mode adds compact local state without displacing GitHub scope:

```text
repo kitlangton/ghui · jj default @ nssxvtmr · trunk main@upstream · 2 unpublished · 1 conflict
```

GitHub-only mode remains explicit but quiet:

```text
repo kitlangton/ghui · GitHub only
```

### Changes Surface

The first version is read-only:

```text
@  nssxvtmr  c8487e6b  empty       no description
│  nmkukkkk  1610b786  main        Add comprehensive GitHub feature parity  PR #1
│  ywowmzts  8b35323e              fix: address parity review findings
└  ltszrtuy  9d66e2f5  upstream    chore: release 0.9.0
```

Rows show change ID first, current commit ID second, bookmark annotations,
description, conflict/empty state, and an optional PR relationship. Graph
rendering must degrade cleanly at `60x16` and must not make bookmark presence a
requirement for visibility.

### PR local relationship

PR lists receive only a compact status column or badge when local state is
available. PR detail can show a stack strip and explanation:

```text
local change nmkukkkk matches PR head 1610b786
```

```text
local change nmkukkkk was rewritten
remote head 1610b786 -> local head 74e1c940
```

The GitHub PR remains usable when mapping fails, is ambiguous, or needs fetch.

### Plan preview

Every publication or update presents:

- local changes and range;
- bookmark action;
- push remote;
- old and new remote tips;
- GitHub repository and PR;
- fast-forward or non-fast-forward classification;
- affected descendant changes and PRs;
- blocked reasons and warnings.

The modal follows the repository's divider junction convention by threading
every divider row through `ModalFrame.junctionRows`.

## Ordered Implementation Plan

Each user-facing milestone includes a changeset and updates this plan's Status.
Milestones are independently releasable and must preserve GitHub-only behavior.

### Milestone 0 - Compatibility and context

Merge-branch deletion is not part of this milestone. It is an independent
GitHub-only slice after detection lands; see below. Git users keep current
`gh pr merge --delete-branch` behavior until that slice ships.

**Build**

- Add deterministic tests for current Git remote parsing and ordering before
  changing detection.
- Introduce repository-context discovery with explicit local kind, roots,
  remotes, and diagnostics.
- Detect colocated and non-colocated JJ workspaces using JJ commands before Git
  fallback.
- Preserve explicit `--repo` as authoritative GitHub scope.
- Keep origin-first browse scope when `--repo` is omitted: `origin`, then
  `upstream`, then any other GitHub remote. A fork at `origin` with a parent at
  `upstream` still opens the fork.
- Model review repository, push remote, and trunk revision as separate optional
  roles and diagnostics. Do not change browse scope from those roles.
- When `GHUI_MOCK_PR_COUNT` is set, force `localKind: "none"` and never spawn
  `jj` or `git` for detection.
- Extend `ghui doctor` to report JJ availability/version, workspace mode,
  colocation, ambiguous roles, and unsupported versions.
- Choose the minimum supported JJ version from the oldest version exercised by
  command-contract tests, document it in README requirements, and make package
  smoke verify the documented behavior when JJ is absent or unsupported.
- Make `ghui open` resolve a detected repository through the same context module
  instead of separate cwd inference.

**Modify**

- `src/gitRemotes.ts`
- `src/services/runtime.ts`
- `src/cliDependencies.ts`
- `src/cli.ts`
- `src/services/RepositoryContext.ts` (proposed)
- `README.md`

**Test**

- Add proposed `test/repositoryContext.test.ts`.
- Extend `test/cli.test.ts` for explicit and detected repository precedence.
- Cover ordinary Git, colocated JJ, non-colocated JJ, no VCS, missing executable,
  malformed remote output, detached Git HEAD, multiple remotes, fork/upstream,
  mock mode, ambiguous remotes, and unsupported JJ version.
- Verify fork origin plus upstream parent still browses `origin`.
- Verify mock mode never shells out to `jj` or `git`.
- Verify doctor and README agree on the minimum supported JJ version.

**Done when**

- [x] All existing GitHub Surfaces, including merge, behave identically in all
  environment modes.
- [x] TUI startup, doctor, and `ghui open` agree on repository context.
- [x] Browse scope is unchanged from today's origin-first rule.

**Implementation notes**

- Minimum JJ version is `0.32.0` (`MINIMUM_JJ_VERSION` in
  `src/services/RepositoryContext.ts`). Doctor and README share that constant.
  Missing `jj` is a passing optional check so GitHub-only `ghui doctor` stays
  healthy.
- Detection is a synchronous `discoverRepositoryContext` adapter with an
  injectable runner. Observational `jj` calls use `--no-pager --color=never
  --ignore-working-copy`.
- `GHUI_MOCK_PR_COUNT` forces `localKind: "none"` and never spawns `jj` or
  `git`.
- Live doctor in this checkout reports `shuv1337/ghui` (origin) with a
  colocated JJ workspace and an ambiguous-roles warning for `kitlangton/ghui`
  upstream.

### Independent slice - Remote merge safety (after Milestone 0)

Not a gate for Milestone 1. Ships only after detection is on `main`. This is a
GitHub-only behavior change and needs its own changeset.

**Build**

- Remove `--delete-branch` from every immediate, admin, and auto-merge command.
- Add the PR head repository identity needed to distinguish same-repository and
  fork heads before offering remote deletion (`isCrossRepository` and
  `headRepository.nameWithOwner` on the shared GraphQL summary fragment,
  matching optional cache fields, and `PullRequestItem`).
- For an immediate same-repository merge, expose remote head deletion as an
  explicit merge choice and perform it only after an authoritative merged-state
  refresh. A deletion failure is a cleanup result, not a merge failure.
- For auto-merge, do not schedule eager deletion because merge happens later.
  Rely on GitHub's repository auto-delete setting or offer cleanup after a later
  refresh observes the PR as merged.
- For fork PRs, never delete the source repository's branch implicitly. A future
  explicit cleanup command may be offered only when ownership and permission
  are known.
- Report optional local cleanup separately; do not implement JJ cleanup here.

**Modify**

- `src/mergeActions.ts`
- `src/ui/merge/useMergeFlow.ts`
- `src/ui/modals/MergeModal.tsx`
- `src/domain.ts` and `src/services/githubSchemas.ts` for head-repository
  identity
- `src/services/githubNormalize.ts` and `src/services/CacheService.ts` for
  additive decode
- `src/services/GitHubService.ts` only if merge result reporting needs a
  narrower remote-delete sequence
- `src/services/github/branches.ts` only to reuse or expose an exact remote
  branch deletion operation
- `src/services/MockGitHubService.ts` and merge/PR fixtures

**Test**

- Extend merge tests for immediate same-repository cleanup, remote merge success
  followed by remote-delete failure, delayed auto-merge, disabled auto-merge,
  admin merge, and fork PRs.
- Verify a successful GitHub merge is retained even if branch deletion fails.
- Verify auto-merge does not delete before GitHub reports a merge and fork heads
  are never deletion targets.

**Done when**

- No merge command performs implicit local branch cleanup.
- No merge path deletes a fork head or performs premature auto-merge cleanup.
- The merge modal states the deletion choice explicitly for Git users.

### Milestone 1 - Read-only JJ snapshot and Changes Surface

**Build**

- Add `ChangeWorkspace` with `snapshot` only.
- Add schema-decoded JJ templates for current operation, workspace, working-copy
  change, bounded stack, bookmarks, remote bookmarks, conflicts, mutability, and
  sibling workspaces.
- Add `src/localDomain.ts` with explicit change and commit identities.
- Register a dynamically available `changes` repository Surface immediately
  after `pullRequests` in the repository tab order.
- Render a read-only Changes Surface with loading, empty, error, retry, narrow,
  and wide layouts.
- Add a compact JJ status segment to repository header/footer chrome.
- Relabel the existing Branches Surface as `REMOTE BRANCHES` only while JJ local
  state is connected.
- Refresh on explicit command and after terminal focus returns; cache by JJ
  operation ID so ordinary list navigation does not spawn JJ commands.

**Proposed create paths**

- `src/services/ChangeWorkspace.ts`
- `src/localDomain.ts`
- `src/surfaces/changes/atoms.ts`
- `src/surfaces/changes/useChangesSurface.ts`
- `src/surfaces/ChangesSurface.tsx`
- `src/keymap/changesView.ts`
- `test/changeWorkspace.test.ts`
- `test/changesSurface.test.tsx`

**Modify**

- `src/services/runtime.ts`
- `src/workspace/surfaceRegistry.ts`
- `src/workspace/atoms.ts`
- `src/workspace/derivations.ts`
- `src/surfaces/WorkspaceContent.tsx`
- `src/surfaces/WorkspaceFooter.tsx`
- `src/ui/WorkspaceTabs.tsx`
- `src/commands/builtins.ts`
- `src/keymap/all.ts`
- `src/keymap/listNav.ts`

**Test**

- Working copy may be empty, conflicted, bookmarked, divergent, or undescribed.
- Stacks may be linear or include merges; unsupported graph shapes remain
  visible with an explicit capability reason.
- Change ID stays stable while commit ID changes across fixture snapshots.
- Multiple workspaces sharing one store retain distinct working-copy changes.
- Snapshot invalidates only when the JJ operation ID changes or refresh is
  explicit.
- Changes Surface is absent or disabled cleanly in GitHub-only mode.
- Render and interaction coverage at `60x16`, `99x24`, `100x24`, and `160x40`.

**Done when**

- [x] A JJ user can understand current working-copy, stack, bookmark, remote
  bookmark, conflict, and workspace state without any local mutation.
- [x] Git and no-VCS users see no regression or misleading synthetic change model.

**Implementation notes**

- `ChangeWorkspace` is snapshot-only. Owned templates live in
  `src/services/ChangeWorkspace.ts` (`JJ_CHANGE_TEMPLATE_VERSION = 1`).
- CHANGES is registered immediately after PULL REQUESTS and is hidden unless
  the selected GitHub repo matches the local workspace's origin, upstream, or
  push remote. Mock and Git-only modes never show it.
- BRANCHES relabels to REMOTE BRANCHES only while JJ local state is connected.
- Adding CHANGES pushed RUNNERS off the 1–9 tab keys; `workspace.runners`
  remains a palette command.
- Snapshots cache by JJ operation ID. `r` forces a refresh; focus-return
  reuses the cache when the operation is unchanged.

### Milestone 2 - PR-to-change relationships

**Build**

- Implement `ChangeWorkspace.relateToGitHub` using GitHub head SHA as the primary
  join into the JJ graph.
- Add exact, local-ahead, remote-ahead, diverged, conflicted, needs-fetch,
  unmapped, and ambiguous relationships.
- Add compact local relationship state to PR list rows when local data is
  available.
- Add a local stack strip and relationship explanation to PR details.
- Add an explicit `change.fetch` command that invokes `jj git fetch` for selected
  configured remotes and then refreshes both local and GitHub observations.
- Never fetch automatically merely to render a relationship.
- Add `change.link-pr` and `change.detach-pr` metadata commands so a user can
  preserve the durable change identity before rewriting it. Exact SHA matches
  seed the proposed link, but persistence always requires explicit confirmation
  in this milestone.
- Add the relationship table and additive cache migration in this milestone.
  Passive browsing still never writes inferred relationships.

**Modify**

- `src/services/ChangeWorkspace.ts`
- `src/ui/PullRequestList.tsx`
- `src/ui/DetailsPane.tsx`
- `src/ui/pullRequests/atoms.ts`
- `src/commands/builtins.ts`
- `src/settings/viewConfig.ts` if local relationship becomes a configurable PR
  column
- `src/services/CacheService.ts`

**Test**

- Exact SHA match maps to one visible JJ change.
- Explicit link followed by rewrite preserves the change relationship while
  changing commit ID; an unlinked rewrite remains unmapped rather than guessed.
- Ancestor, descendant, and divergent graph relationships classify correctly.
- Hidden, abandoned, duplicate, or divergent change IDs do not produce a false
  exact relationship.
- Missing commit yields `needs-fetch` or `unmapped`, never a guessed bookmark
  match.
- Force-pushed PR head invalidates revision-specific GitHub caches exactly as it
  does today.
- Existing pending-review and comment code continues to receive GitHub commit
  SHA, not change ID.

**Done when**

- [x] PRs explain their local JJ relationship without changing any GitHub behavior.
- [x] A relation failure never blocks review, comments, checks, Actions, or merge.

**Implementation notes**

- List badges come from `relateFromSnapshot` only. Missing SHAs stay
  `unmapped` until `ChangeWorkspace.relateToGitHub` looks the commit up for
  details/handoff. Bookmarks are never used as a join key.
- Links persist in `change_pr_links` after explicit confirmation. Passive
  browsing never writes.
- `change.fetch` is the only automatic remote observation path besides
  publication (later).

### Milestone 3 - JJ workspace editor handoff

**Build**

- Add `pull.open-jj-workspace` and `change.open-editor` commands.
- Extend `ChangeWorkspace.plan` and `execute` with bounded
  `workspace.open-existing` and `workspace.create` intents before wiring editor
  commands.
- For an already mapped PR, open the existing matching JJ workspace when one is
  unambiguous.
- Otherwise preview creation of a named JJ workspace at the selected local
  change or fetched PR head.
- Include the source operation ID, workspace/store identity, target commit,
  destination path, and expected absence of the workspace name/path in the
  plan. Revalidate all fields before `jj workspace add`.
- Keep the current working-copy change untouched.
- Extend repository path configuration to represent multiple local workspaces
  without breaking existing `repoPaths` values.
- Update README recipes so `gh pr checkout` is documented as Git-specific, not
  the universal default.
- Retain arbitrary `editorCommand` support as an advanced user-controlled path.
- Pass the resolved workspace path from `ChangeWorkspace` to `EditorOpener` only
  after successful plan execution. `EditorOpener` must not invoke JJ.

**Modify**

- `src/services/EditorOpener.ts`
- `src/editorCommand.ts`
- `src/configStore.ts`
- `src/themeStore.ts` only through its compatibility facade where still needed
- `src/commands/builtins.ts`
- `src/settings/keybindings.ts`
- `README.md`

**Test**

- Existing Git editor templates and `repoPaths` continue to parse and execute.
- Workspace creation preview includes path, name, source commit, and existing
  workspace collisions.
- Operation, target, name, or path changes between preview and execution fail
  closed without creating a workspace or launching the editor.
- Current workspace and working-copy change are unchanged after handoff.
- Fork PRs with missing source remotes fail with a useful bounded action rather
  than mutating remote configuration implicitly.
- TUI suspension resumes on editor success, failure, or interruption.

**Done when**

- [x] A JJ user can inspect a local or fetched PR in an editor without checkout
  semantics or disruption of current work.

**Implementation notes**

- `pull.open-jj-workspace` and `change.open-editor` preview a
  `WorkspaceHandoffPlan` in the ChangePlan modal. Execute rechecks the JJ
  operation and working-copy change, then either opens an existing workspace
  path or runs `jj workspace add --name … -r <commit> <path>`.
- `EditorOpener.openPath` launches the editor after plan execution. Existing
  `e` / `pull.open-editor` templates are unchanged. `gh pr checkout` is
  documented as Git-specific.

### Milestone 4 - Publish change and create/update PR

**Build**

- Extend `ChangeWorkspace.plan` and `execute` from local workspace intents to
  publication intents.
- Add `change.publish`, `change.create-pr`, and `change.update-pr` commands.
- Make every publication command perform a mandatory targeted `jj git fetch`
  and authoritative GitHub PR/head refresh before computing its `SyncPlan`.
  The standalone `change.fetch` command remains optional for browsing, but
  publication cannot plan from cached remote-bookmark state.
- Record the freshly fetched remote tip, GitHub head SHA, JJ operation ID after
  fetch, and observation time in the plan. If fetch or authoritative refresh
  fails, no publication plan is produced.
- Create an explicit bookmark only when GitHub publication needs a named ref.
- Let users choose an existing bookmark or a policy-generated name; never
  require bookmarks during ordinary local authoring.
- Represent review repository, push remote, base branch, and trunk revision
  independently in the preview.
- Use JJ push commands for local publication and existing `GitHubService`
  methods for PR creation/editing.
- Persist the change-to-PR relationship only after successful publication and
  PR creation or explicit linking.
- Recompute and fail closed when operation ID, remote bookmark tip, PR head SHA,
  remote roles, or selected range changed.
- Preserve partial-success state. If push succeeds and PR creation fails, report
  the published bookmark and offer retry without pushing again.

**Modify**

- `src/services/ChangeWorkspace.ts`
- `src/services/CacheService.ts`
- `src/domain.ts` only if `CreatePullRequestInput` needs an explicit cross-fork
  head owner field; prefer keeping the existing GitHub input stable
- `src/services/github/items.ts`
- `src/commands/builtins.ts`
- proposed sync-plan modal under `src/ui/modals/`
- `src/ui/modals/types.ts`

**Test**

- New local change with no bookmark publishes with an explicit generated name.
- Existing bookmark publishes without accidental movement of unrelated
  bookmarks.
- Fork publication uses the push fork as head and upstream as PR repository.
- Fast-forward and non-fast-forward updates are classified correctly.
- Remote movement after planning invalidates execution before mutation.
- Offline, authentication-failed, and fetch-failed publication attempts produce
  no plan and perform no bookmark movement or push.
- Conflicted, immutable, private, empty, ambiguous, or undescribed changes have
  deterministic disabled reasons.
- Push success plus PR failure, PR success plus relationship-write failure, and
  refresh failure all report authoritative external state.
- No remote credential, URL credential, review body, patch, or command stdin is
  recorded in telemetry.

**Validate live**

- Use the existing guarded parity repository or a separately configured exact
  disposable repository.
- Publish one unbookmarked change, create a draft PR, rewrite the same change,
  update the PR, and verify the GitHub head and stored change ID relationship.
- Repeat with fork origin, upstream review host, and `trunk()` resolving to the
  upstream default branch.

**Done when**

- PR creation and updates can begin from JJ changes without branch-first local
  workflow.
- Every remote mutation is previewed, lease-protected, stale-checked, and
  recoverable after partial success.

### Milestone 5 - Stack and review-response workflows

**Build**

- Add stack-range selection using bounded presets derived from trunk and the
  selected tip.
- Add `stack.publish` and `stack.rebase` with affected-descendant and affected-PR
  previews.
- Show one-PR-per-bookmark relationships without assuming every stack uses that
  publication shape.
- Add requested-review grouping by mapped local change.
- Support opening the targeted change or creating an advisory follow-up change.
- Draft GitHub responses and re-request review only through existing GitHub
  commands after the relevant publication succeeds.
- Keep automatic comment resolution and automatic review dismissal out of
  scope.

**Test**

- Linear stacks, merge-containing stacks, partial publication, dependent PRs,
  and ambiguous base relationships.
- Rewriting a middle change identifies every rebased descendant and affected PR
  before execution.
- Partial stack push preserves per-bookmark result state and supports retry of
  failed entries only.
- Review comments targeting obsolete GitHub commits remain visible and are not
  marked resolved.

**Done when**

- A user can publish and update a bounded JJ stack without mentally translating
  local ancestry into Git branch checkout behavior.

### Milestone 6 - Operation history and advanced local mutations

**Build**

- Add read-only JJ operation history and evolution views.
- Add explicit undo of the latest operation with preview and operation-ID guard.
- Add scoped describe, edit, new, split, squash, abandon, and restore commands
  only where they can use bounded intents rather than arbitrary shell text.
- Add conflict navigation and editor handoff; do not attempt to embed a general
  merge-tool implementation in ghui.
- Re-evaluate whether a dedicated Sync Surface is justified by proven workflows
  or whether relationship states belong in Changes and PR Surfaces.

**Done when**

- ghui supports the common JJ changes needed around GitHub collaboration without
  becoming a complete general-purpose JJ client.

## Validation Strategy

### Per-milestone repository gate

```bash
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run test:keymap
```

Expected signal: zero failures and no new warnings from modified capabilities.

### User-facing milestone gate

```bash
bun run package:smoke
bun run build:standalone
bun run changeset:status
```

Expected signal: packaged and standalone binaries preserve GitHub-only startup;
the milestone's user-facing changeset is present and valid.

### Environment matrix

Every milestone touching local context or JJ behavior covers:

| Environment | Expected mode |
|---|---|
| No repository | existing user/global GitHub workspace |
| Ordinary Git repository | existing repository GitHub workspace, no synthetic JJ state |
| Colocated JJ/Git workspace | JJ-connected repository workspace |
| Non-colocated JJ workspace with Git backend | JJ-connected repository workspace; `gh` operations remain explicit by repository |
| Missing or unsupported JJ | GitHub workspace with actionable diagnostics |
| `GHUI_MOCK_PR_COUNT` set | existing mock GitHub workspace; never spawn `jj` or `git` |
| Multiple JJ workspaces | selected workspace is explicit and sibling state is read-only until chosen |
| Fork with origin/upstream | push, review, and trunk roles remain separate |

### Contract tests

Every `ChangeWorkspace` operation requires:

- exact executable and argv;
- exact owned template output contract;
- success, empty, malformed output, unsupported version, timeout, and nonzero
  exit;
- operation-ID concurrency change;
- colocated and non-colocated paths;
- telemetry redaction;
- fake implementation for Surface and command tests.

### Live acceptance safety

Remote-mutating JJ scenarios use the same fail-closed principles as
`bun run parity:live`:

- exact configured disposable repository;
- exact authenticated identity;
- marker proving test ownership;
- explicit apply mode;
- generated, run-prefixed bookmarks and workspaces;
- inventory checkpoint after each transition;
- idempotent cleanup that never abandons unrelated changes or deletes unrelated
  bookmarks.

## Risks and Mitigations

### Branch/bookmark vocabulary collapse

GitHub branches and JJ bookmarks have overlapping names but different semantics.
Keep separate types, separate Surface copy, and relation objects joined by commit
SHA and explicit publication metadata.

### Change identity after rewrite

SHA-only mapping loses the relationship after rewrite. Persist change ID only
after explicit publication/linking and continue to compare GitHub state by Git
commit SHA.

### Remote-role ambiguity

Forks can fetch from upstream, push to origin, and review upstream. Observations
may suggest roles but mutation requires unambiguous configuration or user choice.

### Concurrent JJ commands

The user may run JJ in another terminal while ghui is open. Cache snapshots by
operation ID, refresh on focus, and reject plans when the operation changes.

### Colocation side effects

Git tools can import/export refs and detached HEAD state. Once JJ is detected,
all ghui-owned local mutations use JJ; GitHub operations remain explicit
`gh --repo` calls.

### Partial remote success

Push, PR mutation, relationship persistence, and refresh are separate effects.
Return structured per-step results and reconcile authoritative remote state
instead of rolling back successful external operations optimistically.

### JJ CLI drift

JJ templates are more stable than human output but not a permanent protocol.
Declare a minimum version, schema-decode owned output, pin contract fixtures, and
surface unsupported versions in doctor.

### Scope explosion

Do not start with rebase, split, squash, arbitrary revsets, op restore, or a
dedicated Sync Surface. Ship detection, read-only snapshot, relationships, and
safe handoff before publication and graph mutation.

### GitHub regressions

GitHub-only mode is the regression baseline. Existing remote diffs, comments,
pending reviews, checks, Actions, merge, branch resources, caches, and package
smoke tests must remain independent of JJ availability.

## Rollback

- Dynamic Surface registration is the exposure seam. The Changes Surface can be
  removed from the registry without deleting GitHub functionality or local
  relationship records.
- `ChangeWorkspace` remains optional in runtime composition; GitHub-only mode is
  the fallback.
- Relationship persistence is additive. Older binaries ignore the table.
- Each local mutation command lands separately from read-only observation and
  can be removed without removing local status.
- Remote merge safety changes are retained even if the broader JJ work is
  rolled back because separating remote merge from local cleanup is independently
  safer.
- Existing editor templates and `repoPaths` continue to parse throughout the
  migration.

## Decisions

- Merge-branch deletion is an independent GitHub-only slice after Milestone 0.
  It does not gate the Changes Surface.
- Without `--repo`, browse scope stays origin-first: `origin`, then `upstream`,
  then any other GitHub remote. Fork/upstream roles are diagnostics until
  mutation requires an explicit choice.
- `CHANGES` is a repository tab immediately after `PULL REQUESTS`.

## Open Questions

1. Should ambiguous review/push/trunk roles for *mutation* be configured in
   `config.json`, JJ repo config, or a ghui repository-role picker? Browse
   scope is decided: origin-first. Default for mutation: observe JJ config and
   GitHub fork metadata, persist an explicit ghui choice only when required.
2. Should the Changes Surface be hidden or disabled with a reason outside JJ?
   Default: hide it in ordinary Git, no-VCS, and mock modes; expose diagnostics
   through doctor and the command palette. Hidden-surface palette copy must not
   say the Surface requires repository scope.
3. Should relationship metadata live in the existing SQLite cache or a separate
   local repository file? Default: SQLite keyed by local store identity and
   GitHub repository, because relationships are ghui metadata and must not alter
   the source repository.
4. What bookmark naming policy should `Create PR from change` use? Default: a
   previewed slug derived from change ID and description, editable before push.
5. Should opening a foreign-fork PR add a persistent JJ remote? Default: no;
   require an existing remote or an explicitly previewed remote addition in a
   later slice.
6. Should publication operate on `@` or `@-` by default when the working-copy
   change is empty? Default: select the nearest described, non-empty mutable
   change and show the resolved revision in the preview rather than hiding the
   choice.
7. Does the app need a dedicated Sync Surface? Default: defer until Changes and
   PR relationship states prove that a separate reconciliation queue has enough
   unique behavior.

## Out of Scope for the First Release

- Replacing `GitHubService` or `gh` with a hosting-provider abstraction.
- Reinterpreting GitHub branches as JJ bookmarks.
- A Git staging/index UI.
- Full Git local-workspace parity or synthetic change IDs for Git repositories.
- Arbitrary revset entry.
- Automatic fetch, rebase, bookmark movement, push, or force update.
- General merge-conflict editing inside ghui.
- Automatic review-thread resolution after rewrite.
- Automatic local cleanup bundled with GitHub merge.
- Stack landing orchestration.
- Operation restore, split, squash, abandon, or other advanced JJ mutations.

The first JJ release boundary is Milestones 0 through 3: compatible detection,
origin-first browse with optional remote-role diagnostics, read-only local
state, PR relationships, and safe JJ workspace editor handoff. Remote merge
safety is a parallel GitHub-only slice after Milestone 0 and is not required
for that first JJ release.
