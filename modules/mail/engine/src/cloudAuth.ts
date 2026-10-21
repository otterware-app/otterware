import type { OtterAccountSession } from "./AccountSession.ts";
import type { GoogleAuth } from "./platform.ts";
import * as accountStore from "./services/account-store.ts";

/** Full Gmail access; Calendar-only sign-ins on this device can't read mail. */
const MAIL_SCOPE = "https://mail.google.com/";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Every Google account linked to the Otter Account is a mailbox here; it is signed in once this
 * device has authorized it for Mail. Token failures never fall back to a different grant.
 */
export function accountGoogleAuth(session: OtterAccountSession, local: GoogleAuth): GoogleAuth {
  let connections: Awaited<ReturnType<OtterAccountSession["connections"]>> = [];
  let linked: string[] = [];
  return {
    ...local,
    async load() {
      const google = (await session.connections()).filter((c) => c.provider === "google");
      connections = google.filter((c) => c.scopes.includes(MAIL_SCOPE));
      linked = session.linked
        ? (await session.linked()).map((account) => account.connection?.email ?? account.email)
        : connections.map((c) => c.email);
      for (const email of linked) {
        const existing = await accountStore.getAccount(email);
        await accountStore.addAccount({
          ...existing,
          id: email,
          email,
          name: existing?.name ?? email,
          provider: "gmail",
        });
      }
      if (!session.linked) return;
      // Unlinked on another device, which also forgot this device's grant: the mailbox goes.
      const { removeLocalAccount } = await import("./handlers/gmail.ts");
      for (const account of await accountStore.listAccounts())
        if (
          account.provider === "gmail" &&
          !linked.some((email) => same(email, account.email)) &&
          !google.some((c) => same(c.email, account.email))
        )
          await removeLocalAccount(account.id);
    },
    isSignedIn: (id) => connections.some((c) => same(c.email, id)),
    async addAccount(email) {
      const connection = connections.find((c) => !email || same(c.email, email));
      if (!connection) throw new Error("Allow Mail access to this Google account on this device.");
      const account = await accountStore.getAccount(connection.email);
      if (!account) throw new Error("Reload the environment's provider connections.");
      return account;
    },
    async getAccessToken(id) {
      const connection = connections.find((c) => same(c.email, id));
      if (!connection) throw new Error("Allow Mail access to this Google account on this device.");
      return (await session.providerToken(connection.id)).accessToken;
    },
    async getIdToken() {
      throw new Error("The host owns Otter Account identity.");
    },
    async removeTokens(id) {
      // Removing a mailbox unlinks its Google account from the Otter Account, on every device.
      // It never revokes Google's grant, which other devices' sign-ins share.
      if (session.unlink && linked.some((email) => same(email, id))) await session.unlink(id);
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
