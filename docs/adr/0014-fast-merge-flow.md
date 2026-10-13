# PRs merge themselves when fast, affected-only checks pass

An agent's job ends at an open PR with auto-merge enabled. Required checks run only on what the
diff affects (changed packages and their dependents, from the workspace graph) and target under
five minutes: format and lint on changed files, per-package typecheck with no build step,
focused tests, and the upstream seam check (ADR 0013). Lockfile, toolchain, host-seam and
contract changes widen the set; when the graph is unsure, it widens rather than narrows.

Desktop packaging, signing and full profile matrices run on `main` and in releases, never as PR
gates. Releases are cut from a validated `main` commit by the release workflow, not babysat inside
feature threads.

Agent guidance follows the same rule: a short root `AGENTS.md`, plus a short `AGENTS.md` per
module read only when that module is touched; release, branding and fleet procedures live in
`docs/operations/`. One command, `vp run check:changed`, runs the local equivalent of the PR
gate.

We rejected human review of every PR (the developer is the bottleneck the speed goal is about)
and label-gated review for sensitive areas (kept as a later option if auto-merge causes trouble).
