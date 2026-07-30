# Queued PR reviews

## Why

Today, every inline diff comment posts immediately as a single-comment review. GitHub's web UI lets you stage multiple comments under a single pending review, then submit them together with a verdict (Approve / Comment / Request changes). That's the dominant review workflow on the platform — ghui should support it.

## What we'd ship

1. **Per-comment choice in the diff comment modal** — the original design proposed `enter` for immediate post and `shift+enter` for queueing. The shipped interaction uses `ctrl+q` to switch between immediate post and the server-backed queue so `enter` remains an unambiguous submit action; the modal always shows the active mode. `ctrl+g` switches between a comment and an exact GitHub suggestion block.
2. **Visible pending state in the diff view**:
   - A pending count in the diff pane header ("`3 pending`").
   - Pending anchors marked distinctly in the diff gutter (e.g. a different color or a `▎` bar) so they're scannable.
   - A dedicated key (`shift+P`?) opens a "Pending review" pane that lists the queued comments — author / path:line / body preview, with shortcuts to navigate to each one in the diff.
3. **Submit / discard flow**:
   - The existing submit-review modal (`shift+R`) extends to show the pending count and the queued comments.
   - User picks Approve / Comment / Request changes + optional summary body, presses enter to submit.
   - A separate `shift+D` key (inside the pending pane) discards the entire draft.

## GitHub API mapping

GitHub keeps pending reviews server-side, scoped per-PR per-user. The API:

- `POST /repos/{owner}/{repo}/pulls/{n}/reviews` with `event: "PENDING"` (or just no `event`) creates a draft review — returns its id.
- `POST /repos/{owner}/{repo}/pulls/{n}/reviews/{review_id}/comments` adds a comment to that draft. Body shape matches `/pulls/{n}/comments` (path, line, side, body, optionally start_line/start_side).
- `POST /repos/{owner}/{repo}/pulls/{n}/reviews/{review_id}/events` with `event: APPROVE | REQUEST_CHANGES | COMMENT` and an optional `body` submits the review.
- `DELETE /repos/{owner}/{repo}/pulls/{n}/reviews/{review_id}` discards the pending review.
- `GET /repos/{owner}/{repo}/pulls/{n}/reviews?state=PENDING` (or filter `gh api …reviews | jq 'select(.state=="PENDING")'`) finds the existing draft so we can resume.

Because GitHub stores the draft, cross-session resume is free — open the same PR again and we just refetch the pending review and its comments.

## Architecture sketch

- New `GitHubService` methods:
  - `findPendingReview(repo, prNumber): Effect<{ id, comments } | null, GitHubError>`
  - `createPendingReview(repo, prNumber): Effect<{ id }, GitHubError>` (only when none exists)
  - `addPendingReviewComment(reviewId, input): Effect<PullRequestReviewComment, GitHubError>`
  - `submitPendingReview(reviewId, event, body?): Effect<void, GitHubError>`
  - `discardPendingReview(reviewId): Effect<void, GitHubError>`
- New atom: `pendingReviewByPrAtom: Record<prKey, { reviewId: string; comments: readonly PullRequestReviewComment[] } | null>` (keepAlive).
- On entering the diff view, if a pending review exists for this PR, hydrate the atom.
- `submitDiffComment` grows a `mode: "post" | "queue"` parameter:
  - `"post"` → existing path.
  - `"queue"` → ensure-pending-review-exists, then add the comment to it; insert into local pending list.
- Submit-review modal (existing) reads the pending list and includes it in the submission flow.

## Open questions

All original questions are resolved:

1. **Queue-by-default vs post-by-default:** post is the safe default. Queue mode is an explicit per-composer toggle and is not written to SQLite.
2. **Pane name:** Pending review is the user-facing name and the command id namespace is `review.*`.
3. **Discard guardrails:** discard requires two deliberate `shift+d` presses inside the queue pane.
4. **Local-only vs server-mirrored draft:** drafts are server-backed only. Reopening a PR hydrates the viewer's existing GitHub pending review.
5. **Order of comments:** server order is preserved. Local optimistic insertion uses the same append order and converges on the returned server comment.

## Out of scope (for v1)

The originally deferred editing/deletion, suggestion-block, and cross-session-resume work shipped in v1.

Multi-reviewer queues remain out of scope: GitHub exposes one pending review for the authenticated viewer.

## Status

Implemented in M3. The GitHub command contracts use JSON request bodies over stdin, the mock service supports deterministic resume/add/edit/delete/submit/discard behavior, queued anchors and counts are distinct in the diff, the pending-review pane supports navigation and guarded discard, and the existing submit-review modal atomically submits the server draft.
