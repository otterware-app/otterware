# Otterware

This repository (`otterware-app/otterware`) builds every Otterware app from one codebase: Otter
Code, Otter Mail, Calendar, Drive, and the combined Otterware app. It is the T3 Code fork that
used to live in `otterware-app/otter-code`; [fork operations](docs/operations/otter-fork.md) describes upstream sync, branding,
and legacy releases. Ordinary tasks read this file and [AGENTS.md](AGENTS.md).

Decisions and their reasons are in [docs/adr](docs/adr) (vocabulary: [CONTEXT.md](docs/adr/CONTEXT.md)).
Read the ADR for the area you touch before changing it; do not reopen a decision in code.

## Layout

```text
apps/{server,web,desktop,mobile}   upstream host; the Code product stays here
packages/*                         upstream foundations
packages/module-kit                registries modules plug into
modules/<m>/contracts              Effect Schema RPC group, tool definitions, settings schema
modules/<m>/engine                 sync, storage, tools; portable: no Node or Electron imports
modules/<m>/node                   environment-only adapters
modules/<m>/web                    React routes, rail entry, settings sections
profiles/<profile>.ts              modules, brand, app ID, data home, update feed
infra/relay                        upstream Code relay (T3 Connect)
infra/cloud                        Otter Cloud: Accounts, Drive API, Mail relay, provider connections
```

Modules: `home`, `mail`, `calendar`, `drive`. Profiles: `otterware` (all), `code`, `mail`,
`calendar`, `drive`; each ships desktop and web.

## Rules that keep the daily rebase cheap

- New code goes in Otter-owned folders: `modules/`, `packages/module-kit`, `profiles/`,
  `infra/cloud`, `scripts/otterware/`, or files under `apps/*/src/otterware/`.
- An upstream-owned file may change only if it is listed in `scripts/otterware/upstream-seams.txt`,
  and the change there is a call into a registry. CI enforces the list. Extending it is a
  deliberate decision in the PR description.
- Module state lives in `suite.sqlite` with migrations namespaced per module; never in
  `statev2.sqlite` or new `settings.json` keys (ADR 0012).
- Engines import only `contracts` and portable host packages (ADR 0008). `web` never imports an
  engine's internals. Nothing imports `apps/*`.

## Working here as an agent

This machine has 15 GB of RAM and several agents at once.

- Work in your own worktree: `git -C ~/projects/otterware worktree add ~/.otter-code/worktrees/otterware/<name> -b <branch> origin/main`, then `vp i`.
- `vp run check:changed` is the local check: format and lint of changed files, typecheck of the
  packages you changed, and the tests next to the files you changed. Nothing more runs locally:
  dependents, full suites, Rust, release smoke and desktop builds are CI's job.
- Any other typecheck, test or build goes through a shared slot, one command per call:
  `scripts/otterware/heavy.sh vp run --filter <pkg> typecheck`. Installs, format and lint need no
  slot. Never run a whole package's or the whole repo's test suite locally.
- Never let a command hold your turn. `heavy.sh` gives up after 90 seconds without a free slot
  (exit 75: skip it, CI will run it) and stops any command after 10 minutes. Anything else that
  may run longer than a minute (installs in a fresh worktree, builds) runs in the background.
  Never run repo-wide checks (knip, full suites) locally.
- Push early: open the PR as soon as a slice typechecks, in PRs small enough to review, and let
  CI find what the local check skipped.
- Never start a server against `~/.otter-code` or `~/.otterware`. Use a disposable `--home-dir`.
- Finish with a PR to `main`: conventional title, the problem and fix in the body, and the model
  and harness at the end. Enable auto-merge with `gh pr merge --auto --squash` and end your turn;
  do not watch CI inside the task unless measuring it is an explicit deliverable.
- Publishing and deploy workflows inherited from Otter Code are disabled in this repository
  until the release workstream replaces them. Do not re-enable them.
