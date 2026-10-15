# Upstream sync keeps Otterware as one commit on T3 Code

`otterware` is T3 Code's `main` plus one commit: `upstream-base` marks the T3 Code commit, and
everything Otterware adds or changes is squashed into a single commit on top of it. Work between
syncs lands on `main` through PRs; a sync folds those PRs into the one commit, replays it on the
newest upstream `main`, and force-pushes `main` and `upstream-base` together with leases.

We chose one commit over a stack of feature commits: conflicts are resolved once per sync instead
of once per commit, and `git diff upstream-base main` is the whole fork.

Consequence: every edit to an upstream-owned file is a potential conflict on every sync, so
modules live in Otter-owned folders and reach the host only through a small, stable set of
extension seams. The number of upstream files touched is a budget to be tracked, not a free
choice. Generated files (`pnpm-lock.yaml`, the adaptation script's output) are regenerated rather
than resolved by hand, and auto-merge (ADR 0014) is paused while a sync is published so the
force-with-lease push does not race merges.
