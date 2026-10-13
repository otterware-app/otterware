# Web apps work without an environment through an in-browser environment

Every standalone web app (Mail, Calendar, Drive, and the combined app) must work for someone
who runs no desktop app or server. Drive's client talks to Otter Cloud directly. Mail and
Calendar run their module engines in the browser: a Web Worker with SQLite in WASM on OPFS,
spoken to over the same typed RPC contract as a real environment, through a message port
instead of a WebSocket. Provider tokens come from Otter Cloud as in ADR 0007.

We rejected a cloud runtime per user (Durable Objects caching everyone's mailbox: hosting cost,
the engine must also run on Workers, and mail data moves into our cloud) and hosted Node
environments per user (cost and operations).

Consequences:

- The in-browser environment is a new connection kind in client-runtime, not a T3 environment:
  it implements module RPC groups and the small browser agent group (ADR 0009), with no projects,
  threads or projections, and runs `RpcServer` over a worker protocol.
- A module engine is written once against portable services (`SqlClient`, `HttpClient`,
  a secret store, a clock) and may not import Node or Electron APIs. Node-only work (Electron
  bridges, filesystem attachments) sits behind adapters the environment provides.
- The browser keeps a separate cache per browser profile; clearing site data clears it.
- Mail keeps its own portability seam: `otter-mail/packages/core`'s `Platform` (synchronous
  `SqlDatabase`, byte streams), which the host supplies with node:sqlite on an environment and
  SQLite in WASM in the browser. The `SqlClient` rule applies to Calendar and new engines.
- Web IMAP needs Otter Cloud's TCP tunnel (Mail relay's `/v1/tunnel`), so that moves too (ADR 0005).
