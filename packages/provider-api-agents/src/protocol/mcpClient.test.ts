import { describe, expect, it } from "vite-plus/test";

import { jsonResponse, scriptedFetch, streamedResponse } from "./fixtures/load.ts";
import { makeMcpToolHost } from "./mcpClient.ts";

const withSession = (response: Response) => {
  response.headers.set("mcp-session-id", "mcp-session-1");
  return response;
};

describe("MCP tool host", () => {
  it("initializes once, lists tools page by page and calls them over SSE replies", async () => {
    const { fetch, requests } = scriptedFetch([
      (request) =>
        withSession(
          jsonResponse({
            jsonrpc: "2.0",
            id: (request.body as { id: number }).id,
            result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } },
          }),
        ),
      () => new Response(null, { status: 202 }),
      (request) =>
        jsonResponse({
          jsonrpc: "2.0",
          id: (request.body as { id: number }).id,
          result: {
            tools: [
              {
                name: "t3_thread_read",
                description: "Read a thread",
                inputSchema: { type: "object", properties: { threadId: { type: "string" } } },
                annotations: { readOnlyHint: true },
              },
            ],
            nextCursor: "page-2",
          },
        }),
      (request) =>
        jsonResponse({
          jsonrpc: "2.0",
          id: (request.body as { id: number }).id,
          result: { tools: [{ name: "mail.send", description: "Send mail" }] },
        }),
      (request) =>
        streamedResponse(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: "2.0",
            id: (request.body as { id: number }).id,
            result: { content: [{ type: "text", text: "sent" }], isError: false },
          })}\n\n`,
        ),
    ]);
    const host = makeMcpToolHost({
      fetch,
      endpoint: "http://127.0.0.1:4000/mcp",
      authorization: "Bearer thread-token",
    });

    const tools = await host.list();
    expect(tools).toEqual([
      {
        name: "t3_thread_read",
        description: "Read a thread",
        inputSchema: { type: "object", properties: { threadId: { type: "string" } } },
        readOnly: true,
      },
      {
        name: "mail_send",
        description: "Send mail",
        inputSchema: { type: "object", properties: {} },
        readOnly: false,
      },
    ]);
    const result = await host.call("mail_send", { to: "a@b.c" }, new AbortController().signal);
    expect(result).toEqual({ text: "sent", isError: false });

    expect(requests.map((request) => (request.body as { method: string }).method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/list",
      "tools/call",
    ]);
    // The safe name maps back to the server's own tool name.
    expect(requests[4]?.body).toMatchObject({
      params: { name: "mail.send", arguments: { to: "a@b.c" } },
    });
    expect(requests[2]?.headers).toMatchObject({
      authorization: "Bearer thread-token",
      "mcp-session-id": "mcp-session-1",
    });
  });
});
