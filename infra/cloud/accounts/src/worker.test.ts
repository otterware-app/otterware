import * as NodeHttp from "node:http";
const { createServer } = NodeHttp;
type Server = NodeHttp.Server;
import * as NodeFS from "node:fs";
const { readFileSync, readdirSync } = NodeFS;

import { build } from "esbuild";
import { accountsLogoutPatch } from "../../scripts/bundle.ts";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, jwtVerify } from "jose";
import { beforeAll, afterAll, it, expect } from "vite-plus/test";

const accounts = "https://accounts.otterware.app";
const mail = "https://relay.mail.otterware.app";
const app = "https://mail.otterware.app";
const secret = "test-secret-that-is-long-enough-for-better-auth";
let runtime: Miniflare;
let google: Server;
let privateKey: CryptoKey;
let microsoftKey: CryptoKey;
let sequence = 0;
const lifecycle: string[] = [];
const googleCodes = new Map<string, string>();
const microsoftCodes = new Map<string, string>();
const emails: { to: string[]; subject: string; text: string; html: string }[] = [];
const PERSONAL_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "google", alg: "RS256" };
  const microsoftPair = await generateKeyPair("RS256");
  microsoftKey = microsoftPair.privateKey;
  const microsoftJwk = {
    ...(await exportJWK(microsoftPair.publicKey)),
    kid: "microsoft",
    alg: "RS256",
  };
  google = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => google.listen(0, "127.0.0.1", resolve));
  const googlePort = (google.address() as { port: number }).port;
  const accountsWorker = (name: string, extra: Record<string, string>) => ({
    name,
    modules: true,
    script: bundle.outputFiles[0]!.text,
    compatibilityDate: "2026-09-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "identity" },
    serviceBindings: { MAIL: { name: "mail", entrypoint: "Lifecycle" } },
    outboundService: async (request: Request) => {
      if (request.url === "https://www.googleapis.com/oauth2/v3/certs")
        return Response.json({ keys: [jwk] });
      if (request.url === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(await request.text());
        const token = googleCodes.get(body.get("code") ?? "");
        expect(body.get("client_id")).toBe("new-google-web");
        expect(body.get("client_secret")).toBe("new-test-secret");
        expect(body.get("redirect_uri")).toBe(`${mail}/v1/auth/callback/google`);
        expect(body.get("code_verifier")).toBeTruthy();
        return token
          ? Response.json({
              access_token: "fake-google-access",
              token_type: "Bearer",
              expires_in: 3600,
              id_token: token,
            })
          : Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      if (request.url === "https://login.microsoftonline.com/common/discovery/v2.0/keys")
        return Response.json({ keys: [microsoftJwk] });
      if (request.url === "https://login.microsoftonline.com/common/oauth2/v2.0/token") {
        const body = new URLSearchParams(await request.text());
        const token = microsoftCodes.get(body.get("code") ?? "");
        expect(body.get("client_id")).toBe("microsoft-test");
        expect(body.get("client_secret")).toBe("microsoft-secret");
        expect(body.get("redirect_uri")).toBe(`${accounts}/v1/auth/callback/microsoft`);
        return token
          ? Response.json({
              access_token: "fake-microsoft-access",
              token_type: "Bearer",
              expires_in: 3600,
              id_token: token,
            })
          : Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      if (request.url === "https://api.resend.com/emails") {
        expect(request.headers.get("authorization")).toBe("Bearer re_test");
        emails.push(await request.json());
        return Response.json({ id: `email-${emails.length}` });
      }
      if (new URL(request.url).origin === "https://relay.code.otterware.app") {
        lifecycle.push(
          JSON.stringify({
            code: request.headers.get("authorization"),
            path: new URL(request.url).pathname,
          }),
        );
        return new Response(null, { status: 204 });
      }
      if (new URL(request.url).origin === "https://drive.otterware.app") {
        lifecycle.push(
          JSON.stringify({ drive: await request.text(), path: new URL(request.url).pathname }),
        );
        return new Response(null, { status: 204 });
      }
      return fetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: request.body ? await request.arrayBuffer() : undefined,
      });
    },
    bindings: {
      BETTER_AUTH_URL: accounts,
      MAIL_AUTH_URL: mail,
      APP_ORIGIN: app,
      DRIVE_ORIGIN: "https://drive.otterware.app",
      SITE_ORIGIN: "https://otterware.app",
      COOKIE_DOMAIN: "mail.otterware.app",
      BETTER_AUTH_SECRET: secret,
      GOOGLE_CLIENT_ID: "google-test",
      GOOGLE_WEB_CLIENT_ID: "google-test",
      GOOGLE_WEB_CLIENT_SECRET: "test",
      GOOGLE_AUTH_CLIENT_ID: "new-google-web",
      GOOGLE_AUTH_CLIENT_SECRET: "new-test-secret",
      GOOGLE_LEGACY_CLIENT_IDS: "legacy-google-native",
      GOOGLE_CALENDAR_CLIENT_ID: "calendar-google",
      GOOGLE_OTTERWARE_CLIENT_ID: "suite-google",
      GOOGLE_JWKS_URL: `http://127.0.0.1:${googlePort}/jwks`,
      ...extra,
    },
  });
  const bundle = await build({
    entryPoints: [new URL("./worker.ts", import.meta.url).pathname],
    bundle: true,
    plugins: [accountsLogoutPatch],
    write: false,
    format: "esm",
    platform: "node",
    target: "es2023",
    external: ["cloudflare:workers", "node:*"],
    conditions: ["workerd", "worker", "browser"],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "test",
          modules: true,
          compatibilityDate: "2026-09-01",
          serviceBindings: { ACCOUNTS: "accounts", MAIL: "mail", PLAIN: "plain" },
          script: `export default { fetch(request, env) {
            const headers = new Headers(request.headers);
            const origin = headers.get('x-test-origin');
            if (origin) headers.set('origin', origin);
            headers.delete('x-test-origin');
            if (headers.has('x-test-mode')) headers.set('sec-fetch-mode', headers.get('x-test-mode'));
            headers.delete('x-test-mode');
            const target = headers.get('x-test-legacy') ? env.MAIL : headers.get('x-test-plain') ? env.PLAIN : env.ACCOUNTS;
            headers.delete('x-test-legacy');
            headers.delete('x-test-plain');
            return target.fetch(new Request(request, { headers }));
          } };`,
        },
        accountsWorker("accounts", {
          MICROSOFT_CLIENT_ID: "microsoft-test",
          MICROSOFT_CLIENT_SECRET: "microsoft-secret",
          RESEND_API_KEY: "re_test",
          EMAIL_FROM: "Otterware <noreply@otterware.app>",
        }),
        // The same Worker without Microsoft or email configured.
        accountsWorker("plain", {}),
        {
          name: "mail",
          modules: true,
          compatibilityDate: "2026-09-01",
          serviceBindings: {
            ACCOUNTS: { name: "accounts", entrypoint: "MailIdentity" },
            RECORD: async (req) => {
              lifecycle.push(await req.text());
              return new Response(null);
            },
          },
          script: `
      import { WorkerEntrypoint } from 'cloudflare:workers';
      export class Lifecycle extends WorkerEntrypoint {
        async disconnect(user, session) { await this.env.RECORD.fetch('http://record/', { method: 'POST', body: JSON.stringify({ user, session }) }); }
        async deleteUser(user) { await this.disconnect(user); }
      }
      export default { async fetch(request, env) {
        if (new URL(request.url).pathname === '/session') return Response.json(await env.ACCOUNTS.getSession(Object.fromEntries(request.headers)));
        return env.ACCOUNTS.fetch(request);
      } };
    `,
        },
      ],
    }),
  );
  const db = await runtime.getD1Database("DB", "accounts");
  for (const name of readdirSync(new URL("../migrations", import.meta.url)).sort()) {
    const statements = readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8")
      .replace(/^\s*--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(statements.map((sql) => db.prepare(sql)));
  }
}, 60_000);

afterAll(async () => {
  await runtime?.dispose();
  google?.close();
});

async function request(path: string, init?: RequestInit, legacy = false) {
  const worker = await runtime.getWorker("test");
  const headers = new Headers(init?.headers);
  if (headers.has("origin")) {
    headers.set("x-test-origin", headers.get("origin")!);
    headers.delete("origin");
  }
  if (headers.has("sec-fetch-mode")) headers.set("x-test-mode", headers.get("sec-fetch-mode")!);
  if (legacy) headers.set("x-test-legacy", "1");
  return worker.fetch(`${legacy ? mail : accounts}${path}`, {
    redirect: "manual",
    ...init,
    headers: Object.fromEntries(headers),
  } as Parameters<typeof worker.fetch>[1]);
}
function json(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}
type TestResponse = Awaited<ReturnType<typeof request>>;
function cookies(response: TestResponse) {
  return response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
}
async function signIn(
  legacy = false,
  email = `test-${++sequence}@otter.example`,
  audience = "google-test",
) {
  const token = await new SignJWT({ email, email_verified: true, name: "Example" })
    .setProtectedHeader({ alg: "RS256", kid: "google" })
    .setIssuer("https://accounts.google.com")
    .setAudience(audience)
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
  const response = await request(
    "/v1/auth/sign-in/social",
    json({ provider: "google", idToken: { token } }),
    legacy,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return {
    response,
    cookie: cookies(response),
    ...((await response.json()) as { token: string; user: { id: string; email: string } }),
  };
}
async function redirect(response: TestResponse) {
  if (response.status === 200) return ((await response.json()) as { url: string }).url;
  expect(response.status, await response.clone().text()).toBe(302);
  return response.headers.get("location")!;
}

it("preserves the account and existing sessions across Google OAuth projects", async () => {
  const original = await signIn(true, "project-migration@otter.example", "legacy-google-native");
  const current = await signIn(false, original.user.email, "new-google-web");
  expect(current.user.id).toBe(original.user.id);
  const calendar = await signIn(false, original.user.email, "calendar-google");
  expect(calendar.user.id).toBe(original.user.id);
  const session = await request(
    "/session",
    { headers: { authorization: `Bearer ${original.token}` } },
    true,
  );
  expect(await session.json()).toMatchObject({ user: { id: original.user.id } });
});

it("publishes the neutral issuer with isolated cookies and no public RPC routes", async () => {
  const config = await (await request("/v1/auth/.well-known/openid-configuration")).json();
  expect(config).toMatchObject({
    issuer: `${accounts}/v1/auth`,
    code_challenge_methods_supported: ["S256"],
  });
  const user = await signIn();
  expect(user.response.headers.get("set-cookie")).not.toContain("Domain=");
  expect(user.cookie).toContain("__Host-otter-accounts.session_token=");
  expect((await request("/mail/start", json({}))).status).toBe(404);
});

it("keeps native Mail credentials, cookie names, and user IDs compatible", async () => {
  const native = await signIn(true, "existing@otter.example");
  expect(native.response.headers.get("set-cookie")).toContain("Domain=mail.otterware.app");
  const session = await request(
    "/session",
    { headers: { authorization: `Bearer ${native.token}` } },
    true,
  );
  expect(await session.json()).toMatchObject({ user: { id: native.user.id } });
  const browser = await signIn(false, "existing@otter.example");
  expect(browser.user.id).toBe(native.user.id);
  expect(
    await (await request("/session", { headers: { cookie: native.cookie } }, true)).json(),
  ).toMatchObject({ user: { id: native.user.id } });
});

it("uses central OIDC for Mail browser sign-in and validates state before issuing a Mail cookie", async () => {
  const signed = await signIn();
  const started = await request(
    "/v1/auth/sign-in/social",
    json({ provider: "google", callbackURL: `${app}/app` }, { origin: app }),
    true,
  );
  expect(started.status, await started.clone().text()).toBe(200);
  const stateCookies = cookies(started);
  const url = new URL(((await started.json()) as { url: string }).url);
  expect(url.origin).toBe(accounts);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  const authorized = await request(`${url.pathname}${url.search}`, {
    headers: { cookie: signed.cookie, accept: "text/html" },
  });
  const callback = new URL(await redirect(authorized));
  const rejected = await request(`${callback.pathname}${callback.search}`, undefined, true);
  expect(rejected.status).toBe(400);
  const completed = await request(
    `${callback.pathname}${callback.search}`,
    { headers: { cookie: stateCookies } },
    true,
  );
  expect(completed.status, await completed.clone().text()).toBe(302);
  expect(completed.headers.get("location")).toBe(`${app}/app`);
  expect(completed.headers.get("set-cookie")).toContain("Domain=mail.otterware.app");
  const mailSession = await request("/session", { headers: { cookie: cookies(completed) } }, true);
  expect(await mailSession.json()).toMatchObject({ user: { id: signed.user.id } });
  expect(
    (
      await request(
        `${callback.pathname}${callback.search}`,
        { headers: { cookie: stateCookies } },
        true,
      )
    ).status,
  ).toBe(400);
});

it("keeps Google's registered callback while returning new flows to their state cookie", async () => {
  const started = await request(
    "/v1/auth/sign-in/social",
    json(
      { provider: "google", callbackURL: `${accounts}/otter/account`, disableRedirect: true },
      { origin: accounts },
    ),
  );
  const url = new URL(((await started.json()) as { url: string }).url);
  expect(url.searchParams.get("redirect_uri")).toBe(`${mail}/v1/auth/callback/google`);
  const route = `/v1/auth/callback/google?state=${url.searchParams.get("state")}&error=access_denied`;
  const returned = await request(route, undefined, true);
  expect(returned.headers.get("location")).toBe(`${accounts}${route}`);
  const failed = await request(route, { headers: { cookie: cookies(started) } });
  expect(failed.headers.get("location")).toContain("error=access_denied");
});

it("issues Drive tokens under the central issuer and rejects invalid redirects and PKCE", async () => {
  const signed = await signIn();
  const verifier = "x".repeat(64);
  const challenge = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  ).toString("base64url");
  const query = new URLSearchParams({
    client_id: "otter-drive",
    redirect_uri: "https://drive.otterware.app/api/auth/callback/otter",
    response_type: "code",
    scope: "openid profile email",
    state: "state",
    nonce: "nonce",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const authorization = await request(`/v1/auth/oauth2/authorize?${query}`, {
    headers: { cookie: signed.cookie },
  });
  const callback = new URL(await redirect(authorization));
  const response = await request("/v1/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "otter-drive",
      redirect_uri: query.get("redirect_uri")!,
      grant_type: "authorization_code",
      code: callback.searchParams.get("code")!,
      code_verifier: verifier,
    }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  const { id_token } = (await response.json()) as { id_token: string };
  const keys = (await (await request("/v1/auth/jwks")).json()) as Parameters<
    typeof createLocalJWKSet
  >[0];
  expect(
    (
      await jwtVerify(id_token, createLocalJWKSet(keys), {
        issuer: `${accounts}/v1/auth`,
        audience: "otter-drive",
      })
    ).payload,
  ).toMatchObject({ sub: signed.user.id, nonce: "nonce" });
  const oldDelete = await request(
    "/v1/auth/delete-user",
    json({}, { authorization: `Bearer ${signed.token}` }),
    true,
  );
  expect(oldDelete.status).toBe(403);
  query.set("redirect_uri", "https://usercontent.otterware.app/callback");
  expect(
    await redirect(
      await request(`/v1/auth/oauth2/authorize?${query}`, { headers: { cookie: signed.cookie } }),
    ),
  ).not.toContain("https://usercontent.otterware.app");
  // Exercise the actual Worker fetch implementation, not a Node-only mock.
  // Cloudflare rejects redirect: "error" before dispatching the notification.
  const before = lifecycle.length;
  expect(
    (await request("/v1/auth/sign-out", json({}, { cookie: signed.cookie, origin: accounts })))
      .status,
  ).toBe(200);
  const notification = lifecycle
    .slice(before)
    .map((value) => JSON.parse(value) as { drive?: string })
    .find((value) => value.drive);
  expect(notification).toBeDefined();
  const logoutToken = new URLSearchParams(notification!.drive).get("logout_token")!;
  const { payload } = await jwtVerify(logoutToken, createLocalJWKSet(keys), {
    issuer: `${accounts}/v1/auth`,
    audience: "otter-drive",
  });
  expect(payload.sub).toBe(signed.user.id);
  expect(payload.sid).toBeTypeOf("string");
  expect(payload.events).toEqual({ "http://schemas.openid.net/event/backchannel-logout": {} });
});

it("rejects untrusted Mail callbacks and content-origin sign-in", async () => {
  expect(
    (
      await request(
        "/v1/auth/sign-in/social",
        json({ provider: "google", callbackURL: "https://evil.example" }, { origin: app }),
        true,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        "/v1/auth/sign-in/social",
        json({ provider: "google" }, { origin: "https://usercontent.otterware.app" }),
        true,
      )
    ).status,
  ).toBe(403);
});

it("revokes existing Mail sessions and notifies Mail's private lifecycle endpoint", async () => {
  const signed = await signIn(true);
  const response = await request(
    "/v1/auth/sign-out",
    json({}, { authorization: `Bearer ${signed.token}` }),
    true,
  );
  expect(response.status).toBe(200);
  expect(
    await (
      await request("/session", { headers: { authorization: `Bearer ${signed.token}` } }, true)
    ).json(),
  ).toBeNull();
  expect(lifecycle.some((event) => JSON.parse(event).user === signed.user.id)).toBe(true);
});

it("requires same-origin confirmation and deletes the identity and Mail sessions together", async () => {
  const signed = await signIn();
  const native = await signIn(true, signed.user.email);
  expect(
    (
      await request(
        "/otter/delete-account",
        json({ confirmation: "DELETE" }, { cookie: signed.cookie }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/otter/delete-account",
        json({ confirmation: "wrong" }, { cookie: signed.cookie, origin: accounts }),
      )
    ).status,
  ).toBe(400);
  const deleted = await request(
    "/otter/delete-account",
    json({ confirmation: "DELETE" }, { cookie: signed.cookie, origin: accounts }),
  );
  expect(deleted.status, await deleted.clone().text()).toBe(200);
  expect(
    await (
      await request("/session", { headers: { authorization: `Bearer ${native.token}` } }, true)
    ).json(),
  ).toBeNull();
  const db = await runtime.getD1Database("DB", "accounts");
  expect(
    await db.prepare("SELECT id FROM user WHERE id=?").bind(signed.user.id).first(),
  ).toBeNull();
  expect(lifecycle.some((event) => JSON.parse(event).user === signed.user.id)).toBe(true);
});

function form(app: string, origin: string, cookie = "", authorization?: string): RequestInit {
  return {
    method: "POST",
    headers: {
      origin,
      cookie,
      ...(authorization ? { authorization } : {}),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ app }),
  };
}

it("only tells trusted app origins whether the browser has an Accounts session", async () => {
  const signed = await signIn();
  for (const origin of [app, "https://drive.otterware.app", "https://otterware.app"]) {
    const response = await request("/otter/session", {
      headers: { origin, cookie: signed.cookie },
    });
    expect(await response.json()).toEqual({ signedIn: true });
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await (await request("/otter/session", { headers: { origin } })).json()).toEqual({
      signedIn: false,
    });
  }
  for (const origin of ["https://usercontent.otterware.app", "https://evil.example", ""]) {
    const response = await request("/otter/session", {
      headers: { origin, cookie: signed.cookie },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  }
});

it("ends current Accounts and legacy Mail browser sessions while preserving other devices", async () => {
  const signed = await signIn();
  const legacy = await signIn(true, signed.user.email);
  const native = await signIn(true, signed.user.email);
  const start = await request(
    "/v1/auth/browser-sign-out/start",
    form("mail", app, legacy.cookie),
    true,
  );
  expect(start.status).toBe(200);
  expect(start.headers.get("referrer-policy")).toBe("strict-origin");
  expect(await start.text()).toContain(`action="${accounts}/otter/sign-out"`);
  const central = await request(
    "/otter/sign-out",
    form("mail", mail, signed.cookie, `Bearer ${native.token}`),
  );
  expect(central.status).toBe(200);
  expect(central.headers.get("referrer-policy")).toBe("strict-origin");
  expect(central.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await central.text()).toContain(`action="${mail}/v1/auth/browser-sign-out"`);
  expect(
    await (
      await request("/otter/session", { headers: { origin: app, cookie: signed.cookie } })
    ).json(),
  ).toEqual({ signedIn: false });
  const finish = await request(
    "/v1/auth/browser-sign-out",
    form("mail", accounts, legacy.cookie),
    true,
  );
  expect(finish.status).toBe(200);
  expect(finish.headers.get("referrer-policy")).toBe("strict-origin");
  expect(finish.headers.get("content-security-policy")).toContain(
    `form-action https://drive.otterware.app ${app};`,
  );
  expect(await finish.text()).toContain(
    'action="https://drive.otterware.app/api/auth/browser-sign-out"',
  );
  expect(
    await (await request("/session", { headers: { cookie: legacy.cookie } }, true)).json(),
  ).toBeNull();
  expect(
    await (
      await request("/session", { headers: { authorization: `Bearer ${native.token}` } }, true)
    ).json(),
  ).toMatchObject({ user: { id: signed.user.id } });
  // Idempotent hops also clear cookies when the user was not signed into an app.
  expect(
    (await request("/otter/sign-out", form("drive", "https://drive.otterware.app"))).status,
  ).toBe(200);
  expect((await request("/v1/auth/browser-sign-out", form("drive", accounts), true)).status).toBe(
    200,
  );
});

it("rejects forged browser logout, unknown destinations and GET without ending sessions", async () => {
  const signed = await signIn();
  for (const origin of ["https://usercontent.otterware.app", "https://evil.example", ""]) {
    expect((await request("/otter/sign-out", form("drive", origin, signed.cookie))).status).toBe(
      403,
    );
    expect(
      (await request("/v1/auth/browser-sign-out/start", form("mail", origin), true)).status,
    ).toBe(403);
    expect((await request("/v1/auth/browser-sign-out", form("mail", origin), true)).status).toBe(
      403,
    );
  }
  expect(
    (await request("/otter/sign-out", form("https://evil.example", app, signed.cookie))).status,
  ).toBe(400);
  expect((await request("/otter/sign-out", { headers: { cookie: signed.cookie } })).status).toBe(
    404,
  );
  expect(
    await (
      await request("/otter/session", { headers: { origin: app, cookie: signed.cookie } })
    ).json(),
  ).toEqual({ signedIn: true });
});

it("returns a new Google browser sign-in to the original Mail deep link", async () => {
  const destination = `${app}/all/inbox?from=login#message`;
  const started = await request(
    "/v1/auth/sign-in/social",
    json({ provider: "google", callbackURL: destination }, { origin: app }),
    true,
  );
  const authorize = new URL(((await started.json()) as { url: string }).url);
  const login = new URL(
    await redirect(
      await request(authorize.pathname + authorize.search, { headers: { accept: "text/html" } }),
    ),
  );
  expect(login.pathname).toBe("/otter/sign-in");
  const beginGoogle = await request(
    "/v1/auth/sign-in/social",
    json(
      {
        provider: "google",
        callbackURL: `${accounts}/otter/account`,
        errorCallbackURL: login.href,
        disableRedirect: true,
        oauth_query: login.search.slice(1),
      },
      { origin: accounts },
    ),
  );
  expect(beginGoogle.status, await beginGoogle.clone().text()).toBe(200);
  const googleUrl = new URL(((await beginGoogle.json()) as { url: string }).url);
  const code = `fake-google-code-${++sequence}`;
  const email = `browser-${sequence}@otter.example`;
  googleCodes.set(
    code,
    await new SignJWT({ email, email_verified: true, name: "Browser Example" })
      .setProtectedHeader({ alg: "RS256", kid: "google" })
      .setIssuer("https://accounts.google.com")
      .setAudience("google-test")
      .setSubject(email)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey),
  );
  const googleCallback = `/v1/auth/callback/google?state=${googleUrl.searchParams.get("state")}&code=${code}`;
  const relayCallback = await request(googleCallback, undefined, true);
  expect(relayCallback.headers.get("location")).toBe(accounts + googleCallback);
  const signed = await request(googleCallback, {
    headers: { cookie: cookies(beginGoogle), accept: "text/html", "sec-fetch-mode": "navigate" },
  });
  const mailCallback = new URL(await redirect(signed));
  expect(mailCallback.origin, mailCallback.href).toBe(mail);
  expect(mailCallback.searchParams.has("code")).toBe(true);
  const completed = await request(
    mailCallback.pathname + mailCallback.search,
    { headers: { cookie: cookies(started) } },
    true,
  );
  expect(completed.headers.get("location")).toBe(destination);
  const identity = await (
    await request("/session", { headers: { cookie: cookies(completed) } }, true)
  ).json();
  expect(identity).toMatchObject({ user: { email } });
  const status = await request("/otter/session", {
    headers: { origin: app, cookie: cookies(signed) },
  });
  expect(await status.json()).toEqual({ signedIn: true });
  const welcome = await request("/otter/sign-in", { headers: { cookie: cookies(signed) } });
  expect(welcome.headers.get("location")).toBe("/otter/account");
});

it("returns Google cancellation to the branded page with a retryable app request", async () => {
  const started = await request(
    "/v1/auth/sign-in/social",
    json({ provider: "google", callbackURL: `${app}/app` }, { origin: app }),
    true,
  );
  const authorize = new URL(((await started.json()) as { url: string }).url);
  const login = new URL(
    await redirect(
      await request(authorize.pathname + authorize.search, { headers: { accept: "text/html" } }),
    ),
  );
  const body = {
    provider: "google",
    callbackURL: `${accounts}/otter/account`,
    errorCallbackURL: login.href,
    disableRedirect: true,
    oauth_query: login.search.slice(1),
  };
  const begun = await request("/v1/auth/sign-in/social", json(body, { origin: accounts }));
  const googleUrl = new URL(((await begun.json()) as { url: string }).url);
  const cancelled = await request(
    `/v1/auth/callback/google?state=${googleUrl.searchParams.get("state")}&error=access_denied`,
    { headers: { cookie: cookies(begun) } },
  );
  const retry = new URL(cancelled.headers.get("location")!);
  expect(retry.origin).toBe(accounts);
  expect(retry.pathname).toBe("/otter/sign-in");
  expect(retry.searchParams.get("client_id")).toBe("otter-mail");
  const page = await request(retry.pathname + retry.search);
  expect(await page.text()).toContain("Sign-in was cancelled.");
  const second = await request("/v1/auth/sign-in/social", json(body, { origin: accounts }));
  expect(second.status, await second.clone().text()).toBe(200);
});

async function codeTokens(
  client = "otter-code-web",
  redirectUri = "https://code.otterware.app/account/callback",
  origin = "https://code.otterware.app",
) {
  const signed = await signIn();
  const verifier = "c".repeat(64);
  const challenge = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  ).toString("base64url");
  const resource = "https://relay.code.otterware.app";
  const query = new URLSearchParams({
    client_id: client,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email offline_access",
    resource,
    state: "code-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const authorization = await request(`/v1/auth/oauth2/authorize?${query}`, {
    headers: { cookie: signed.cookie },
  });
  const callback = new URL(await redirect(authorization));
  expect(callback.searchParams.get("state")).toBe("code-state");
  expect(callback.searchParams.get("code"), callback.href).toBeTruthy();
  const response = await request("/v1/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin },
    body: new URLSearchParams({
      client_id: client,
      redirect_uri: redirectUri,
      resource,
      grant_type: "authorization_code",
      code: callback.searchParams.get("code")!,
      code_verifier: verifier,
    }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
  return {
    signed,
    ...((await response.json()) as { access_token: string; refresh_token: string }),
  };
}

it("signs Code in with the canonical identity, rotates refresh credentials and checks revocation", async () => {
  const tokens = await codeTokens();
  const session = await request("/v1/auth/code/session", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(session.status, await session.clone().text()).toBe(200);
  expect(await session.json()).toMatchObject({
    id: tokens.signed.user.id,
    email: tokens.signed.user.email,
  });
  const rotated = await request("/v1/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "otter-code-web",
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      resource: "https://relay.code.otterware.app",
    }),
  });
  expect(rotated.status, await rotated.clone().text()).toBe(200);
  expect(await rotated.json()).toMatchObject({
    token_type: "Bearer",
    refresh_token: expect.any(String),
  });
  await request("/v1/auth/sign-out", json({}, { cookie: tokens.signed.cookie, origin: accounts }));
  expect(
    (
      await request("/v1/auth/code/session", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      })
    ).status,
  ).toBe(401);
});

it("accepts exact native Code callbacks and rejects a Mail session as a Code API token", async () => {
  for (const uri of [
    "ottercode://account/callback",
    "ottercode-dev://account/callback",
    "ottercode-preview://account/callback",
  ]) {
    const tokens = await codeTokens("otter-code-mobile", uri);
    expect(
      (
        await request("/v1/auth/code/session", {
          headers: { authorization: `Bearer ${tokens.access_token}` },
        })
      ).status,
    ).toBe(200);
  }
  const desktop = await codeTokens("otter-code-desktop", "http://127.0.0.1:45678/callback");
  expect(desktop.refresh_token).toBeTruthy();
  const mailSession = await signIn(true);
  expect(
    (
      await request("/v1/auth/code/session", {
        headers: { authorization: `Bearer ${mailSession.token}` },
      })
    ).status,
  ).toBe(401);
});

it("approves a headless Code server and binds its OAuth token to the relay", async () => {
  const signed = await signIn();
  const resource = "https://relay.code.otterware.app";
  const requested = await request("/v1/auth/device/code", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "otter-code-cli",
      scope: "openid profile email offline_access",
      resource,
    }),
  });
  expect(requested.status, await requested.clone().text()).toBe(200);
  const device = (await requested.json()) as {
    device_code: string;
    user_code: string;
    verification_uri_complete: string;
  };
  expect(device.verification_uri_complete).toContain("/otter/device");
  const review = await request(`/otter/device?user_code=${device.user_code}`, {
    headers: { cookie: signed.cookie },
  });
  expect(review.status, await review.clone().text()).toBe(200);
  expect(await review.text()).toContain(signed.user.email);
  const approval = await request(
    "/v1/auth/device/approve",
    json({ userCode: device.user_code }, { cookie: signed.cookie, origin: accounts }),
  );
  expect(approval.status, await approval.clone().text()).toBe(200);
  const redeemed = await request("/v1/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "otter-code-cli",
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      resource,
    }),
  });
  expect(redeemed.status, await redeemed.clone().text()).toBe(200);
  const tokens = (await redeemed.json()) as { access_token: string; refresh_token: string };
  expect(tokens.refresh_token).toBeTruthy();
  expect(
    await (
      await request("/v1/auth/code/session", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      })
    ).json(),
  ).toMatchObject({ id: signed.user.id });
  const deleted = await request(
    "/otter/delete-account",
    json({ confirmation: "DELETE" }, { cookie: signed.cookie, origin: accounts }),
  );
  expect(deleted.status, await deleted.clone().text()).toBe(200);
  expect(lifecycle.some((event) => event.includes('"code":'))).toBe(true);
  expect(
    (
      await request("/v1/auth/code/session", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      })
    ).status,
  ).toBe(401);
});
it("allows public token and identity requests from local Code browsers without granting cookies", async () => {
  const preflight = await request("/v1/auth/oauth2/token", {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:5733",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  expect(preflight.headers.has("access-control-allow-credentials")).toBe(false);
  const tokens = await codeTokens("otter-code-web", undefined, "http://localhost:5733");
  const revoked = await request("/v1/auth/oauth2/revoke", {
    method: "POST",
    headers: {
      origin: "http://localhost:5733",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ client_id: "otter-code-web", token: tokens.refresh_token }),
  });
  expect(revoked.status, await revoked.clone().text()).toBe(200);
  expect(revoked.headers.get("access-control-allow-origin")).toBe("*");
  const invalid = await request("/v1/auth/oauth2/token", {
    method: "POST",
    headers: {
      origin: "https://code.otterware.app",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: "otter-code-web",
      grant_type: "authorization_code",
      code: "invalid-code",
      code_verifier: "c".repeat(64),
    }),
  });
  expect(invalid.status).toBe(400);
  expect(invalid.headers.get("access-control-allow-origin")).toBe("*");
});

it("revokes Code OAuth access when the native client signs out of its grant", async () => {
  const tokens = await codeTokens("otter-code-mobile", "ottercode://account/callback");
  const revoked = await request("/v1/auth/oauth2/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "otter-code-mobile",
      token: tokens.refresh_token,
      token_type_hint: "refresh_token",
    }),
  });
  expect(revoked.status, await revoked.clone().text()).toBe(200);
  expect(
    (
      await request("/v1/auth/code/session", {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      })
    ).status,
  ).toBe(401);
  expect(
    (await request("/otter/session", { headers: { origin: app, cookie: tokens.signed.cookie } }))
      .status,
  ).toBe(200);
});

it("accepts Otterware's Google client without changing the standalone clients", async () => {
  await signIn(true, "suite-google@otter.example", "suite-google");
});

const DAY_MS = 24 * 60 * 60 * 1000;

async function suiteCredential(accessToken: string) {
  const response = await request(
    "/v1/auth/suite/session",
    json({}, { authorization: `Bearer ${accessToken}` }),
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as { token: string; expiresAt: number; user: { id: string } };
}

async function codeGrant(userId: string) {
  const db = await runtime.getD1Database("DB", "accounts");
  const grant = await db
    .prepare(
      "SELECT id, authorization_code_id, expires_at FROM oauth_refresh_token WHERE user_id=? AND revoked IS NULL",
    )
    .bind(userId)
    .first<{ id: string; authorization_code_id: string; expires_at: number }>();
  expect(grant).not.toBeNull();
  return grant!;
}

it("derives a separate Mail-compatible device session from Code and revokes it with that grant", async () => {
  const tokens = await codeTokens();
  const exchange = () =>
    request("/v1/auth/suite/session", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
  const response = await exchange();
  expect(response.status, await response.clone().text()).toBe(200);
  const device = (await response.json()) as {
    token: string;
    user: { id: string };
    expiresAt: number;
  };
  expect(device.user.id).toBe(tokens.signed.user.id);
  expect(device.token).not.toBe(tokens.signed.token);
  expect(device.token).not.toBe(tokens.access_token);
  expect(device.expiresAt).toBe((await codeGrant(tokens.signed.user.id)).expires_at);
  expect(device.expiresAt).toBeGreaterThan(Date.now() + DAY_MS);
  expect(await (await exchange()).json()).toMatchObject({ token: device.token });
  const me = () =>
    request("/session", { headers: { authorization: `Bearer ${device.token}` } }, true);
  expect(await (await me()).json()).toMatchObject({ user: { id: tokens.signed.user.id } });
  const denied = await request("/v1/auth/suite/session", {
    method: "POST",
    headers: { authorization: `Bearer ${tokens.signed.token}`, "content-type": "application/json" },
    body: "{}",
  });
  expect(denied.status).toBe(401);
  const revoked = await request("/v1/auth/oauth2/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "otter-code-web",
      token: tokens.refresh_token,
      token_type_hint: "refresh_token",
    }),
  });
  expect(revoked.status, await revoked.clone().text()).toBe(200);
  expect(await (await me()).json()).toBeNull();
  const db = await runtime.getD1Database("DB", "accounts");
  expect(
    await db.prepare("SELECT id FROM session WHERE token=?").bind(device.token).first(),
  ).toBeNull();
  expect((await exchange()).status).toBe(401);
  expect(
    await (
      await request(
        "/session",
        { headers: { authorization: `Bearer ${tokens.signed.token}` } },
        true,
      )
    ).json(),
  ).not.toBeNull();
});

it("keeps the derived session usable across Code refresh rotation and revokes the current family", async () => {
  const tokens = await codeTokens();
  const db = await runtime.getD1Database("DB", "accounts");
  const originalGrant = await codeGrant(tokens.signed.user.id);
  const originalExpiry = Date.now() + 3 * DAY_MS;
  await db
    .prepare("UPDATE oauth_refresh_token SET expires_at=? WHERE id=?")
    .bind(originalExpiry, originalGrant.id)
    .run();
  const derived = await request(
    "/v1/auth/suite/session",
    json({}, { authorization: `Bearer ${tokens.access_token}` }),
  );
  expect(derived.status, await derived.clone().text()).toBe(200);
  const device = (await derived.json()) as { token: string; expiresAt: number };
  expect(device.expiresAt).toBe(originalExpiry);
  const refresh = await request("/v1/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "otter-code-web",
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      resource: "https://relay.code.otterware.app",
    }),
  });
  expect(refresh.status, await refresh.clone().text()).toBe(200);
  const rotated = (await refresh.json()) as { access_token: string; refresh_token: string };
  const currentGrant = await codeGrant(tokens.signed.user.id);
  expect(currentGrant.id).not.toBe(originalGrant.id);
  expect(currentGrant.authorization_code_id).toBe(originalGrant.authorization_code_id);
  expect(currentGrant.expires_at).toBeGreaterThan(originalExpiry);
  expect(
    await db
      .prepare("SELECT revoked FROM oauth_refresh_token WHERE id=?")
      .bind(originalGrant.id)
      .first(),
  ).toMatchObject({ revoked: expect.any(Number) });
  expect(
    await (
      await request("/v1/auth/get-session", {
        headers: { authorization: `Bearer ${device.token}` },
      })
    ).json(),
  ).toMatchObject({ session: { expiresAt: new Date(originalExpiry).toISOString() } });
  const reused = await request(
    "/v1/auth/suite/session",
    json({}, { authorization: `Bearer ${rotated.access_token}` }),
  );
  expect(await reused.json()).toMatchObject({ token: device.token, expiresAt: originalExpiry });
  await db
    .prepare("UPDATE session SET expires_at=? WHERE token=?")
    .bind(Date.now() + 60_000, device.token)
    .run();
  const replacement = await suiteCredential(rotated.access_token);
  expect(replacement.token).not.toBe(device.token);
  expect(replacement.expiresAt).toBe(currentGrant.expires_at);
  const revoked = await request("/v1/auth/oauth2/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "otter-code-web",
      token: rotated.refresh_token,
      token_type_hint: "refresh_token",
    }),
  });
  expect(revoked.status, await revoked.clone().text()).toBe(200);
  expect(
    await (
      await request("/session", { headers: { authorization: `Bearer ${replacement.token}` } }, true)
    ).json(),
  ).toBeNull();
});

it("does not slide the derived native credential beyond its capped grant lifetime", async () => {
  const tokens = await codeTokens();
  const response = await request(
    "/v1/auth/suite/session",
    json({}, { authorization: `Bearer ${tokens.access_token}` }),
  );
  const device = (await response.json()) as { token: string; expiresAt: number };
  const me = await request(
    "/session",
    { headers: { authorization: `Bearer ${device.token}` } },
    true,
  );
  const current = (await me.json()) as { session: { expiresAt: string } };
  expect(new Date(current.session.expiresAt).getTime()).toBe(device.expiresAt);
});

it.each([4, 90])(
  "bounds the suite credential by a %i-day grant and the 30-day cap",
  async (days) => {
    const tokens = await codeTokens();
    const db = await runtime.getD1Database("DB", "accounts");
    const grant = await codeGrant(tokens.signed.user.id);
    const grantExpiry = Date.now() + days * DAY_MS;
    await db
      .prepare("UPDATE oauth_refresh_token SET expires_at=? WHERE id=?")
      .bind(grantExpiry, grant.id)
      .run();
    const before = Date.now();
    const device = await suiteCredential(tokens.access_token);
    const after = Date.now();
    if (days < 30) expect(device.expiresAt).toBe(grantExpiry);
    else {
      expect(device.expiresAt).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
      expect(device.expiresAt).toBeLessThanOrEqual(after + 30 * DAY_MS);
      expect(device.expiresAt).toBeLessThan(grantExpiry);
    }
    await db
      .prepare("UPDATE oauth_access_token SET expires_at=? WHERE user_id=?")
      .bind(Date.now() - 1000, tokens.signed.user.id)
      .run();
    expect(
      await (
        await request("/v1/auth/get-session", {
          headers: { authorization: `Bearer ${device.token}` },
        })
      ).json(),
    ).toMatchObject({ user: { id: tokens.signed.user.id } });
  },
);

it("uses the latest live refresh row even when older or revoked rows expire later", async () => {
  const tokens = await codeTokens();
  const db = await runtime.getD1Database("DB", "accounts");
  const grant = await codeGrant(tokens.signed.user.id);
  const now = Date.now();
  const latestExpiry = now + 5 * DAY_MS;
  for (const [id, expiresAt, createdAt, revoked] of [
    ["latest", latestExpiry, now + 1000, null],
    ["revoked", now + 90 * DAY_MS, now + 2000, now],
    ["expired", now - 1000, now + 3000, null],
  ] as const) {
    await db
      .prepare(`INSERT INTO oauth_refresh_token
      (id, token, client_id, user_id, authorization_code_id, scopes, expires_at, created_at, revoked)
      SELECT ?, ?, client_id, user_id, authorization_code_id, scopes, ?, ?, ?
      FROM oauth_refresh_token WHERE id=?`)
      .bind(`${grant.id}-${id}`, `${grant.id}-token-${id}`, expiresAt, createdAt, revoked, grant.id)
      .run();
  }
  expect((await suiteCredential(tokens.access_token)).expiresAt).toBe(latestExpiry);
});

it.each([
  { name: "reuses above one day", replace: false },
  { name: "replaces at the one-day boundary", replace: true },
])("$name for the suite credential", async ({ replace }) => {
  const tokens = await codeTokens();
  const db = await runtime.getD1Database("DB", "accounts");
  const device = await suiteCredential(tokens.access_token);
  const expiry = Date.now() + DAY_MS + (replace ? 0 : 120_000);
  await db
    .prepare("UPDATE session SET expires_at=? WHERE token=?")
    .bind(expiry, device.token)
    .run();
  const before = lifecycle.length;
  const exchanged = await suiteCredential(tokens.access_token);
  if (replace) {
    expect(exchanged.token).not.toBe(device.token);
    expect(exchanged.expiresAt).toBe((await codeGrant(tokens.signed.user.id)).expires_at);
    expect(
      await db.prepare("SELECT id FROM session WHERE token=?").bind(device.token).first(),
    ).toBeNull();
    expect(
      lifecycle.slice(before).some((event) => JSON.parse(event).user === tokens.signed.user.id),
    ).toBe(true);
  } else expect(exchanged).toMatchObject({ token: device.token, expiresAt: expiry });
  const links = await db
    .prepare("SELECT session_id FROM suite_session WHERE authorization_code_id=?")
    .bind((await codeGrant(tokens.signed.user.id)).authorization_code_id)
    .all();
  expect(links.results).toHaveLength(1);
});

it.each(["revoked", "expired"])(
  "checks a %s grant again on get-session and deletes the suite session",
  async (state) => {
    const tokens = await codeTokens();
    const db = await runtime.getD1Database("DB", "accounts");
    const grant = await codeGrant(tokens.signed.user.id);
    const device = await suiteCredential(tokens.access_token);
    const me = () =>
      request("/v1/auth/get-session", {
        headers: { authorization: `Bearer ${device.token}` },
      });
    for (let i = 0; i < 2; i++)
      expect(await (await me()).json()).toMatchObject({ user: { id: tokens.signed.user.id } });
    if (state === "revoked")
      await db
        .prepare("UPDATE oauth_refresh_token SET revoked=? WHERE id=?")
        .bind(Date.now(), grant.id)
        .run();
    else
      await db
        .prepare("UPDATE oauth_refresh_token SET expires_at=? WHERE id=?")
        .bind(Date.now() - 1000, grant.id)
        .run();
    const before = lifecycle.length;
    expect(await (await me()).json()).toBeNull();
    expect(
      await db.prepare("SELECT id FROM session WHERE token=?").bind(device.token).first(),
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT session_id FROM suite_session WHERE authorization_code_id=?")
        .bind(grant.authorization_code_id)
        .first(),
    ).toBeNull();
    expect(
      lifecycle.slice(before).some((event) => JSON.parse(event).user === tokens.signed.user.id),
    ).toBe(true);
    expect(await (await me()).json()).toBeNull();
  },
);

it("deletes the suite credential and still fans account deletion out to Mail, Drive and Code", async () => {
  const tokens = await codeTokens();
  const device = await suiteCredential(tokens.access_token);
  const before = lifecycle.length;
  const deleted = await request(
    "/otter/delete-account",
    json(
      { confirmation: "DELETE" },
      {
        cookie: tokens.signed.cookie,
        origin: accounts,
      },
    ),
  );
  expect(deleted.status, await deleted.clone().text()).toBe(200);
  const events = lifecycle
    .slice(before)
    .map(
      (event) =>
        JSON.parse(event) as { user?: string; drive?: string; code?: string; path?: string },
    );
  expect(events.some((event) => event.user === tokens.signed.user.id)).toBe(true);
  expect(
    events.some((event) => event.drive !== undefined && event.path === "/api/identity/delete"),
  ).toBe(true);
  expect(events.some((event) => event.code && event.path === "/v1/identity/delete")).toBe(true);
  expect(
    await (
      await request("/v1/auth/get-session", {
        headers: { authorization: `Bearer ${device.token}` },
      })
    ).json(),
  ).toBeNull();
  const db = await runtime.getD1Database("DB", "accounts");
  expect(
    await db.prepare("SELECT id FROM session WHERE token=?").bind(device.token).first(),
  ).toBeNull();
});

let client = 0;
/** A distinct client address, so each test has its own password rate limits. */
const ip = () => `192.0.2.${++client}`;

async function microsoftToken(claims: Record<string, unknown>) {
  const tid = (claims.tid as string | undefined) ?? "work-tenant";
  const oid = (claims.oid as string | undefined) ?? crypto.randomUUID();
  return new SignJWT({ name: "Microsoft Example", ...claims, tid, oid })
    .setProtectedHeader({ alg: "RS256", kid: "microsoft" })
    .setIssuer(`https://login.microsoftonline.com/${tid}/v2.0`)
    .setAudience("microsoft-test")
    .setSubject(`pairwise-${oid}`)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(microsoftKey);
}

/** The browser redirect flow, from the sign-in page to Microsoft's callback. */
async function microsoftRedirect(claims: Record<string, unknown>, cookie = "", link = false) {
  const started = await request(
    link ? "/v1/auth/link-social" : "/v1/auth/sign-in/social",
    json(
      {
        provider: "microsoft",
        callbackURL: `${accounts}/otter/account`,
        errorCallbackURL: `${accounts}/otter/sign-in`,
        disableRedirect: true,
      },
      { origin: accounts, cookie },
    ),
  );
  expect(started.status, await started.clone().text()).toBe(200);
  const url = new URL(((await started.json()) as { url: string }).url);
  expect(url.origin + url.pathname).toBe(
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  );
  expect(url.searchParams.get("redirect_uri")).toBe(`${accounts}/v1/auth/callback/microsoft`);
  expect(url.searchParams.get("scope")).toBe("openid email profile");
  const code = `fake-microsoft-code-${++sequence}`;
  microsoftCodes.set(code, await microsoftToken(claims));
  const callback = await request(
    `/v1/auth/callback/microsoft?state=${url.searchParams.get("state")}&code=${code}`,
    { headers: { cookie: [cookie, cookies(started)].filter(Boolean).join("; ") } },
  );
  expect(callback.status, await callback.clone().text()).toBe(302);
  return { location: new URL(callback.headers.get("location")!), cookie: cookies(callback) };
}

async function sessionUser(cookie: string) {
  const response = await request("/v1/auth/get-session", { headers: { cookie } });
  return ((await response.json()) as { user: { id: string; emailVerified: boolean } } | null)?.user;
}
async function mailSession(token: string) {
  const response = await request(
    "/session",
    { headers: { authorization: `Bearer ${token}` } },
    true,
  );
  return (await response.json()) as { user: { id: string; signInMethods: string[] } } | null;
}
async function userCount(email: string) {
  const db = await runtime.getD1Database("DB", "accounts");
  return (await db.prepare("SELECT count(*) AS n FROM user WHERE email = ?").bind(email).first<{
    n: number;
  }>())!.n;
}
function emailedLink(to: string) {
  const sent = emails.findLast((email) => email.to.includes(to));
  expect(sent, `no email to ${to}`).toBeDefined();
  expect(sent!.html).toContain("Otterware");
  return new URL(sent!.text.match(/https?:\/\/\S+/)![0]);
}
const password = (email: string, secret: string, client: string, path = "/v1/auth/sign-in/email") =>
  request(
    path,
    json({ email, password: secret }, { origin: accounts, "cf-connecting-ip": client }),
  );
async function choosePassword(email: string, secret: string) {
  const link = emailedLink(email);
  expect(link.pathname).toMatch(/^\/v1\/auth\/reset-password\//);
  const landed = new URL((await request(link.pathname + link.search)).headers.get("location")!);
  expect(landed.pathname).toBe("/otter/reset-password");
  const page = await request(landed.pathname + landed.search);
  expect(await page.text()).toContain("Choose a password");
  const reset = await request(
    "/v1/auth/reset-password",
    json(
      { token: landed.searchParams.get("token"), newPassword: secret },
      { origin: accounts, "cf-connecting-ip": ip() },
    ),
  );
  expect(reset.status, await reset.clone().text()).toBe(200);
}

it("signs up and back in with Microsoft as one stable account", async () => {
  const email = `personal-${++sequence}@outlook.example`;
  const claims = { tid: PERSONAL_TENANT, oid: crypto.randomUUID(), email };
  const first = await microsoftRedirect(claims);
  expect(first.location.href).toBe(`${accounts}/otter/account`);
  const user = await sessionUser(first.cookie);
  expect(user).toMatchObject({ emailVerified: true });
  const again = await microsoftRedirect(claims);
  expect((await sessionUser(again.cookie))?.id).toBe(user!.id);
  const account = await request("/otter/account", { headers: { cookie: again.cookie } });
  expect(await account.text()).toContain("Microsoft");
  // Mail's apps may also hand over a Microsoft ID token, like Google's.
  const native = await request(
    "/v1/auth/sign-in/social",
    json({ provider: "microsoft", idToken: { token: await microsoftToken(claims) } }),
    true,
  );
  expect(native.status, await native.clone().text()).toBe(200);
  const { token } = (await native.json()) as { token: string };
  expect(await mailSession(token)).toMatchObject({
    user: { id: user!.id, signInMethods: ["microsoft"] },
  });
});

it("never lets an unverified Microsoft work address claim or join an account (nOAuth)", async () => {
  const google = await signIn();
  const victim = google.user.email;
  // Another tenant names the victim's address in `email`; its UPN is its own.
  const forged = {
    tid: "attacker-tenant",
    email: victim,
    preferred_username: "mallory@attacker.onmicrosoft.com",
  };
  const linked = await microsoftRedirect(forged);
  expect(linked.location.pathname).toBe("/otter/sign-in");
  expect(linked.location.searchParams.get("error")).toBe("account_not_linked");
  expect(linked.cookie).not.toContain("session_token");
  expect((await mailSession(google.token))?.user.signInMethods).toEqual(["google"]);
  expect(
    (
      await request(
        "/v1/auth/sign-in/social",
        json({ provider: "microsoft", idToken: { token: await microsoftToken(forged) } }),
        true,
      )
    ).status,
  ).toBe(401);
  // Nor may it create an account on an address nobody has used yet.
  const unclaimed = `unclaimed-${++sequence}@gmail.example`;
  const created = await microsoftRedirect({ ...forged, email: unclaimed });
  expect(created.location.searchParams.get("error")).toBe("microsoft_email_unverified");
  expect(await userCount(unclaimed)).toBe(0);
  const page = await request(created.location.pathname + created.location.search);
  expect(await page.text()).toContain("Microsoft hasn’t verified the email address");
});

it("links verified Microsoft work identities to the Google account with the same address", async () => {
  const upn = await signIn(false, `upn-${++sequence}@contoso.example`);
  const byUpn = await microsoftRedirect({
    tid: "contoso",
    email: upn.user.email,
    preferred_username: upn.user.email.toUpperCase(),
  });
  expect((await sessionUser(byUpn.cookie))?.id).toBe(upn.user.id);
  expect((await mailSession(upn.token))?.user.signInMethods).toEqual(["google", "microsoft"]);
  const domain = await signIn(false, `edov-${++sequence}@fabrikam.example`);
  const byDomain = await microsoftRedirect({
    tid: "fabrikam",
    email: domain.user.email,
    preferred_username: "someone@fabrikam.onmicrosoft.com",
    xms_edov: true,
  });
  expect((await sessionUser(byDomain.cookie))?.id).toBe(domain.user.id);
  // Connecting from the account page needs the same address.
  const other = await signIn();
  const mismatched = await microsoftRedirect(
    { tid: PERSONAL_TENANT, email: `someone-else-${++sequence}@outlook.example` },
    other.cookie,
    true,
  );
  expect(mismatched.location.searchParams.get("error")).toBe("email_does_not_match");
  const connected = await microsoftRedirect(
    { tid: PERSONAL_TENANT, email: other.user.email },
    other.cookie,
    true,
  );
  expect(connected.location.href).toBe(`${accounts}/otter/account`);
  expect((await mailSession(other.token))?.user.signInMethods).toEqual(["google", "microsoft"]);
});

it("signs in with a password only after the emailed confirmation", async () => {
  const email = `password-${++sequence}@otter.example`;
  const client = ip();
  const signUp = await request(
    "/v1/auth/sign-up/email",
    json(
      {
        name: "Password Example",
        email,
        password: "correct horse battery",
        callbackURL: `${accounts}/otter/verified`,
      },
      { origin: accounts, "cf-connecting-ip": client },
    ),
  );
  expect(signUp.status, await signUp.clone().text()).toBe(200);
  expect(await signUp.json()).toMatchObject({ token: null });
  expect(cookies(signUp)).not.toContain("session_token");
  expect(emails.findLast((sent) => sent.to.includes(email))?.subject).toBe(
    "Confirm your email for Otterware",
  );
  const link = emailedLink(email);
  const sent = emails.length;
  const unconfirmed = await password(email, "correct horse battery", client);
  expect(unconfirmed.status).toBe(403);
  expect(await unconfirmed.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  expect(emails.length).toBe(sent + 1); // A new link, in case the first went missing.
  expect(link.origin + link.pathname).toBe(`${accounts}/v1/auth/verify-email`);
  const verified = await request(link.pathname + link.search);
  expect(verified.headers.get("location")).toBe(`${accounts}/otter/verified`);
  const landing = await request("/otter/verified", { headers: { cookie: cookies(verified) } });
  expect(await landing.text()).toContain("Your email is confirmed");
  expect(await sessionUser(cookies(verified))).toMatchObject({ emailVerified: true });
  expect((await password(email, "wrong password!", client)).status).toBe(401);
  const signedIn = await password(email, "correct horse battery", client);
  expect(signedIn.status, await signedIn.clone().text()).toBe(200);
  const { token } = (await signedIn.json()) as { token: string };
  expect((await mailSession(token))?.user.signInMethods).toEqual(["password"]);
  const expired = await request(`/otter/verified?error=INVALID_TOKEN`);
  expect(await expired.text()).toContain("This link has expired");
});

it("continues an app's sign-in after the address is confirmed", async () => {
  const email = `drive-${++sequence}@otter.example`;
  const query = new URLSearchParams({
    client_id: "otter-drive",
    redirect_uri: "https://drive.otterware.app/api/auth/callback/otter",
    response_type: "code",
    scope: "openid profile email",
    state: "drive-state",
    code_challenge: "x".repeat(43),
    code_challenge_method: "S256",
    exp: "1",
    sig: "signed",
  });
  await request(
    "/v1/auth/sign-up/email",
    json(
      {
        name: "",
        email,
        password: "a long enough password",
        callbackURL: `${accounts}/otter/verified?${query}`,
      },
      { origin: accounts, "cf-connecting-ip": ip() },
    ),
  );
  const link = emailedLink(email);
  const verified = await request(link.pathname + link.search);
  const landing = new URL(verified.headers.get("location")!);
  const continued = await request(landing.pathname + landing.search, {
    headers: { cookie: cookies(verified) },
  });
  const authorize = new URL(continued.headers.get("location")!, accounts);
  expect(authorize.pathname).toBe("/v1/auth/oauth2/authorize");
  expect(authorize.searchParams.get("client_id")).toBe("otter-drive");
  expect(authorize.searchParams.has("sig")).toBe(false);
  const callback = new URL(
    await redirect(
      await request(authorize.pathname + authorize.search, {
        headers: { cookie: cookies(verified) },
      }),
    ),
  );
  expect(callback.origin).toBe("https://drive.otterware.app");
  expect(callback.searchParams.get("code")).toBeTruthy();
});

it("resets a forgotten password through the emailed link", async () => {
  const email = `forgot-${++sequence}@otter.example`;
  const client = ip();
  await request(
    "/v1/auth/sign-up/email",
    json(
      { name: "", email, password: "first password!" },
      { origin: accounts, "cf-connecting-ip": client },
    ),
  );
  await request(emailedLink(email).pathname + emailedLink(email).search);
  const asked = await request(
    "/v1/auth/request-password-reset",
    json(
      { email, redirectTo: `${accounts}/otter/reset-password` },
      { origin: accounts, "cf-connecting-ip": client },
    ),
  );
  expect(asked.status, await asked.clone().text()).toBe(200);
  await choosePassword(email, "second password!");
  expect((await password(email, "first password!", client)).status).toBe(401);
  expect((await password(email, "second password!", client)).status).toBe(200);
  const expired = await request("/otter/reset-password?error=INVALID_TOKEN");
  expect(await expired.text()).toContain("This link has expired");
});

it("adds a password to a Google account through its address, keeping one user", async () => {
  const google = await signIn();
  const email = google.user.email;
  // Signing up with a taken address answers like any sign-up, and emails the owner a link.
  const signUp = await request(
    "/v1/auth/sign-up/email",
    json(
      { name: "Someone", email, password: "not their password" },
      { origin: accounts, "cf-connecting-ip": ip() },
    ),
  );
  expect(signUp.status).toBe(200);
  expect(await signUp.json()).toMatchObject({ token: null, user: { email } });
  expect(emails.findLast((sent) => sent.to.includes(email))?.subject).toBe(
    "Choose a password for Otterware",
  );
  expect((await password(email, "not their password", ip())).status).toBe(401);
  await choosePassword(email, "their own password");
  const signedIn = await password(email, "their own password", ip());
  expect(signedIn.status, await signedIn.clone().text()).toBe(200);
  expect(await signedIn.json()).toMatchObject({ user: { id: google.user.id } });
  expect((await mailSession(google.token))?.user.signInMethods).toEqual(["google", "password"]);
});

it("lets a verified sign-in take back an address from an unconfirmed password sign-up", async () => {
  const email = `squatted-${++sequence}@otter.example`;
  const client = ip();
  await request(
    "/v1/auth/sign-up/email",
    json(
      { name: "Mallory", email, password: "mallory's password" },
      { origin: accounts, "cf-connecting-ip": client },
    ),
  );
  const google = await signIn(false, email);
  expect(await userCount(email)).toBe(1);
  expect((await mailSession(google.token))?.user.signInMethods).toEqual(["google"]);
  expect((await password(email, "mallory's password", client)).status).toBe(401);
  // The confirmation link sent for the abandoned sign-up no longer signs anyone in.
  const stale = await request(emailedLink(email).pathname + emailedLink(email).search);
  expect(cookies(stale)).not.toContain("session_token");
  const microsoft = `squatted-${++sequence}@outlook.example`;
  await request(
    "/v1/auth/sign-up/email",
    json(
      { name: "Mallory", email: microsoft, password: "mallory's password" },
      { origin: accounts, "cf-connecting-ip": client },
    ),
  );
  const owner = await microsoftRedirect({ tid: PERSONAL_TENANT, email: microsoft });
  expect(await sessionUser(owner.cookie)).toMatchObject({ emailVerified: true });
  expect((await password(microsoft, "mallory's password", client)).status).toBe(401);
});

it("rate limits password attempts per client address", async () => {
  const email = `limited-${++sequence}@otter.example`;
  const client = ip();
  for (let attempt = 0; attempt < 5; attempt++)
    expect((await password(email, "guessing password", client)).status).toBe(401);
  expect((await password(email, "guessing password", client)).status).toBe(429);
  expect((await password(email, "guessing password", ip())).status).toBe(401);
  // Google sign-in from Mail's shared servers is not limited.
  for (let attempt = 0; attempt < 5; attempt++) await signIn(true);
});

it("offers Microsoft and email sign-in only when configured", async () => {
  const configured = await (await request("/otter/sign-in")).text();
  expect(configured).toContain("Continue with Microsoft");
  expect(configured).toContain('id="email-form"');
  const plain = { "x-test-plain": "1" };
  const page = await (await request("/otter/sign-in", { headers: plain })).text();
  expect(page).toContain("Continue with Google");
  expect(page).not.toContain("Microsoft");
  expect(page).not.toContain('id="email-form"');
  const signUp = await request(
    "/v1/auth/sign-up/email",
    json(
      { name: "", email: `off-${++sequence}@otter.example`, password: "long enough password" },
      { ...plain, origin: accounts, "cf-connecting-ip": ip() },
    ),
  );
  expect(signUp.status).toBe(400);
  const social = await request(
    "/v1/auth/sign-in/social",
    json({ provider: "microsoft", disableRedirect: true }, { ...plain, origin: accounts }),
  );
  expect(social.status).toBe(404);
  const google = await signIn();
  const account = await (
    await request("/otter/account", { headers: { ...plain, cookie: google.cookie } })
  ).text();
  expect(account).toContain("Sign-in methods");
  expect(account).not.toContain("<h2>Microsoft</h2>");
  expect(account).not.toContain("<h2>Password</h2>");
});

it("returns a password sign-in to the Mail browser flow that asked for it", async () => {
  const google = await signIn();
  await request(
    "/v1/auth/sign-up/email",
    json(
      { name: "", email: google.user.email, password: "mail password!" },
      { origin: accounts, "cf-connecting-ip": ip() },
    ),
  );
  await choosePassword(google.user.email, "mail password!");
  const started = await request(
    "/v1/auth/sign-in/social",
    json({ provider: "google", callbackURL: `${app}/inbox` }, { origin: app }),
    true,
  );
  const authorize = new URL(((await started.json()) as { url: string }).url);
  const login = new URL(
    await redirect(
      await request(authorize.pathname + authorize.search, { headers: { accept: "text/html" } }),
    ),
  );
  expect(login.pathname).toBe("/otter/sign-in");
  const signedIn = await request(
    "/v1/auth/sign-in/email",
    json(
      {
        email: google.user.email,
        password: "mail password!",
        callbackURL: `${accounts}/otter/verified?${login.search.slice(1)}`,
        oauth_query: login.search.slice(1),
      },
      { origin: accounts, "cf-connecting-ip": ip() },
    ),
  );
  const mailCallback = new URL(await redirect(signedIn));
  expect(mailCallback.origin).toBe(mail);
  const completed = await request(
    mailCallback.pathname + mailCallback.search,
    { headers: { cookie: cookies(started) } },
    true,
  );
  expect(completed.headers.get("location")).toBe(`${app}/inbox`);
  const identity = await (
    await request("/session", { headers: { cookie: cookies(completed) } }, true)
  ).json();
  expect(identity).toMatchObject({
    user: { id: google.user.id, signInMethods: ["google", "password"] },
  });
});
