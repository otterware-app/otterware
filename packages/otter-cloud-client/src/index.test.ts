import { describe, expect, it } from "vite-plus/test";
import { CloudError, OtterCloudClient } from "./index.ts";

describe("portable Cloud client", () => {
  it("reuses a scoped Cloud credential and decodes provider grants", async () => {
    const calls: { url: string; headers: Headers }[] = [];
    const client = new OtterCloudClient({
      origin: "https://cloud.otterware.app",
      audience: "env:a",
      sessionToken: async () => "offline-test",
      fetch: async (input, init) => {
        const url = String(input);
        calls.push({ url, headers: new Headers(init?.headers) });
        if (url.endsWith("/v1/cloud/token"))
          return Response.json({
            accessToken: "cloud-test",
            expiresAt: Date.now() + 900_000,
            audience: "env:a",
          });
        if (url.endsWith("/connections")) return Response.json({ connections: [] });
        return Response.json({
          connectionId: "test",
          accessToken: "provider-test",
          expiresAt: Date.now() + 1000,
          audience: "env:a",
          scopes: ["email"],
        });
      },
    });
    expect(await client.connections()).toEqual([]);
    expect((await client.providerToken("test")).accessToken).toBe("provider-test");
    expect(calls).toHaveLength(3);
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer offline-test");
    expect(calls[1]!.headers.get("authorization")).toBe("Bearer cloud-test");
    expect(calls[2]!.headers.get("x-otter-audience")).toBe("env:a");
  });
  it("invalidates a revoked cached token, without retrying a mutation", async () => {
    let issued = 0;
    const client = new OtterCloudClient({
      origin: "https://cloud.otterware.app",
      audience: "env:a",
      sessionToken: async () => "offline",
      fetch: async (input) => {
        if (String(input).endsWith("/v1/cloud/token")) {
          issued++;
          return Response.json({
            accessToken: `token-${issued}`,
            audience: "env:a",
            expiresAt: Date.now() + 900000,
          });
        }
        return new Response(null, { status: 401 });
      },
    });
    await expect(client.push([])).rejects.toBeInstanceOf(CloudError);
    expect(issued).toBe(1);
    expect(await client.accessToken()).toBe("token-2");
  });
  it("never follows an arbitrary caller-supplied API origin or accepts a mismatched audience", async () => {
    const client = new OtterCloudClient({
      origin: "https://cloud.otterware.app",
      audience: "env:a",
      sessionToken: async () => "offline",
      fetch: async () =>
        Response.json({ accessToken: "wrong", audience: "env:b", expiresAt: Date.now() + 900000 }),
    });
    await expect(client.request("https://attacker.test/")).rejects.toThrow(
      "Invalid Cloud API path",
    );
    await expect(client.accessToken()).rejects.toThrow("wrong audience");
  });
});

it("decodes chunked agent tool requests and stops the stream when its consumer leaves", async () => {
  let cancelled = false;
  const frames = [
    ': keepalive\n\ndata: {"requestId":"turn","type":"toolRequest","id":"tool",',
    '"name":"list_mail","input":{}}\n\n',
  ];
  const client = new OtterCloudClient({
    origin: "https://cloud.otterware.app",
    audience: "env:a",
    sessionToken: async () => "offline",
    fetch: async (input) => {
      if (String(input).endsWith("/v1/cloud/token"))
        return Response.json({
          accessToken: "cloud",
          audience: "env:a",
          expiresAt: Date.now() + 900000,
        });
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  for await (const event of client.agentTurn(
    { requestId: "turn", input: "test", model: "test", tools: [] },
    new AbortController().signal,
  )) {
    expect(event).toMatchObject({ type: "toolRequest", id: "tool", name: "list_mail" });
    break;
  }
  expect(cancelled).toBe(true);
});
