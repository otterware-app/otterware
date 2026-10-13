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
packages/provider-api-agents       OpenRouter, Hermes, OpenClaw drivers; portable protocol (ADR 0009)
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

- New code goes in Otter-owned folders: `modules/`, `packages/module-kit`,
  `packages/provider-api-agents`, `profiles/`, `infra/cloud`, `scripts/otterware/`, or files under
  `apps/*/src/otterware/`.
- An upstream-owned file may change only if it is listed in `scripts/otterware/upstream-seams.txt`,
  and the change there is a call into a registry. CI enforces the list. Extending it is a
  deliberate decision in the PR description.
- Module state lives in `suite.sqlite` with migrations namespaced per module; never in
  `statev2.sqlite` or new `settings.json` keys (ADR 0012).
- Engines import only `contracts` and portable host packages (ADR 0008). `web` never imports an
  engine's internals. Nothing imports `apps/*`.

## Working here as an agent

This machine has 15 GB of RAM and several agents at once.

- Work in your own worktree: `git -C ~/projects/otterware worktree add ~/.otter-code/worktrees/otterware/<name> -b <branch> origin/main`, then `flock /tmp/otterware-heavy.lock vp i`.
- Run typecheck, tests and builds through the shared lock, one at a time, and wait on it rather
  than polling: `flock /tmp/otterware-heavy.lock vp run --filter <pkg> typecheck`. Vitest with
  `--maxWorkers=2`. Use `vp run check:changed` for changed-file lint/format and
  affected typechecks/tests (including dependents); it acquires the lock itself.
  Use `--base origin/<branch>` for stacked work. CI adds desktop builds and
  platform checks; do not rerun the full suite locally.
- Never start a server against `~/.otter-code` or `~/.otterware`. Use a disposable `--home-dir`.
- Finish with a PR to `main`: conventional title, the problem and fix in the body, and the model
  and harness at the end. Enable auto-merge with `gh pr merge --auto --squash` and end your turn;
  do not watch CI inside the task unless measuring it is an explicit deliverable.
- Publishing and deploy workflows inherited from Otter Code are disabled in this repository
  until the release workstream replaces them. Do not re-enable them.
