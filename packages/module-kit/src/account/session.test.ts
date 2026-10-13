// @effect-diagnostics globalDate:off -- Fixture models the Cloud wire expiry timestamp.
import { describe, expect, it, vi } from "vite-plus/test";
import { makeOtterAccountSession } from "./index.ts";

const suite = (id: string) => ({
  token: `suite-${id}`,
  expiresAt: Date.now() + 3_600_000,
  user: { id },
});
const options = {
  accountsUrl: "https://accounts.example.test/v1/auth",
  cloudOrigin: "https://cloud.example.test",
  audience: "environment:test",
};
describe("host account session", () => {
  it("exchanges the access grant at Accounts and retains only the suite session", async () => {
    const stored: unknown[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/suite/session")) {
        expect(init?.headers).toEqual({ authorization: "Bearer account-access" });
        expect(init?.redirect).toBe("error");
        return Response.json(suite("alice"));
      }
      throw new Error("channel offline");
    });
    const host = await makeOtterAccountSession({
      ...options,
      fetch: fetcher,
      storage: {
        read: async () => null,
        write: async (value) => {
          stored.push(value);
        },
      },
    });
    try {
      expect(await host.service.attach("account-access")).toBe("alice");
      expect(host.service.current()?.accountId).toBe("alice");
      expect(JSON.stringify(stored)).not.toContain("account-access");
      await host.service.detach();
      expect(host.service.current()).toBeNull();
      expect(stored.at(-1)).toBeNull();
    } finally {
      host.close();
    }
  });
  it("does not restore an account after sign-out cancels an in-flight exchange", async () => {
    let finish!: (value: Response) => void;
    const host = await makeOtterAccountSession({
      ...options,
      fetch: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    try {
      const attaching = host.service.attach("old-token");
      await host.service.detach();
      finish(Response.json(suite("alice")));
      await expect(attaching).rejects.toThrow("cancelled");
      expect(host.service.current()).toBeNull();
    } finally {
      host.close();
    }
  });
  it("refreshes a grant without replacing the account used by running modules", async () => {
    const host = await makeOtterAccountSession({
      ...options,
      fetch: async (url) => {
        if (String(url).endsWith("/suite/session")) return Response.json(suite("alice"));
        throw new Error("offline");
      },
    });
    try {
      await host.service.attach("first");
      const account = host.service.current();
      const changed = vi.fn();
      host.service.subscribe(changed);
      await host.service.attach("renewed");
      expect(host.service.current()).toBe(account);
      expect(changed).not.toHaveBeenCalled();
    } finally {
      host.close();
    }
  });
});
