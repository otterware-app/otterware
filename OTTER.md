# Otter fork

This repository is `otterware-app/otterware`, the Otterware monorepo fork of T3 Code.
For ordinary tasks, read [AGENTS.md](AGENTS.md) and [OTTERWARE.md](OTTERWARE.md).

The [protected publication exception](docs/operations/otter-fork.md#protected-publication-exception)
records the integrated source baseline separately while preserving `upstream-base` and main's
history. It applies only to each authorized sync; the usual reconstruction policy follows.

Upstream is `pingdotgg/t3code` main. `upstream-base` records the upstream commit, and
everything Otterware changes is one commit on top of it; a sync merges the newest upstream
and squashes the result back into that commit. Otter-owned registries and the seam allowlist
keep that commit small. Do not merge upstream into main, rewrite shared history, or edit
other active worktrees as part of a feature task.

[Otter fork operations](docs/operations/otter-fork.md) retains the sync preparation
and publication procedures, legacy Code identities, branding and icon exports,
release configuration, machine migration, account cutover, and integration traps.
Its legacy deployment instructions are reference material: publishing and deploy
workflows in this repository stay disabled until the release workstream replaces them.
