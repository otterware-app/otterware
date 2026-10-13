# Modules

How a product area plugs into the host without editing it. Decisions: ADR 0004 (the host owns
agents), 0006 (every module ships standalone), 0010 (live on/off per environment), 0011 (one
Settings screen, scoped settings), 0012 (data homes), 0013 (package per layer).

## Pieces

| Package                       | Holds                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `profiles/`                   | One file per app profile: modules, brand, data home, update feed, landing route, Code visibility   |
| `packages/module-kit`         | What modules plug into: `./contracts`, `./engine` (portable), `./server` (Node), `./web`           |
| `packages/composition`        | The only importer of module contracts, engines and web registrations; selects the profile          |
| `modules/<m>/contracts`       | The module's RPC group (`defineModuleContract`), settings schema, tool and Home schemas            |
| `modules/<m>/engine`          | `defineServerModule`: layer, migrations, RPC handlers, tools, agent instructions, Home contributor |
| `modules/<m>/web`             | Registry declaration; receives host UI adapters while the UI kit is app-local                      |
| `apps/server/src/otterware/`  | Host adapters: the writer lock, Code's Home contributor, the assistant project, the seams' glue    |
| `apps/web/src/otterware/`     | The web shell: registry, pages host, rail buttons, palette items, Settings › Modules, side chat    |
| `apps/web/src/otterware/<m>/` | The module's pages (`defineWebModule`), until `components/ui` becomes a package (see below)        |

The profile is chosen at build time with `OTTERWARE_PROFILE` (`otterware` by default) and baked
into the server, web and desktop bundles as `__OTTERWARE_PROFILE__`; unbundled code reads the
variable. `profiles/active.ts` is the one place that resolves it. Builds reject unknown ids
while loading Vite config. `OTTERWARE_PROFILE=code` keeps the Code app ID, URL scheme,
server home, icon paths, npm identity and bare update channels. Other desktop feeds use
profile-prefixed channels. Explicit homes keep client preferences in that sandbox; otherwise
Otterware separates its client files in `~/.otterware/userdata` from the shared server home.

## Adding a module

1. `modules/<m>/contracts`: `defineModuleContract({ id, group, scopes })`. Methods are named
   `<m>.<name>`; every method lists its auth scope, and its error union starts from
   `moduleRpcErrors(...)` so the host can answer `ModuleOffError`. Tools start their failure union
   from `moduleToolFailures(...)` and declare a tier with `withToolTier` (`read-only`, `safe`,
   `full`). Settings use `defineModuleSettings` with a scope per setting.
2. `modules/<m>/engine`: `defineServerModule({ contract, migrations, layer, rpcHandlers, tools,
agentInstructions, homeContributor, settings })`. The layer is opened when the module turns on
   and closed when it turns off: background work lives in that scope. `SqlClient` is `suite.sqlite`;
   migrations are namespaced by module id, and a shipped id is never renumbered. The engine imports
   only contracts and portable packages (no Node, no `apps/*`).
3. Register it: one line in `MODULE_CONTRACTS` and `SERVER_MODULES` (`packages/composition`), one
   line in `WEB_MODULES` (`apps/web/src/otterware/registry.ts`), and the id in the profiles that
   ship it.
4. `modules/<m>/web`: `defineWebModule({ id, label, icon, rail, page, settings,
commands, searchTerms, serverModule, sideChat })`. The page renders `ModulePageLayout` and
   publishes what the user looks at with `useModulePageContext(context, active)`. Host UI pages
   currently live in `apps/web/src/otterware/<m>/`; composition is the only importer of the
   registration package. Sections contribute to the existing Settings screen and search tables.

A module must work with any other subset of modules present, including none (ADR 0006): read
other modules only through Home contributions and agent tools, never by importing them.

## How the host runs modules

- **State.** `ModuleRuntime` keeps `off | on | failed` per installed module, persisted in
  `suite_modules`; a module without a row is on. `modules.list` and `modules.setEnabled` are host
  RPCs; the Settings › Modules page is their UI. "Not installed" is absent from the profile.
- **RPC.** The merged group (`OtterwareWsRpcGroup`) is static; the WebSocket server is built from it
  once per connection. Each module method has a bridge that dispatches into the running module or
  fails with `ModuleOffError`, so turning a module off swaps nothing in the transport.
- **MCP.** Effect's `McpServer` cannot remove a tool. Every module tool is registered once with an
  `EnabledWhen` annotation that reads the live state: the server filters `tools/list` by it on each
  request and refuses calls to hidden tools, a state change sends `notifications/tools/list_changed`,
  and the bridge rechecks the state and the caller's access against the tool's tier before the
  handler runs. Refusals are `ModuleToolRefusedError`, so agents read why.
- **Agent instructions.** `ModuleRuntime.agentInstructions` joins the instructions of modules that
  are on. Provider adapters build prompts synchronously, so `AgentInstructions` supplies
  a synchronous read in the current Effect fiber. Each runtime gets its own service; there is no process-global snapshot.
- **Account session.** W3 implements `OtterAccountSession` (`module-kit/engine`, also exported
  from `/server`): audience-bound `accessToken` and connection-bound `providerToken`. Credentials
  are redacted values; the host owns refresh and storage. Portable engines never import the Cloud
  client or the server to get credentials.
- **Home.** `HomeContributors.current` is the host's contributors (Code, from the orchestration
  projections) plus those of modules that are on. The Home module reads it per overview.
- **In the browser.** The in-browser environment (ADR 0008, `packages/browser-environment`) runs
  the same runtime, RPC bridges and tool gate from `@otterware/module-kit/runtime` in a Web
  Worker over SQLite in WASM. Keep that entry free of Node imports; environment-only pieces
  (the `suite.sqlite` file, the data home lock, the MCP server) stay in `./server`. Engines that
  run there are listed in `packages/composition/src/browser.ts`.
- **Data home.** `suite.sqlite` sits beside `statev2.sqlite`; the server refuses to start while
  another live server owns the data home and holds a directory lock meanwhile (ADR 0012).

## Seams

An upstream-owned file may change only if it is listed in `scripts/otterware/upstream-seams.txt`;
`scripts/otterware/check-upstream-seams.ts` fails a PR otherwise. Each seam is a call into a
registry marked `Otterware seam` in the source. Extending the list is a decision made in the PR.

Two constraints behind the current layout, to revisit rather than work around:

- The merged RPC group lives in `packages/composition`, not `packages/contracts`: module contracts
  import `@t3tools/contracts`, so the reverse import would be an evaluation cycle. The server
  (`ws.ts`) and `client-runtime` (`rpc/protocol.ts`) build from `OtterwareWsRpcGroup`.
- The retained pages host keys pages only by module id. Environment changes update hooks; auth
  transitions hide the shell with React Activity. Hidden pages pause effects without discarding
  form state. Never key this host or a page by an environment id or an auth token.
- Module pages live under `apps/web/src/otterware/<m>/` and reach the host's UI kit and client
  state through the `~` alias, because `components/ui` and the web state are not packages. Moving
  them to `modules/<m>/web` (ADR 0013) needs that extraction first; `@otterware/module-kit/web`
  already holds the framework-independent registry and page context so the move is mechanical.
