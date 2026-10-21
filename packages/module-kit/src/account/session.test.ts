// @effect-diagnostics globalDate:off -- Fixture models the Cloud wire expiry timestamp.
import { describe, expect, it, vi } from "vite-plus/test";
import { appLogin, makeOtterAccountSession, type EnvironmentLogin } from "./index.ts";

const suite = (id: string) => ({
  token: `suite-${id}`,
  expiresAt: Date.UTC(2100, 0, 1),
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
/** Accounts, like production, refuses a suite session request that is not a JSON post. */
const accounts = (init: RequestInit | undefined, id: string) =>
  new Headers(init?.headers).get("content-type") === "application/json" && init?.body === "{}"
    ? Response.json(suite(id))
    : new Response(null, { status: 415 });
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
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer environment-access");
      return accounts(init, "alice");
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
      fetch: async (url, init) => {
        if (String(url).endsWith("/suite/session")) return accounts(init, "alice");
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
  it("in a desktop app's built-in environment, follows the app's sign-in", async () => {
    vi.useFakeTimers();
    const exchanged: unknown[] = [];
    const host = makeOtterAccountSession({
      ...options,
      fetch: async (url, init) => {
        if (!String(url).endsWith("/suite/session")) throw new Error("channel offline");
        exchanged.push(new Headers(init?.headers).get("authorization"));
        return accounts(init, "alice");
      },
      login: appLogin(),
    });
    try {
      expect(host.service.status().followsApp).toBe(true);
      expect(host.service.current()).toBeNull();
      await host.service.useAppAccount("app-access");
      expect(host.service.current()?.email).toBe("alice@example.test");
      // Renewals without a fresh token from the app keep the session instead of signing out.
      await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
      expect(host.service.current()?.email).toBe("alice@example.test");
      expect(exchanged).toEqual(["Bearer app-access"]);
      await host.service.useAppAccount(null);
      expect(host.service.current()).toBeNull();
    } finally {
      host.close();
      vi.useRealTimers();
    }
  });
});
