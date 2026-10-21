# Otterware: shared language

Terms for planning `otterware`. T3 Code's own terms (environment, client, project, thread,
turn, provider) keep their meaning from `docs/internals/glossary.md` and are not repeated here.
Entries marked _(open)_ are still being decided.

| Term                   | Meaning                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Otterware              | The product: one app made of modules, sharing one server, one client shell, and one Otter Account.                                                                                             |
| `otterware` repo       | `otterware-app/otterware`, the single monorepo that builds every Otterware app. Renamed from `otterware-releases`.                                                                             |
| Module                 | A product area (Code, Mail, Calendar, Drive, Home) packaged so a build can include it and a user can turn it on or off. Agents are not a module; see Host. _(open: exact boundary)_            |
| Host                   | The shared server and client shell that modules plug into: account, settings, rail, routes, RPC, MCP, and the agent runtime (threads, providers, orchestration). Present in every app profile. |
| App profile            | A build-time choice of modules, branding, app ID, data home and update feed. Profiles: Otterware (all), Otter Code, Otter Mail, Calendar, Drive; each ships desktop and web.                   |
| Assistant project      | The host-owned project that non-coding assistant threads (side chats, Home) belong to, because T3 threads need a project.                                                                      |
| Otter Account          | The user's identity at `accounts.otterware.app`. One sign-in for every module and client.                                                                                                      |
| Provider connection    | A mailbox or calendar account the user links (Google, Microsoft, IMAP). The Otter Account lists it on every device; each device authorizes it itself. Distinct from an agent provider.         |
| Otter Cloud            | The consolidated Otterware Worker (`infra/cloud`): Accounts, Drive API, Mail push and relay, account-wide data. Not the Code relay.                                                            |
| In-browser environment | A module runtime inside a web page (Web Worker, SQLite in WASM) that speaks the same RPC as a real environment, for web users with no machine. Runs only API agents.                           |
| API agent              | An agent provider reached over HTTP (OpenRouter, Hermes, OpenClaw), as opposed to a CLI provider (Codex, Claude). Available on every environment and in the browser.                           |
| Module engine          | A module's portable domain code (sync, storage, tools), free of Node and Electron APIs, so it runs on an environment and in the browser.                                                       |
| Module cache           | An environment's local copy of a module's data (mailbox, calendar events), synced from the provider.                                                                                           |
| Upstream               | `pingdotgg/t3code` `main`.                                                                                                                                                                     |
