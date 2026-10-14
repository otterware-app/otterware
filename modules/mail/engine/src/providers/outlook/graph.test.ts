import { afterEach, expect, it, vi } from "vite-plus/test";
import { graph, graphAll } from "./graph.ts";

const auth = vi.hoisted(() => ({ getAccessToken: vi.fn(async () => "host-token") }));
vi.mock("../../platform.ts", () => ({
  platform: () => ({
    microsoft: auth,
    asyncContext: () => ({
      get: () => undefined,
      run: (_lane: unknown, fn: () => unknown) => fn(),
    }),
  }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  auth.getAccessToken.mockClear();
});

it("uses the host grant with immutable IDs and retries an expired token once", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({ error: { code: "InvalidAuthenticationToken" } }, { status: 401 }),
    )
    .mockResolvedValueOnce(Response.json({ id: "mail" }));
  expect(await graph("m@example.test", "/me/messages/mail")).toEqual({ id: "mail" });
  expect(auth.getAccessToken).toHaveBeenCalledWith("m@example.test", { forceRefresh: true });
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
    headers: { Authorization: "Bearer host-token", Prefer: 'IdType="ImmutableId"' },
    redirect: "error",
  });
});

it("rejects pagination outside Graph before sending a token", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({
      value: [{ id: "one" }],
      "@odata.nextLink": "https://example.test/steal",
    }),
  );
  await expect(graphAll("m@example.test", "/me/messages")).rejects.toThrow(
    "Invalid Microsoft Graph",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(auth.getAccessToken).toHaveBeenCalledTimes(1);
});
