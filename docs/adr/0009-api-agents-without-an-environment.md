# API agents: OpenRouter, Hermes and OpenClaw run everywhere

Refines ADR 0004. Agent providers that are reached over HTTP (OpenRouter, Hermes, OpenClaw) are
provider drivers on every environment, next to the CLI providers, and they are the only
providers in the in-browser environment (ADR 0008), the way Otter Mail's web and iPhone apps work
today.

- On an environment they run through T3's normal orchestration like any other driver.
- In the in-browser environment, OpenRouter turns run in Otter Cloud with the user's sealed key
  (today's Mail AgentHub), so chats resume on any device; tool calls come back to the browser's
  module engine, so mailbox credentials never leave the device. Hermes and OpenClaw are driven by
  a small loop in the browser against the user's own API server.
- Each module defines its agent tools once. The environment's MCP toolkit and the browser loop
  both consume that one definition, with the same read-only / safe / full access tiers.

We rejected limiting API agents to the browser (two provider lists, and chats could not continue
on a machine) and dropping the assistant without an environment (Otter Mail's web and iPhone
users have it today).

Consequence: besides T3's orchestration there are two small loops, Otter Cloud's OpenRouter
runner and the browser's Hermes/OpenClaw loop. Both must stay small: no worktrees, checkpoints or terminal, only chat, tools,
approvals and history.
