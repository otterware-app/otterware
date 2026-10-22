import { expect, it, vi } from "vite-plus/test";
import { accountGoogleAuth, accountMicrosoftAuth, microsoftToken } from "./cloudAuth.ts";
import type { OtterAccountSession } from "./AccountSession.ts";
import type { GoogleAuth } from "./platform.ts";
const mailboxes = vi.hoisted(
  () => new Map<string, { id: string; email: string; provider: string }>(),
);
const broadcast = vi.hoisted(() => vi.fn());
vi.mock("./ipc.ts", () => ({ broadcast }));
vi.mock("./services/account-store.ts", () => ({
  getAccount: async () => null,
  addAccount: async (account: { id: string; email: string; provider: string }) => {
    mailboxes.set(account.id, account);
  },
  listAccounts: async () => [...mailboxes.values()],
}));

it("uses account-scoped Google/Microsoft grants and does not silently fall back after a token failure", async () => {
  const localToken = vi.fn(async () => "local-token");
  const session: OtterAccountSession = {
    accountId: "user",
    connections: async () => [
      {
        id: "google",
        provider: "google",
        email: "g@example.test",
        scopes: ["https://mail.google.com/"],
        updatedAt: 1,
      },
      { id: "microsoft", provider: "microsoft", email: "m@example.test", scopes: [], updatedAt: 1 },
    ],
    providerToken: vi.fn(async (id) => ({
      connectionId: id,
      accessToken: `token-${id}`,
      expiresAt: 100,
      audience: "environment",
      scopes: [],
    })),
    push: async () => ({ records: [] }),
    pull: async () => ({ records: [], cursor: 0, hasMore: false }),
    subscribe: () => () => {},
  };
  const local = {
    load: async () => {
      throw new Error("Old local credentials unavailable");
    },
    getAccessToken: localToken,
  } as unknown as GoogleAuth;
  const google = accountGoogleAuth(session, local);
  const outlook = accountMicrosoftAuth(session);
  await outlook.load();
  expect(outlook.isSignedIn("m@example.test")).toBe(true);
  expect((await outlook.addAccount("m@example.test")).email).toBe("m@example.test");
  expect(await outlook.getAccessToken("m@example.test")).toBe("token-microsoft");
  await google.load();
  expect(await google.getAccessToken("g@example.test")).toBe("token-google");
  expect(await microsoftToken(session, "m@example.test")).toBe("token-microsoft");
  vi.mocked(session.providerToken).mockRejectedValue(new Error("Revoked"));
  await expect(google.getAccessToken("g@example.test")).rejects.toThrow("Revoked");
  expect(localToken).not.toHaveBeenCalled();
});

it("lists every linked Google account as a mailbox, signed in where this device allows Mail", async () => {
  mailboxes.clear();
  const unlink = vi.fn(async () => {});
  const calendarOnly = {
    id: "device:google:cal@example.test",
    provider: "google" as const,
    email: "cal@example.test",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    updatedAt: 1,
  };
  const session: OtterAccountSession = {
    accountId: "user",
    connections: async () => [calendarOnly],
    providerToken: async () => {
      throw new Error("unused");
    },
    push: async () => ({ records: [] }),
    pull: async () => ({ records: [], cursor: 0, hasMore: false }),
    subscribe: () => () => {},
    linked: async () => [
      { provider: "google", email: "cal@example.test", connection: calendarOnly },
      { provider: "google", email: "other@example.test", connection: null },
    ],
    unlink,
  };
  const google = accountGoogleAuth(session, {} as GoogleAuth);
  await google.load();
  expect([...mailboxes.keys()]).toEqual(["cal@example.test", "other@example.test"]);
  expect(google.isSignedIn("cal@example.test")).toBe(false);
  await expect(google.getAccessToken("cal@example.test")).rejects.toThrow("Allow Mail access");
  await google.removeTokens("other@example.test");
  expect(unlink).toHaveBeenCalledWith("other@example.test");
});

it("tells windows when a linked mailbox arrives after start, and only then", async () => {
  mailboxes.clear();
  broadcast.mockClear();
  let linked: Array<{ provider: "google"; email: string; connection: null }> = [];
  const session: OtterAccountSession = {
    accountId: "user",
    connections: async () => [],
    providerToken: async () => {
      throw new Error("unused");
    },
    push: async () => ({ records: [] }),
    pull: async () => ({ records: [], cursor: 0, hasMore: false }),
    subscribe: () => () => {},
    linked: async () => linked,
    unlink: async () => {},
  };
  const google = accountGoogleAuth(session, {} as GoogleAuth);
  await google.load();
  broadcast.mockClear();
  await google.load();
  expect(broadcast).not.toHaveBeenCalled();
  linked = [{ provider: "google", email: "new@example.test", connection: null }];
  await google.load();
  expect(broadcast).toHaveBeenCalledExactlyOnceWith("gmail:accounts-changed");
});
