/**
 * A minimal MCP client over Streamable HTTP: initialize, list tools, call a
 * tool. Enough to hand an MCP server's tools to the tool loop, so agents the
 * loop runs (OpenRouter, OpenClaw) can use T3's thread tools. Portable: no
 * Node APIs.
 * https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 *
 * @module provider-api-agents/protocol/mcpClient
 */
import { parseSseJson, readSse } from "./sse.ts";
import type { AgentTool, AgentToolResult, Fetch, ToolHost } from "./types.ts";

const PROTOCOL_VERSION = "2025-06-18";
/** OpenAI function names allow only these characters, up to 64 of them. */
const FUNCTION_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

interface JsonRpcResponse {
  readonly id?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly message?: unknown };
}

export interface McpServerConnection {
  readonly fetch: Fetch;
  readonly endpoint: string;
  readonly authorization?: string | undefined;
}

/** An MCP server's tools as a `ToolHost`. Tool names are made safe for function calling. */
export function makeMcpToolHost(server: McpServerConnection): ToolHost {
  let sessionId: string | undefined;
  let nextId = 1;
  let initialized: Promise<void> | undefined;
  /** Function name the model sees → the server's tool name. */
  const names = new Map<string, string>();

  const headers = (): Record<string, string> => ({
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL_VERSION,
    ...(server.authorization ? { Authorization: server.authorization } : {}),
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  });

  const request = async (
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    const id = nextId++;
    const response = await server.fetch(server.endpoint, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw new Error(`MCP ${method} answered HTTP ${response.status}`);
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    let message: JsonRpcResponse | undefined;
    if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
      if (!response.body) throw new Error(`MCP ${method} returned an empty stream`);
      await readSse(response.body, (frames) => {
        for (const frame of frames) {
          const parsed = parseSseJson(frame.data) as JsonRpcResponse | null;
          if (parsed?.id === id) message = parsed;
        }
      });
    } else {
      message = (await response.json()) as JsonRpcResponse;
    }
    if (!message) throw new Error(`MCP ${method} returned no response`);
    if (message.error)
      throw new Error(
        typeof message.error.message === "string" ? message.error.message : `MCP ${method} failed`,
      );
    return message.result;
  };

  const initialize = () =>
    (initialized ??= (async () => {
      await request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "otterware-api-agents", version: "1.0.0" },
      });
      await server.fetch(server.endpoint, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
    })().catch((error: unknown) => {
      initialized = undefined;
      throw error;
    }));

  const functionName = (name: string) => {
    if (FUNCTION_NAME.test(name)) return name;
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    return safe || "tool";
  };

  return {
    async list() {
      await initialize();
      const tools: AgentTool[] = [];
      let cursor: string | undefined;
      do {
        const result = (await request("tools/list", cursor ? { cursor } : {})) as {
          tools?: ReadonlyArray<{
            name?: unknown;
            description?: unknown;
            inputSchema?: unknown;
            annotations?: { readOnlyHint?: unknown };
          }>;
          nextCursor?: unknown;
        };
        for (const tool of result.tools ?? []) {
          if (typeof tool.name !== "string" || !tool.name) continue;
          const name = functionName(tool.name);
          if (names.has(name)) continue;
          names.set(name, tool.name);
          tools.push({
            name,
            description: typeof tool.description === "string" ? tool.description : "",
            inputSchema:
              tool.inputSchema && typeof tool.inputSchema === "object"
                ? (tool.inputSchema as Record<string, unknown>)
                : { type: "object", properties: {} },
            readOnly: tool.annotations?.readOnlyHint === true,
          });
        }
        cursor = typeof result.nextCursor === "string" ? result.nextCursor : undefined;
      } while (cursor);
      return tools;
    },
    async call(name, args, signal): Promise<AgentToolResult> {
      await initialize();
      const result = (await request(
        "tools/call",
        { name: names.get(name) ?? name, arguments: args },
        signal,
      )) as {
        content?: ReadonlyArray<{ type?: unknown; text?: unknown }>;
        structuredContent?: unknown;
        isError?: unknown;
      };
      const text = (result.content ?? [])
        .map((part) =>
          part.type === "text" && typeof part.text === "string"
            ? part.text
            : part.type
              ? `[${String(part.type)} content]`
              : "",
        )
        .filter(Boolean)
        .join("\n");
      return {
        text:
          text ||
          (result.structuredContent === undefined ? "" : JSON.stringify(result.structuredContent)),
        isError: result.isError === true,
      };
    },
  };
}
