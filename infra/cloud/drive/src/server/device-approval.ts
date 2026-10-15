import { html, raw } from "hono/html";
import { createAuth } from "./auth";
import type { Env } from "./types";

/** The CLI's browser approval survives independently of the Drive profile's SPA. */
export async function deviceApproval(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  const userCode = new URL(request.url).searchParams.get("user_code") ?? "";
  let content;
  let script = "";
  let status = 200;
  if (!/^[A-Za-z0-9-]{4,32}$/.test(userCode)) {
    content = html`<p>Enter the code shown by <code>otterdrive auth login</code>.</p>
      <form method="get">
        <label for="user_code">Connection code</label>
        <input id="user_code" name="user_code" required autocomplete="off" maxlength="32" />
        <button>Continue</button>
      </form>`;
  } else {
    const auth = createAuth(env);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      content = html`<p>
          Sign in with your Otter Account to review code <strong>${userCode}</strong>.
        </p>
        <button id="sign-in">Sign in with Otter Account</button>`;
      const callbackURL = `${env.APP_URL}/device?${new URLSearchParams({ user_code: userCode })}`;
      script = `document.querySelector('#sign-in').onclick = async () => {
        try {
          const response = await fetch('/api/auth/sign-in/social', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({provider: 'otter', callbackURL: ${JSON.stringify(callbackURL)}, disableRedirect: true}) });
          const result = await response.json();
          if (!response.ok || !result.url) throw new Error();
          location.assign(result.url);
        } catch { document.querySelector('#result').textContent = 'Could not sign in. Please try again.'; }
      };`;
    } else {
      const device = await auth.api
        .deviceVerify({
          headers: request.headers,
          query: { user_code: userCode },
        })
        .catch(() => null);
      if (!device || !["otterdrive-cli", "otterware-cli"].includes(device.client_id ?? "")) {
        status = 400;
        content = html`<p>
          This code is invalid or expired. Run <code>otterdrive auth login</code> again.
        </p>`;
      } else if (device.status !== "pending") {
        content = html`<p>This connection has already been reviewed. Return to your terminal.</p>`;
      } else {
        content = html`<p>
            Connect the CLI displaying <strong>${userCode}</strong> to
            <strong>${session.user.email}</strong>.
          </p>
          <p>Approve only if you started this sign-in on your own machine.</p>
          <form id="review">
            <button value="approve">Approve</button><button value="deny">Deny</button>
          </form>`;
        script = `document.querySelector('#review').onsubmit = async event => {
          event.preventDefault();
          try {
            const action = event.submitter.value;
            const response = await fetch('/api/auth/device/' + action, { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({userCode: ${JSON.stringify(userCode)}}) });
            if (!response.ok) throw new Error();
            document.querySelector('#result').textContent = action === 'approve' ? 'Approved. Return to your terminal.' : 'Connection denied.';
            document.querySelector('#review').remove();
          } catch { document.querySelector('#result').textContent = 'Could not review this connection. Please try again.'; }
        };`;
      }
    }
  }
  const nonce = crypto.randomUUID();
  const body = await html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Connect Otter Drive</title>
        <style nonce="${nonce}">
          :root {
            color-scheme: light dark;
            font-family: system-ui, sans-serif;
          }
          body {
            max-width: 28rem;
            margin: 12vh auto;
            padding: 1.5rem;
            line-height: 1.6;
          }
          button,
          input {
            font: inherit;
            padding: 0.5rem 0.75rem;
            margin: 0.5rem 0.5rem 0.5rem 0;
          }
          label {
            display: block;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Connect Otter Drive</h1>
          ${content}
          <p id="result" role="status"></p>
        </main>
        <script nonce="${nonce}">
          ${raw(script)};
        </script>
      </body>
    </html>`;
  return new Response(request.method === "HEAD" ? null : body.toString(), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
}
