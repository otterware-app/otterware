# The repo starts from otter-code main; the old otterware branch is harvested, not merged

`otterware` `main` begins as `otter-code` `main` with its stack and `upstream-base`. From
`otter-code`'s old `otterware` branch we carry over only the pieces that already work as module
infrastructure, reshaped into `packages/module-kit` and the seam list: the `SuiteModule` registry,
namespaced migrations in `suite.sqlite`, `StateDirGuard` (the shared-home lock of ADR 0012), the
assistant project, MCP toolkit registration and access tiers, Home, the side-chat seams in
`ChatView`, and the per-channel release workflow. Mail, Calendar and Drive are imported from their
standalone repositories into `modules/`, not from the branch's vendored and rewritten copies.

We rejected starting from the branch as-is (the first job would be unwinding 126 upstream edits
and three vendor trees) and starting fresh from upstream T3 Code (redoes Otter Code's branding,
Linear, diff review and code intelligence work).

Consequence: until the cutover, the old `otterware` branch keeps its own release channel and is
the reference for behavior the new modules must match.
