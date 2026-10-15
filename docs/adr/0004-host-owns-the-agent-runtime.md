# The host owns the agent runtime; the Code module owns coding

Threads, provider instances, orchestration-v2, the MCP server and scheduled tasks are host
primitives present in every app profile. The Code module adds the coding product: workspace
projects, git and worktrees, checkpoints and diffs, terminal, preview and source control. A
standalone Mail, Calendar or Drive app keeps its assistant through the same runtime, and module
tools are MCP toolkits on that one server.

We rejected tying agents to the Code module (standalone apps would lose their assistant) and a
second lightweight agent stack like `otter-scaffold`'s `AgentService` or Mail's own drivers (two
runtimes to maintain, and module tools would behave differently in each).

Consequence: T3 Code's server is project-centric and upstream-owned, so "Code off" hides coding
surfaces (rail entry, project sidebar, coding settings) rather than compiling the coding server
out. Non-coding assistant threads live in a host-owned assistant project, as `otter-code`'s old
`otterware` branch already does.
