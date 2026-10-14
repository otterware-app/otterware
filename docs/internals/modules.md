# Modules

How a product area plugs into the host without editing it. Decisions: ADR 0004 (the host owns
agents), 0006 (every module ships standalone), 0010 (live on/off per environment), 0011 (one
Settings screen, scoped settings), 0012 (data homes), 0013 (package per layer), 0020 (modules
render on the shell).

## Pieces

| Package                       | Holds                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `profiles/`                   | One file per app profile: modules, brand, data home, update feed, landing route, Code visibility   |
| `packages/module-kit`         | What modules plug into: `./contracts`, `./engine` (portable), `./server` (Node), `./web`           |
| `packages/composition`        | The only importer of module contracts, engines and web registrations; selects the profile          |
| `modules/<m>/contracts`       | The module's RPC group (`defineModuleContract`), settings schema, tool and Home schemas            |
| `modules/<m>/engine`          | `defineServerModule`: layer, migrations, RPC handlers, tools, agent instructions, Home contributor |
| `modules/<m>/web`             | `defineWebModule`: what the module contributes to the shell (see "The shell contract")             |
| `apps/server/src/otterware/`  | Host adapters: the writer lock, Code's Home contributor, the assistant project, the seams' glue    |
| `apps/web/src/otterware/`     | The web shell: rail, module sidebar, page frame, settings groups, keybindings, palette, side chat  |
| `apps/web/src/otterware/<m>/` | The module's pages and hooks, until `components/ui` becomes a package (see below)                  |

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
4. `modules/<m>/web`: `defineWebModule({ id, label, icon, page, useSpaces, useSidebar,
useHeaderActions, stores, settings, commands, keybindingAliases, searchTerms, serverModule,
sideChat })`, per the shell contract below. Host UI pages currently live in
   `apps/web/src/otterware/<m>/`; composition is the only importer of the registration package.

A module must work with any other subset of modules present, including none (ADR 0006): read
other modules only through Home contributions and agent tools, never by importing them.

## The shell contract

A module contributes data; the host draws every frame (ADR 0020). `packages/module-kit/src/web`
is the contract, `apps/web/src/otterware` the shell that reads it:

- **Rail.** `useSpaces()` returns the module's rail items (Mail: accounts and views; Calendar:
  views; Drive: drives). Code's items are the host's own. In the combined profile the rail is
  Home, the switcher for the modules that are on, the active app's spaces, pins, then the foot;
  a standalone profile shows only its module's spaces. Any space or sidebar row with an `href`
  can be pinned (`railPins.ts`, Account scope). The active space per module lives in
  `useShellSelection`; pages read it with `useActiveSpaceId`.
- **Sidebar.** `useSidebar(context)` returns sections of rows for the active space; the host
  draws them (`ModuleSidebar.tsx`) with the thread sidebar's pieces and adds "Pin to rail" to each
  row's context menu. A module without the hook has no sidebar on its pages.
- **Page.** `page` renders content only; `ModulePagesHost` keeps it mounted across routes and wraps
  it in `ModulePageLayout`: header (space or project title, `useHeaderActions()`, the Otterware
  Assistant toggle), the content, the Assistant beside it, and the calm state while the module is
  off. A page that must change the frame (this browser's module state, a title of its own) calls
  `useModulePageFrameOverrides`.
- **Data.** `stores` are mounted once above the routes while the module is on
  (`ModuleStoresHost`); `createClientStore` gives a zustand store with a persisted slice and a
  declared scope. Nothing refetches because a page was hidden.
- **Settings.** Each `settings` page declares a `placement` per profile: its own page under the
  module's group (`/settings/<m>/<page>`, "Mail › Reading") or merged into an App page, whose
  `SettingsPageContainer` renders it as a section. The sidebar groups (App, Code, one per module
  that is on) come from `settingsNavLayout`; headers appear only with more than one module on, and
  a standalone profile lists its original flat order. Search covers pages and their `rows`.
- **Keybindings.** Commands are `<module>.<command>` (the contracts schema admits them). The
  shell's defaults (`shellDefaultKeybindings`: ⌘1…⌘4 app switching in the combined profile, the
  Assistant toggle, module `defaultKey`s scoped with `when: app.<module>`) merge below the user's
  rules; `ShellKeybindings` runs them with the `app.*` context set to the active app, so the same
  key can mean different things in Mail and Drive. `keybindingAliases` renames a module's old
  command ids so custom bindings survive a prefix change. The Keybindings page filters by chip.
- **Cross-app projects.** `/home/projects/<id>/<module>/<subpath>` shows a module's page inside the
  project's scope: the registry's `forPath` reports `projectId`, Home owns the sidebar and the
  page title, and the page receives `projectId`.

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

Constraints behind the current layout, to revisit rather than work around:

- The merged RPC group lives in `packages/composition`, not `packages/contracts`: module contracts
  import `@t3tools/contracts`, so the reverse import would be an evaluation cycle. The server
  (`ws.ts`) and `client-runtime` (`rpc/protocol.ts`) build from `OtterwareWsRpcGroup`.
- The retained pages host keys pages only by module id. Environment changes update hooks; auth
  transitions hide the shell with React Activity. Hidden pages pause effects without discarding
  form state. Never key this host or a page by an environment id or an auth token.
- Home uses the host UI kit and client state under `apps/web/src/otterware/home/`, because
  `components/ui` and the web state are not packages. Moving that UI to `modules/home/web`
  needs the UI kit extraction first. Mail, Calendar and Drive still carry their first
  integration's inner UI (own routers, sidebars, theme engines) inside the host frame until their
  rebuild chunks replace it with the shell contract; composition keeps their registration cheap
  and loads their full UI only on first use.
