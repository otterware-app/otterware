# Module source moves into otterware once; standalone repos freeze

Mail, Calendar and Drive code is imported into `otterware` one time and owned there.
`otter-mail`, `otter-calendar`, `otter-drive` and `otter-scaffold` stop receiving development and
stay up only until their users have migrated; then they are archived.

We rejected continuing to vendor from the standalone repos (the old `otterware` branch of `otter-code`'s sync
scripts, manifests, rewrites, shims and patches cost every change two places and a daily sync)
and rewriting from scratch (throws away working features; the old repos would linger as the
reference anyway).

Modules may diverge from the standalone implementations as long as features stay roughly equal.
