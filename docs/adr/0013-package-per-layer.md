# Modules are split into one workspace package per layer

```text
modules/<module>/
  contracts/  @otterware/<module>-contracts  Effect Schema RPC group, tool definitions, settings schema
  engine/     @otterware/<module>-engine     sync, storage, tools; portable (ADR 0008)
  node/       @otterware/<module>-node       environment-only adapters (filesystem, Electron bridges)
  web/        @otterware/<module>-web        React routes, rail entry, settings sections
packages/module-kit/                         the registries modules contribute to
profiles/<profile>.ts                        modules, brand, app ID, data home, update feed
infra/relay/ (upstream)   infra/cloud/ (ADR 0005)
```

Lint enforces the direction: `engine` imports only `contracts` and portable host packages;
`web` imports `contracts` and client runtime, never `engine` internals; nothing imports `apps/*`.
Each package has its own tsconfig, so a change typechecks only the packages it affects and their
dependents. A layer a module does not need is simply absent (Drive's engine is a thin Otter
Cloud client).

Code is not moved into `modules/`: it stays in upstream's `apps/*` and `packages/*` so the daily
rebase stays cheap (ADR 0002), and profiles select it by showing or hiding its surfaces (ADR 0004).

The host reaches modules only through `module-kit` registries, wired into upstream files at a
fixed list of seams. That list is checked in CI: a PR that edits an upstream-owned file outside
it fails until the seam list is deliberately extended.

We rejected one package per module with subpath exports (boundaries by convention only) and
keeping modules inside `apps/*/src/suite` (every module change edits upstream app folders, and
nothing stops an engine importing Node).
