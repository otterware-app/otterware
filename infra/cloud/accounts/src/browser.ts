/** Browser logout visits each cookie owner, including sessions predating Accounts. */
import type { Context } from "hono";
import { html, raw } from "hono/html";
import { HTTPException } from "hono/http-exception";
import type { App } from "./env.ts";

export function requireOrigin(c: Context<App>, allowed: string[]) {
  if (!allowed.includes(c.req.header("origin") ?? ""))
    throw new HTTPException(403, { message: "Start sign-out from Otter." });
}

export async function logoutDestination(c: Context<App>) {
  const app = (await c.req.parseBody()).app;
  if (app !== "mail" && app !== "drive" && app !== "accounts")
    throw new HTTPException(400, { message: "Unknown app." });
  return app;
}

export function continueLogout(c: Context<App>, target: string, app: string) {
  const nonce = crypto.randomUUID();
  const destination =
    app === "mail"
      ? c.env.APP_ORIGIN
      : app === "drive"
        ? c.env.DRIVE_ORIGIN
        : c.env.BETTER_AUTH_URL;
  c.header("Cache-Control", "no-store");
  // Form POSTs under no-referrer carry Origin: null. Keep the origin for
  // the next service's CSRF check without sharing this page's path or query.
  c.header("Referrer-Policy", "strict-origin");
  c.header(
    "Content-Security-Policy",
    // Browsers apply form-action to Drive's final redirect as well as the POST.
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action ${new URL(target).origin} ${destination}; frame-ancestors 'none'; base-uri 'none'`,
  );
  return c.html(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="color-scheme" content="light dark" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Signing out · Otter</title>
        <style nonce="${nonce}">
          :root {
            color-scheme: light dark;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
            --canvas: light-dark(#fff, #181818);
            --frame: light-dark(#f9f9f9, #202020);
            --text: light-dark(#0d0d0d, #ececec);
            --muted: light-dark(#5d5d5d, #a3a3a3);
            --line: light-dark(#e8e8e8, #2c2c2c);
            background: var(--frame);
            color: var(--text);
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
          }
          header {
            height: 42px;
            padding: 12px 16px;
            font-size: 14px;
            font-weight: 500;
            letter-spacing: -0.025em;
          }
          main {
            min-height: calc(100svh - 46px);
            margin: 0 4px 4px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: var(--canvas);
            display: grid;
            place-items: center;
            padding: 32px;
          }
          .status {
            width: 100%;
            max-width: 360px;
            text-align: center;
          }
          h1 {
            margin: 20px 0 10px;
            font-size: 24px;
            font-weight: 500;
            letter-spacing: -0.035em;
          }
          p {
            margin: 0;
            color: var(--muted);
            font-size: 14px;
            line-height: 1.6;
          }
          .spinner {
            width: 24px;
            height: 24px;
            margin: auto;
            border: 2px solid var(--line);
            border-top-color: var(--text);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          form {
            margin-top: 24px;
          }
          button {
            font: inherit;
            font-size: 14px;
            padding: 10px 16px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--canvas);
            color: var(--text);
            cursor: pointer;
          }
          button:focus-visible {
            outline: 2px solid var(--text);
            outline-offset: 3px;
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .spinner {
              animation: none;
            }
          }
        </style>
      </head>
      <body>
        <header>Otterware</header>
        <main>
          <div class="status" role="status">
            <div class="spinner" aria-hidden="true"></div>
            <h1>Signing out…</h1>
            <p>Just a moment.</p>
            <form method="post" action="${target}">
              <input type="hidden" name="app" value="${app}" />
              <button>Continue signing out</button>
            </form>
          </div>
        </main>
        <script nonce="${nonce}">
          ${raw("const form = document.querySelector('form'); form.hidden = true; setTimeout(() => { form.hidden = false; }, 1500); form.requestSubmit();")};
        </script>
      </body>
    </html>`);
}

export async function endSession(c: Context<App>) {
  // The caller checks the browser's Origin before invoking the auth endpoint.
  const headers = new Headers(c.req.raw.headers);
  headers.set("origin", new URL(c.req.url).origin);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  headers.delete("authorization"); // Browser logout never consumes a device bearer token.
  const response = await c.var.auth.handler(
    new Request(new URL("/v1/auth/sign-out", c.req.url), {
      method: "POST",
      headers,
      body: "{}",
    }),
  );
  if (!response.ok)
    throw new HTTPException(502, { message: "Could not sign out. Please try again." });
  for (const cookie of response.headers.getSetCookie())
    c.header("Set-Cookie", cookie, { append: true });
}
