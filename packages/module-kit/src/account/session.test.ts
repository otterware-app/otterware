// @effect-diagnostics globalDate:off -- Fixture models the Cloud wire expiry timestamp.
import { describe, expect, it, vi } from "vite-plus/test";
import { makeOtterAccountSession, type EnvironmentLogin } from "./index.ts";

const suite = (id: string) => ({
  token: `suite-${id}`,
  expiresAt: Date.now() + 3_600_000,
  user: { id, email: `${id}@example.test` },
});
const options = {
  accountsUrl: "https://accounts.example.test/v1/auth",
  cloudOrigin: "https://cloud.example.test",
  audience: "environment:test",
  devices: null,
};
const login = (accessToken: () => Promise<string | null>): EnvironmentLogin => ({
  accessToken,
  signIn: () => Promise.reject(new Error("unused")),
  signOut: async () => {},
});
const changed = (host: ReturnType<typeof makeOtterAccountSession>) =>
  new Promise<void>((resolve) => {
    const stop = host.service.subscribe(() => {
      stop();
      resolve();
    });
  });

describe("host account session", () => {
  it("follows the environment's own login, with no client attaching it", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (!String(url).endsWith("/suite/session")) throw new Error("channel offline");
      expect(init?.headers).toEqual({ authorization: "Bearer environment-access" });
      return Response.json(suite("alice"));
    });
    const signOut = vi.fn(async () => {});
    const host = makeOtterAccountSession({
      ...options,
      fetch: fetcher,
      login: { ...login(async () => "environment-access"), signOut },
    });
    try {
      await changed(host);
      expect(host.service.current()?.email).toBe("alice@example.test");
      await host.service.signOut();
      expect(signOut).toHaveBeenCalledOnce();
      expect(host.service.current()).toBeNull();
    } finally {
      host.close();
    }
  });
  it("gives Mail and Calendar no provider account without this device's grants", async () => {
    const host = makeOtterAccountSession({
      ...options,
      fetch: async (url) => {
        if (String(url).endsWith("/suite/session")) return Response.json(suite("alice"));
        throw new Error("offline");
      },
      login: login(async () => "environment-access"),
    });
    try {
      await changed(host);
      expect(host.service.current()?.accountId).toBe("alice");
      expect(host.service.providerAccount()).toBeNull();
    } finally {
      host.close();
    }
  });
});
