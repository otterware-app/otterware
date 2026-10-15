# API agents: OpenRouter, Hermes and OpenClaw

These agents run over HTTP, so nothing needs to be installed on the machine running your
environment. They are beta integrations and off until you add an instance: open
**Settings → Providers**, select the environment, add the agent, and fill in its settings. Keys
and tokens are stored on that environment and are never sent back to your devices.

All three offer two [permission modes](./permission-modes.md): **Supervised** and **Full access**.
They have no Plan mode. Forking starts a new session with a copy of the conversation context, and
conversation rewind is unavailable.

## OpenRouter

Add an API key from [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys). The model
picker lists the models your key can use under your OpenRouter privacy settings that support tool
calling; **Auto Router** is the default. Requests never go to providers that store or train on
prompts, so a model with only such providers is unavailable. Usage draws from your OpenRouter
credits.

OpenRouter works with T3 Code's own tools for the thread. In Supervised mode it asks before any tool
that changes something; read-only tools run without asking. It has no shell or file access. The
conversation is kept on the environment, so a thread continues after a restart.

## Hermes

Set **Server URL** to your Hermes API server (port 8642 by default) and **API key** to its
`API_SERVER_KEY`. The environment must reach that address, for example over Tailscale.

Each thread is a Hermes session, so it also shows in Hermes' own session list and keeps its history
there. Hermes runs its own tools. In Supervised mode its command approvals appear in the thread; in
Full access T3 Code approves them once. You can steer Hermes while it works. **Hermes default**
uses the model the gateway is configured with; the other models come from the gateway's provider
list. T3 Code's own tools are not available to Hermes.

## OpenClaw

Turn on the gateway's HTTP API with `gateway.http.endpoints.chatCompletions.enabled`, then set
**Server URL** (port 18789 by default) and **Gateway token** to the gateway's token or password. A
token gives full operator access, so keep the gateway on loopback, your tailnet or a private
network.

Models are OpenClaw agents. Each thread is one gateway session, so changing the agent starts a new
session with the conversation handed over. OpenClaw can use T3 Code's tools for the thread, with the
same Supervised prompts as OpenRouter; its own tools follow the gateway's configuration.
