# Otterware agent guidance

> **This is the Otter Code fork.** Read [OTTER.md](OTTER.md) first: it covers how the fork
> stays in sync with upstream, its identities and infrastructure, releases, and moving machines.

Read [OTTERWARE.md](OTTERWARE.md) first, then the ADR for the area you touch.
Ordinary tasks need only these two root files. Detailed development procedures,
product principles, terminology, and documentation rules remain in
[the agent reference](docs/operations/agent-reference.md); fork sync, release,
branding, and migration procedures remain in [fork operations](docs/operations/otter-fork.md).

## Scope and architecture

T3 supplies the server, web, Electron desktop, and React Native mobile host.
Otterware modules plug into registries; keep new work in the Otter-owned folders
listed in OTTERWARE.md. Upstream file changes need an approved seam. Keep the
smallest model that makes correct behavior unsurprising; protect performance
and remote connections.

- Contracts crossing the wire live in `packages/contracts`. Shared client logic
  lives in `packages/client-runtime`; shared runtime helpers use explicit subpaths.
- Server features are services. RPC, HTTP, and MCP handlers decode, call a service,
  and map errors. Read [Effect services](docs/internals/effect-services.md) before
  adding server code, and `.repos/effect-smol/LLMS.md` for Effect patterns.
- Orchestration is pure: commands decide events, the event sink commits them and
  outbox effects atomically, and the effect worker performs side effects afterward.
- Client mutations use `createEnvironmentRpcCommand`. Protected RPC methods belong
  in `CLIENT_GUARDED_RPC_SCOPES`; use the command's permission atom in the UI.
- UI exports own their appearance: use variants and sizes, with layout on parents.
  Read [Web UI](docs/internals/web-ui.md) when changing components. Avoid continuous
  animations, oversized websocket payloads, and expensive list rendering.
- Prefer inferred types. Never edit or import vendored `.repos/` reference sources.

## Protect the running environment

- Never kill processes by name or path matching. Stop only a PID you captured at
  spawn, or your port's owner after confirming its `/proc/<pid>/cwd`.
- Never write to or run a server against the live `~/.t3/userdata`, `~/.otter-code`,
  or `~/.otterware`. Use copied data in disposable worktree state. Refresh
  `statev2.sqlite`, not V1 `state.sqlite`; copy, never symlink live data.
- Never set `VITE_HTTP_URL` or `VITE_WS_URL` for dev. Vite's same-origin proxy
  supports remote browsers. Read actual ports from the dev-runner output.
- Do not launch browsers or use computer control without explicit authorization.
  Do not publish credentials or pairing links. Stop only what you started.

## Check the change

Run `vp run check:changed` (optionally `--base origin/<branch>`) before the PR.
It compares against the merge base, includes staged, unstaged, and untracked files,
checks changed-file format/lint, and typechecks/tests affected workspace packages
plus dependents. Shared contracts, module-kit, root configuration, CI, toolchain,
and lockfile changes widen the gate. Unknown runtime inputs also widen it.
The command acquires `/tmp/otterware-heavy.lock`; do not wrap it in another lock.
Installs and additional typechecks, tests, or builds must use that same lock.

- Use the smallest extra proof needed, with Vitest `--maxWorkers=2`. Do not run
  repo-wide checks outside the affected gate unless explicitly requested.
- Backend behavior changes include focused behavior tests. Do not add tests that
  merely mirror props, callback wiring, or the implementation.
- Event-sourced tests drain `OrchestrationEffectWorkerV2.drain` or await the persisted
  event/Deferred milestone; never use sleeps or polling to make tests pass.
- CI preserves server sharding and supplies desktop builds, release smoke, Rust,
  upstream seam checks when installed, and macOS native analysis. On Linux the
  local command reports the native analysis that CI must cover.
- For frontend work, consider chat/settings/palette/keybinding entry points;
  web/desktop/mobile; provider adapters; MCP and scheduled paths; contracts;
  reverse states; local/remote/tunnel and multiple environments; and user docs.
  On request, do one integrated pass with `test-t3-app` or `test-t3-mobile` after
  integration. Native verification requires the matching native client build.

## Deliver

Finish Otterware tasks with one PR to main and enable squash auto-merge, as
OTTERWARE.md specifies. Use a conventional title and a body explaining the problem,
fix, and validation, ending with the model and harness. UI evidence belongs on
GitHub, never in `.github/pr-assets/`. End the task after enabling auto-merge;
measure CI only when the task explicitly asks for timing evidence.

Keep plans and scratch artifacts outside the worktree. The merged PR records the
implementation; update its tracking issue rather than committing a second checklist.
Most changes need no internal docs: document durable cross-component constraints
and reasons, use nearby comments for local explanations, and update user guidance
only when how to accomplish a task changes. Operational procedures belong in
`docs/operations/`. Rewrite obsolete guidance instead of appending a competing account.
