# Modules turn on and off live, per environment

Each environment has a switch per installed module (Settings › Modules). Turning a module on
starts its engine, sync and agent tools; turning it off stops new calls, closes subscriptions and
background sync, and withdraws its tools and Home contributions, without restarting the server
or interrupting running agent turns. Data and provider connections are kept. Each client can
additionally hide a module from its rail; that is a display preference, not a lifecycle change.

A module therefore has four states on an environment: not installed (absent from the app
profile), off, on, failed. Running turns see tool lists refresh where the provider supports it,
otherwise at their next turn; every tool call rechecks that its module is on.

We rejected toggles that apply after a restart (restarting interrupts agent turns) and one
account-wide switch (a work server could not keep Mail off).

Consequences: each module's server layer must be a scoped resource the host can open and close
at runtime. Effect's MCP server cannot remove tools, so one seam in `McpHttpServer.ts` filters
`tools/list` by module state and sends `list_changed`; the RPC group stays static and handlers
return "module off" instead of being swapped. Code is hide-only (ADR 0004).
