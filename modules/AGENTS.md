# Modules

Read `docs/internals/modules.md` first; it says what goes where and how the host runs a module.
When you touch a module:

- Keep its layers apart: `contracts` (schemas only), `engine` (portable: no Node, no Electron, no
  `apps/*`), `web` registrations in `modules/<module>/web`; host UI pages under
  `apps/web/src/otterware/<module>/` until the UI kit is extracted. Composition imports modules.
- Never import another module. Reach the rest of the app through Home contributions, agent tools,
  and the host services module-kit provides (`SqlClient` for `suite.sqlite`, `HomeContributors`,
  `ModuleToolCaller`).
- Migrations: new id per change, in the module's own namespace; never renumber a shipped one.
- Every RPC error union starts from `moduleRpcErrors`, every tool failure from
  `moduleToolFailures`, and every tool declares a tier with `withToolTier`.
- The module must work with any other subset of modules present, including none.
- Pages receive `active`; pause shortcuts and publish page context only while active. Do not key
  pages by environment or auth identity. Settings rows show their declared scope.
- Checks: `vp run check:changed`. Additional focused tests/typechecks go through
  `scripts/otterware/heavy.sh` with `--maxWorkers=2` for Vitest. Do not edit upstream files; if a seam is missing, say so
  in the PR instead of adding one quietly.
