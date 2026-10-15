import { expect, it, vi } from "vite-plus/test";
import { accountGoogleAuth, accountMicrosoftAuth, microsoftToken } from "./cloudAuth.ts";
import type { OtterAccountSession } from "./AccountSession.ts";
import type { GoogleAuth } from "./platform.ts";
vi.mock("./services/account-store.ts", () => ({
  getAccount: async () => null,
  addAccount: async () => {},
}));

it("uses account-scoped Google/Microsoft grants and does not silently fall back after a token failure", async () => {
  const localToken = vi.fn(async () => "local-token");
  const session: OtterAccountSession = {
    accountId: "user",
    connections: async () => [
      { id: "google", provider: "google", email: "g@example.test", scopes: [], updatedAt: 1 },
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
