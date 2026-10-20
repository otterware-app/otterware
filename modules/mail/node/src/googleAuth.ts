import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";
import { GMAIL_SCOPES } from "@otterware/mail-contracts";
import {
  accountStore,
  SignInCancelledError,
  type GoogleAuth,
  type Platform,
} from "@otterware/mail-engine";

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number; idToken?: string };
/** Local-only PKCE fallback. Account-connected environments use the host's providerToken instead. */
export function localGoogleAuth(options: {
  secrets: Platform["secrets"];
  clientId?: string;
  clientSecret?: string;
  authorize: (url: string) => Promise<void>;
}): GoogleAuth {
  let tokens: Record<string, Tokens> = {};
  let cancel: (() => void) | undefined;
  const save = () => options.secrets.set("google-tokens", JSON.stringify(tokens));
  const exchange = async (body: Record<string, string>) => {
    if (!options.clientId)
      throw new Error(
        "Connect Google through Otter Accounts or configure a local Google OAuth client.",
      );
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: options.clientId,
        ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
        ...body,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Google token exchange failed (${response.status}). Sign in again.`);
    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token?: string;
    };
  };
  const token = async (id: string, force = false) => {
    let current = tokens[id];
    if (!current) throw new Error("Sign in to this Google mailbox again.");
    if (force || current.expiresAt < Date.now() + 60_000) {
      const next = await exchange({
        grant_type: "refresh_token",
        refresh_token: current.refreshToken,
      });
      current = {
        accessToken: next.access_token,
        refreshToken: next.refresh_token ?? current.refreshToken,
        expiresAt: Date.now() + next.expires_in * 1000,
        idToken: next.id_token,
      };
      tokens[id] = current;
      await save();
    }
    return current;
  };
  return {
    async load() {
      tokens = JSON.parse((await options.secrets.get("google-tokens")) ?? "{}");
    },
    isSignedIn: (id) => id in tokens,
    getAccessToken: async (id, opts) => (await token(id, opts?.forceRefresh)).accessToken,
    async getIdToken(id) {
      const t = await token(id, true);
      if (!t.idToken) throw new Error("Google did not return an identity token.");
      return t.idToken;
    },
    async removeTokens(id) {
      delete tokens[id];
      await save();
    },
    cancelSignIn() {
      cancel?.();
    },
    async addAccount(loginHint) {
      if (!options.clientId)
        throw new Error(
          "Connect Google through Otter Accounts or configure a local Google OAuth client.",
        );
      cancel?.();
      const verifier = NodeCrypto.randomBytes(32).toString("base64url"),
        state = NodeCrypto.randomBytes(24).toString("base64url");
      let resolveCode!: (code: string) => void, rejectCode!: (reason: unknown) => void;
      const result = new Promise<string>((resolve, reject) => {
        resolveCode = resolve;
        rejectCode = reject;
      });
      // Attach rejection before any asynchronous browser handoff.
      void result.catch(() => {});
      const server = NodeHttp.createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/callback" || url.searchParams.get("state") !== state) {
          res.writeHead(400).end("Invalid OAuth callback");
          return;
        }
        const code = url.searchParams.get("code");
        res.writeHead(200, { "content-type": "text/plain" }).end("Return to Otter Mail.");
        if (code) resolveCode(code);
        else rejectCode(new SignInCancelledError());
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Could not open OAuth callback.");
      const redirect = `http://127.0.0.1:${address.port}/callback`;
      cancel = () => rejectCode(new SignInCancelledError());
      const timer = setTimeout(
        () => rejectCode(new Error("Google sign-in timed out.")),
        5 * 60_000,
      );
      try {
        const query = new URLSearchParams({
          client_id: options.clientId,
          redirect_uri: redirect,
          response_type: "code",
          scope: GMAIL_SCOPES.join(" "),
          access_type: "offline",
          prompt: "consent",
          state,
          code_challenge: NodeCrypto.createHash("sha256").update(verifier).digest("base64url"),
          code_challenge_method: "S256",
          ...(loginHint ? { login_hint: loginHint } : {}),
        });
        await options.authorize(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
        const grant = await exchange({
          grant_type: "authorization_code",
          code: await result,
          redirect_uri: redirect,
          code_verifier: verifier,
        });
        const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${grant.access_token}` },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error("Could not read Google account profile.");
        const user = (await response.json()) as { email: string; name?: string; picture?: string };
        if (!user.email || !grant.refresh_token)
          throw new Error("Google did not return a mailbox and offline grant.");
        const account = {
          id: user.email,
          email: user.email,
          name: user.name ?? user.email,
          picture: user.picture,
          provider: "gmail" as const,
        };
        tokens[account.id] = {
          accessToken: grant.access_token,
          refreshToken: grant.refresh_token,
          expiresAt: Date.now() + grant.expires_in * 1000,
          idToken: grant.id_token,
        };
        await save();
        await accountStore.addAccount(account);
        return account;
      } finally {
        clearTimeout(timer);
        cancel = undefined;
        server.closeAllConnections();
        server.close();
      }
    },
  };
}
