import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { canMaintainEnvironment, findEnvironmentUpdate } from "./environment-maintenance";

afterEach(() => vi.unstubAllGlobals());

describe("environment maintenance access", () => {
  it("requires a connected authenticated session with operate permission", () => {
    const session = {
      authenticated: true,
      auth: {
        policy: "remote-reachable" as const,
        bootstrapMethods: [],
        sessionMethods: [],
        sessionCookieName: "session",
      },
      scopes: [AuthOrchestrationOperateScope],
    };
    expect(canMaintainEnvironment(session, true)).toBe(true);
    expect(canMaintainEnvironment(session, false)).toBe(false);
    expect(canMaintainEnvironment({ ...session, authenticated: false }, true)).toBe(false);
    expect(canMaintainEnvironment({ ...session, scopes: [] }, true)).toBe(false);
    const { scopes: _, ...legacy } = session;
    expect(canMaintainEnvironment(legacy, true)).toBe(false);
    expect(canMaintainEnvironment(null, true)).toBe(false);
  });

  it.each([
    { permissions: ["environment:maintain"], expected: true },
    { permissions: ["providers:manage"], expected: false },
    { permissions: [], expected: false },
  ] as const)(
    "honors exact permissions over legacy scopes: $permissions",
    ({ permissions, expected }) => {
      expect(
        canMaintainEnvironment(
          {
            authenticated: true,
            auth: {
              policy: "remote-reachable",
              bootstrapMethods: [],
              sessionMethods: [],
              sessionCookieName: "session",
              serverUpdateScope: "environment:maintain",
            },
            scopes: ["orchestration:operate"],
            permissions,
          },
          true,
        ),
      ).toBe(expected);
    },
  );
});

describe("environment release checks", () => {
  const signal = new AbortController().signal;
  // An immutable release of the default (otterware) profile, as publish-release.sh names it.
  const release = (version: string, extra: { readonly draft?: boolean } = {}) => ({
    tag_name: `otterware-otterware-v${version}`,
    name: `otterware ${version} (otterware)`,
    ...extra,
  });

  it("keeps stable hosts on stable releases and ignores drafts", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          Response.json([
            release("2.0.0-nightly.20260923.1"),
            release("1.2.0", { draft: true }),
            release("1.1.0"),
          ]),
        ),
    );
    expect(await findEnvironmentUpdate("1.0.0", signal)).toBe("1.1.0");
    expect(await findEnvironmentUpdate("1.1.0", signal)).toBeNull();
    expect(await findEnvironmentUpdate("1.3.0", signal)).toBeNull();
  });

  it("walks release pages to find the host's channel", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(Array.from({ length: 100 }, () => ({ tag_name: "v2.0.0" }))),
      )
      .mockResolvedValueOnce(Response.json([release("1.0.0-preview.20260923.2")]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await findEnvironmentUpdate("1.0.0-preview.20260923.1", signal)).toBe(
      "1.0.0-preview.20260923.2",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain("page=2");
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({ signal });
  });

  it("reports failed checks instead of claiming the server is current", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(findEnvironmentUpdate("1.0.0", signal)).rejects.toThrow("403");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
    await expect(findEnvironmentUpdate("1.0.0", signal)).rejects.toThrow("No stable release");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "invalid" })));
    await expect(findEnvironmentUpdate("1.0.0", signal)).rejects.toThrow();
  });
});
