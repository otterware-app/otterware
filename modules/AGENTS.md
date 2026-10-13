# Modules

Read `docs/internals/modules.md` first; it says what goes where and how the host runs a module.
When you touch a module:

- Keep its layers apart: `contracts` (schemas only), `engine` (portable: no Node, no Electron, no
  `apps/*`), `web` pages under `apps/web/src/otterware/<module>/` for now.
- Never import another module. Reach the rest of the app through Home contributions, agent tools,
  and the host services module-kit provides (`SqlClient` for `suite.sqlite`, `HomeContributors`,
  `ModuleToolCaller`).
- Migrations: new id per change, in the module's own namespace; never renumber a shipped one.
- Every RPC error union starts from `moduleRpcErrors`, every tool failure from
  `moduleToolFailures`, and every tool declares a tier with `withToolTier`.
- The module must work with any other subset of modules present, including none.
- Tests: `vp test run modules/<module>/engine/src/<file>.test.ts` and the module's typecheck
  through the shared lock (`OTTERWARE.md`). Do not edit upstream files; if a seam is missing, say so
  in the PR instead of adding one quietly.
