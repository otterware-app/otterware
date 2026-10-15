import type { OtterAccountSession } from "./AccountSession.ts";
import type { GoogleAuth } from "./platform.ts";
import * as accountStore from "./services/account-store.ts";

/** Account connections are authoritative; token failures never fall back to a different grant. */
export function accountGoogleAuth(session: OtterAccountSession, local: GoogleAuth): GoogleAuth {
  let connections: Awaited<ReturnType<OtterAccountSession["connections"]>> = [];
  return {
    ...local,
    async load() {
      connections = await session.connections();
      for (const connection of connections.filter((c) => c.provider === "google")) {
        const existing = await accountStore.getAccount(connection.email);
        await accountStore.addAccount({
          ...existing,
          id: connection.email,
          email: connection.email,
          name: existing?.name ?? connection.email,
          provider: "gmail",
        });
      }
    },
    isSignedIn: (id) => connections.some((c) => c.provider === "google" && c.email === id),
    async addAccount(email) {
      const connection = connections.find(
        (c) => c.provider === "google" && (!email || c.email === email),
      );
      if (!connection) throw new Error("Connect a Google mailbox in the host's Account settings.");
      const account = await accountStore.getAccount(connection.email);
      if (!account) throw new Error("Reload the environment's provider connections.");
      return account;
    },
    async getAccessToken(id) {
      const connection = connections.find((c) => c.provider === "google" && c.email === id);
      if (!connection)
        throw new Error("This Google mailbox is not connected to the Otter Account.");
      return (await session.providerToken(connection.id)).accessToken;
    },
    async getIdToken() {
      throw new Error("The host owns Otter Account identity.");
    },
    async removeTokens() {
      /* Removing a local mailbox must not revoke another environment's account grant. */
    },
  };
}

/** Microsoft grants use the same host port; the imported engine has no Microsoft mail provider yet. */
export async function microsoftToken(session: OtterAccountSession, email: string): Promise<string> {
  const connection = (await session.connections()).find(
    (c) => c.provider === "microsoft" && c.email === email,
  );
  if (!connection) throw new Error("Microsoft account is not connected.");
  return (await session.providerToken(connection.id)).accessToken;
}

/** Outlook uses the host's Microsoft grant; revocation cannot fall back to a local token. */
export function accountMicrosoftAuth(
  session: OtterAccountSession,
): import("./platform.ts").MicrosoftAuth {
  let connections: Awaited<ReturnType<OtterAccountSession["connections"]>> = [];
  return {
    available: async () => true,
    async load() {
      connections = (await session.connections()).filter((c) => c.provider === "microsoft");
      for (const connection of connections) {
        const existing = await accountStore.getAccount(connection.email);
        if (existing && existing.provider !== "outlook") continue;
        await accountStore.addAccount({
          ...existing,
          id: connection.email,
          email: connection.email,
          name: existing?.name ?? connection.email,
          provider: "outlook",
        });
      }
    },
    async addAccount(email) {
      const connection = connections.find((c) => !email || c.email === email);
      if (!connection)
        throw new Error("Connect a Microsoft mailbox in the host's Account settings.");
      return { email: connection.email, name: connection.email };
    },
    isSignedIn: (id) => connections.some((c) => c.email === id),
    getAccessToken: (id) => microsoftToken(session, id),
    async getIdToken() {
      throw new Error("The host owns Otter Account identity.");
    },
    cancelSignIn() {},
    async removeTokens() {},
  };
}
