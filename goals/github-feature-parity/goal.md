# GitHub feature parity for ghui

Bring every user-visible capability that `glab-tui` genuinely supports through its
GitHub backend into `ghui`, while preserving `ghui`'s architecture and existing
workflows. Deliver the work as independently releasable milestones with deterministic
contract/UI coverage, guarded live-repository validation, and installed-package proof.

The shared, user-approved understanding is in
[facts.md](facts.md). The approved ordered execution plan is in
[plan.md](plan.md).

The goal is done when every accepted fact is satisfied; the generated parity manifest
contains only `complete` or approved `excluded` entries; all source, mock, interaction,
migration, package, and guarded live checks pass; cleanup leaves no unrecorded
fixtures; and the installed standalone, npm, and Homebrew results agree without
regressing existing `ghui` behavior.
