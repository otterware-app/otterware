/** Browser sign-in and account management for the shared Otter identity. */
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { html } from "hono/html";
import { HTTPException } from "hono/http-exception";

import { signInMethods, signInOptions, type SignInMethod } from "./auth.ts";
import { identityApps } from "./schema.ts";
import { appIcon, icon, page } from "./page.ts";
import type { App } from "./env.ts";
import { codeOrigin, codeRelayOrigin } from "./code.ts";
import { continueLogout, endSession, logoutDestination, requireOrigin } from "./browser.ts";

const routes = new Hono<App>();

// A credentialed check only exposes whether this browser can reuse its login.
routes.get("/session", async (c) => {
  const origin = c.req.header("origin") ?? "";
  if (
    ![c.env.APP_ORIGIN, c.env.DRIVE_ORIGIN, c.env.SITE_ORIGIN, codeOrigin(c.env)].includes(origin)
  )
    throw new HTTPException(403);
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Vary", "Origin");
  const found = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  return c.json({ signedIn: Boolean(found) });
});

routes.post("/sign-out", async (c) => {
  requireOrigin(c, [
    c.env.APP_ORIGIN,
    c.env.MAIL_AUTH_URL,
    c.env.DRIVE_ORIGIN,
    c.env.BETTER_AUTH_URL,
    codeOrigin(c.env),
  ]);
  const app = await logoutDestination(c);
  await endSession(c);
  return continueLogout(c, `${c.env.MAIL_AUTH_URL}/v1/auth/browser-sign-out`, app);
});

const script = `
const message = document.querySelector('#message');
async function request(path, body) {
  message.textContent = '';
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || data.error || 'Please try again.'), { code: data.code });
  return data;
}
const choices = document.querySelector('#sign-in-options');
const callback = choices?.dataset.callback || location.origin + '/otter/account';
const query = document.body.dataset.query;
for (const button of document.querySelectorAll('[data-provider]')) button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const retry = new URL(location.href);
    retry.searchParams.delete('error');
    retry.searchParams.delete('error_description');
    const data = await request(button.dataset.action === 'link' ? '/v1/auth/link-social' : '/v1/auth/sign-in/social', {
      provider: button.dataset.provider, callbackURL: callback,
      errorCallbackURL: retry.href, disableRedirect: true,
      ...(query ? { oauth_query: query } : {}),
    });
    if (!data.url) throw new Error('Could not start sign-in.');
    location.assign(data.url);
  } catch (error) { message.textContent = error.message; button.disabled = false; }
});
const form = document.querySelector('#email-form');
const checkEmail = document.querySelector('#check-email');
function setMode(mode) {
  form.dataset.mode = mode;
  for (const element of choices.querySelectorAll('[data-for]')) {
    const shown = element.dataset.for.split(' ').includes(mode);
    element.hidden = !shown;
    for (const input of element.querySelectorAll('input')) input.disabled = !shown;
  }
  form.querySelector('#password').autocomplete = mode === 'sign-up' ? 'new-password' : 'current-password';
  form.querySelector('.submit').textContent = { 'sign-in': 'Sign in', 'sign-up': 'Create account', reset: 'Send link' }[mode];
  choices.hidden = false;
  checkEmail.hidden = true;
  message.textContent = '';
}
function showCheckEmail(text) {
  checkEmail.querySelector('p').textContent = text;
  choices.hidden = true;
  checkEmail.hidden = false;
}
for (const button of document.querySelectorAll('button[data-mode]')) button.addEventListener('click', () => setMode(button.dataset.mode));
form?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('.submit');
  const email = form.querySelector('#email').value.trim();
  const password = form.querySelector('#password').value;
  button.disabled = true;
  try {
    if (form.dataset.mode === 'reset') {
      await request('/v1/auth/request-password-reset', { email, redirectTo: location.origin + '/otter/reset-password' });
      showCheckEmail('If ' + email + ' has an Otter account, we’ve sent it a link to choose a new password.');
    } else if (form.dataset.mode === 'sign-up') {
      await request('/v1/auth/sign-up/email', {
        name: form.querySelector('#name').value.trim(), email, password,
        callbackURL: choices.dataset.callback || location.origin + '/otter/verified' + (query ? '?' + query : ''),
      });
      showCheckEmail('We’ve sent a link to ' + email + '. Open it to finish creating your account.');
    } else {
      // An unconfirmed address is sent a new link, which continues to the app that asked.
      const data = await request('/v1/auth/sign-in/email', {
        email, password, ...(query ? { oauth_query: query, callbackURL: location.origin + '/otter/verified?' + query } : { callbackURL: callback }),
      });
      location.assign(data.url || callback);
      return;
    }
  } catch (error) {
    if (error.code === 'EMAIL_NOT_VERIFIED') showCheckEmail('Confirm your email first. We’ve sent a new link to ' + email + '.');
    else message.textContent = error.message;
  }
  button.disabled = false;
});
document.querySelector('#reset')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await request('/v1/auth/reset-password', { token: new URL(location.href).searchParams.get('token'), newPassword: document.querySelector('#new-password').value });
    document.querySelector('#reset').hidden = true;
    document.querySelector('#reset-done').hidden = false;
  } catch (error) { message.textContent = error.message; button.disabled = false; }
});
document.querySelector('#password-link')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await request('/v1/auth/request-password-reset', { email: button.dataset.email, redirectTo: location.origin + '/otter/reset-password' });
    message.textContent = '';
    document.querySelector('#password-sent').hidden = false;
  } catch (error) { message.textContent = error.message; button.disabled = false; }
});
document.querySelector('#reauth')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await request('/v1/auth/sign-in/email', { email: button.dataset.email, password: document.querySelector('#reauth-password').value });
    location.reload();
  } catch (error) { document.querySelector('#delete-message').textContent = error.message; button.disabled = false; }
});
document.querySelector('#consent')?.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await request('/v1/auth/oauth2/consent', { accept: event.submitter.value === 'accept', oauth_query: document.body.dataset.query });
    if (data.url) location.assign(data.url);
    else if (data.redirect_uri) location.assign(data.redirect_uri);
  } catch (error) { message.textContent = error.message; }
});
const dialog = document.querySelector('#delete-dialog');
document.querySelector('#delete-open')?.addEventListener('click', () => dialog.showModal());
document.querySelector('#delete-cancel')?.addEventListener('click', () => dialog.close());
document.querySelector('#confirmation')?.addEventListener('input', event => {
  document.querySelector('#delete-submit').disabled = event.target.value !== 'DELETE';
});
document.querySelector('#delete')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  const errorMessage = document.querySelector('#delete-message');
  button.disabled = true;
  errorMessage.textContent = '';
  try {
    await request('/otter/delete-account', { confirmation: document.querySelector('#confirmation').value });
    location.assign('/otter/sign-in?deleted=1');
  } catch (error) { errorMessage.textContent = error.message; button.disabled = false; }
});
`;

const providerNames = { google: "Google", microsoft: "Microsoft" } as const;

/** Why a sign-in or link came back without one, from Better Auth's error codes. */
function failure(error: string | null) {
  if (!error) return "";
  const text =
    error === "access_denied"
      ? "Sign-in was cancelled. You can try again when you’re ready."
      : error === "microsoft_email_unverified" || error === "account_not_linked"
        ? "Microsoft hasn’t verified the email address on that account, so it can’t sign in to Otter. Continue with Google or your email instead."
        : error === "email_does_not_match"
          ? "That account uses a different email address. Otter connects accounts with the same address."
          : error === "account_already_linked_to_different_user"
            ? "That account already signs in to a different Otter account."
            : "Sign-in couldn't be completed. Please try again.";
  return html`<p class="notice" role="status">${text}</p>`;
}

/** Google, Microsoft when configured, and email and password when Otter can send email. */
function signInChoices(c: Context<App>, callback = "") {
  const options = signInOptions(c.env);
  return html`
    <div id="sign-in-options" data-callback=${callback}>
      <div class="providers">
        <button class="wide secondary" data-provider="google">
          ${icon("google")}Continue with Google</button
        >${
          options.microsoft
            ? html`<button class="wide secondary" data-provider="microsoft">
                ${icon("microsoft")}Continue with Microsoft
              </button>`
            : ""
        }
      </div>
      ${
        options.password
          ? html`<div class="divider"><span>or</span></div>
              <form id="email-form" class="email-form" data-mode="sign-in">
                <div data-for="sign-up" hidden>
                  <label for="name">Name</label
                  ><input id="name" autocomplete="name" maxlength="100" disabled />
                </div>
                <label for="email">Email</label
                ><input id="email" type="email" autocomplete="email" required />
                <div data-for="sign-in sign-up">
                  <label for="password">Password</label
                  ><input
                    id="password"
                    type="password"
                    autocomplete="current-password"
                    minlength="10"
                    maxlength="128"
                    required
                  />
                </div>
                <button class="wide submit">Sign in</button>
              </form>
              <p class="fine switch">
                <span data-for="sign-in"
                  ><button type="button" class="link" data-mode="reset">Forgot password?</button> ·
                  <button type="button" class="link" data-mode="sign-up">
                    Create an account
                  </button></span
                ><span data-for="sign-up" hidden
                  >Already have an account?
                  <button type="button" class="link" data-mode="sign-in">Sign in</button></span
                ><span data-for="reset" hidden
                  >We’ll email you a link to choose a new password.
                  <button type="button" class="link" data-mode="sign-in">
                    Back to sign in
                  </button></span
                >
              </p>`
          : ""
      }
    </div>
    <section id="check-email" hidden>
      <h2>Check your email</h2>
      <p></p>
      <button type="button" class="link" data-mode="sign-in">Back to sign in</button>
    </section>
  `;
}

routes.get("/sign-in", async (c) => {
  const query = new URL(c.req.url).searchParams;
  const error = query.get("error");
  query.delete("error");
  query.delete("error_description");
  if (
    !query.has("client_id") &&
    !error &&
    (await c.var.auth.api.getSession({ headers: c.req.raw.headers }))
  )
    return c.redirect("/otter/account");
  return page(
    c,
    "Welcome to Otterware",
    html`
      <p>One account for Mail, Drive and Code.<br />Everything you need, together.</p>
      ${query.has("deleted") ? html`<p class="notice" role="status">Your Otter account has been deleted.</p>` : ""}
      ${failure(error)} ${signInChoices(c)}
      <p class="fine">Your mail and files stay in their own apps.</p>
    `,
    script,
    query.has("client_id") ? query.toString() : "",
  );
});

// Where a confirmation link lands, signed in: continue to the app that asked, or say so.
routes.get("/verified", async (c) => {
  const query = new URL(c.req.url).searchParams;
  const error = query.get("error");
  const found = !error && (await c.var.auth.api.getSession({ headers: c.req.raw.headers }));
  for (const name of ["error", "sig", "exp", "ba_iat", "ba_pl"]) query.delete(name);
  if (query.get("prompt") === "login") query.delete("prompt");
  if (found && query.has("client_id")) return c.redirect(`/v1/auth/oauth2/authorize?${query}`);
  return page(
    c,
    error ? "This link has expired" : "Your email is confirmed",
    error
      ? html`<p>Sign in with your email and password, and we’ll send you a new link.</p>
          <a class="button wide" href="/otter/sign-in">Sign in</a>`
      : found
        ? html`<p>Your Otter account is ready.</p>
            <a class="button wide" href="/otter/account">Continue</a>`
        : html`<p>Sign in to continue.</p>
            <a class="button wide" href="/otter/sign-in">Sign in</a>`,
    "",
  );
});

routes.get("/reset-password", (c) => {
  const token = c.req.query("token");
  if (!token || c.req.query("error"))
    return page(
      c,
      "This link has expired",
      html`<p>Links to choose a password work once, for an hour. Ask for a new one.</p>
        <a class="button wide" href="/otter/sign-in">Back to sign in</a>`,
      "",
    );
  return page(
    c,
    "Choose a password",
    html`
      <form id="reset" class="email-form">
        <label for="new-password">New password</label
        ><input
          id="new-password"
          type="password"
          autocomplete="new-password"
          minlength="10"
          maxlength="128"
          required
        />
        <p class="fine">At least 10 characters.</p>
        <button class="wide">Save password</button>
      </form>
      <div id="reset-done" hidden>
        <p>Your password is saved. Sign in with it from now on.</p>
        <a class="button wide" href="/otter/sign-in">Sign in</a>
      </div>
    `,
    script,
  );
});

routes.get("/consent", (c) => {
  const query = new URL(c.req.url).searchParams;
  const clientId = query.get("client_id");
  const app =
    clientId === "otter-drive"
      ? "Otter Drive"
      : ["otter-code-web", "otter-code-desktop", "otter-code-mobile", "otter-code-cli"].includes(
            clientId ?? "",
          )
        ? "Otter Code"
        : null;
  if (!app) throw new HTTPException(400, { message: "Unknown app." });
  return page(
    c,
    `Continue to ${app}`,
    html`
      <p>${app} will receive your account ID, name, email address and profile picture.</p>
      <form id="consent" class="consent-actions">
        <button value="accept">Continue</button
        ><button class="secondary" value="deny">Cancel</button>
      </form>
    `,
    script,
    query.toString(),
    "welcome",
    app === "Otter Drive" ? "drive" : "code",
  );
});

routes.get("/device", async (c) => {
  const userCode = c.req.query("user_code") ?? "";
  if (!/^[A-Za-z0-9-]{4,32}$/.test(userCode))
    return page(
      c,
      "Connect Otter Code",
      html`<p>Enter the code shown on your server.</p>
        <form method="get">
          <label for="user_code">Connection code</label
          ><input id="user_code" name="user_code" required autocomplete="off" /><button>
            Continue
          </button>
        </form>`,
      "",
      "",
      "welcome",
      "code",
    );
  const found = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!found)
    return page(
      c,
      "Connect Otter Code",
      html`<p>Sign in to approve the Code server connection.</p>
        ${signInChoices(c, `${c.env.BETTER_AUTH_URL}/otter/device?${new URLSearchParams({ user_code: userCode })}`)}`,
      script,
      "",
      "welcome",
      "code",
    );
  const device = await c.var.auth.api.deviceVerify({
    headers: c.req.raw.headers,
    query: { user_code: userCode },
  });
  if (device.client_id !== "otter-code-cli")
    throw new HTTPException(400, { message: "Unknown app or connection code." });
  if (device.status !== "pending")
    return page(
      c,
      "Connection reviewed",
      html`<p>Return to your Code server to finish connecting.</p>`,
      "",
      "",
      "welcome",
      "code",
    );
  return page(
    c,
    "Connect Otter Code",
    html`
      <p>
        Connect the Code server displaying <strong>${userCode}</strong> to
        <strong>${found.user.email}</strong>.
      </p>
      <p>Approve only if you started this connection on your own server.</p>
      <form id="device">
        <button value="approve">Connect server</button
        ><button value="deny" class="secondary">Cancel</button>
      </form>
      <p id="device-result" role="status"></p>
    `,
    `document.querySelector('#device').addEventListener('submit', async event => {
    event.preventDefault(); const action = event.submitter.value;
    const response = await fetch('/v1/auth/device/' + action, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ userCode: ${JSON.stringify(userCode)} }) });
    document.querySelector('#device-result').textContent = response.ok ? 'Return to your Code server.' : 'Could not review this connection. Try again.';
    if (response.ok) document.querySelector('#device').remove();
  });`,
    "",
    "welcome",
    "code",
  );
});

routes.get("/account", async (c) => {
  const found = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!found) return c.redirect("/otter/sign-in");
  const linked = await c.var.db.query.identityApps.findMany({
    where: eq(identityApps.userId, found.user.id),
  });
  const fresh = Date.now() - found.session.createdAt.getTime() <= 10 * 60_000;
  const methods = await signInMethods(c.var.db, found.user.id);
  const options = signInOptions(c.env);
  const offered: SignInMethod[] = [
    "google",
    ...(options.microsoft || methods.includes("microsoft") ? (["microsoft"] as const) : []),
    ...(options.password || methods.includes("password") ? (["password"] as const) : []),
  ];
  return page(
    c,
    "Your Otter account",
    html`
      <header class="account-header">
        <h1>Your account</h1>
        <p>One place for your Otter account.</p>
      </header>
      ${failure(c.req.query("error") ?? null)}
      <section class="profile" aria-label="Profile">
        <span class="avatar" aria-hidden="true"
          >${(found.user.name || found.user.email).slice(0, 1).toUpperCase()}</span
        >
        <div class="profile-text">
          <div class="profile-name">${found.user.name || "Otter account"}</div>
          <div class="profile-email">${found.user.email}</div>
        </div>
      </section>
      <section aria-labelledby="apps-title">
        <h2 id="apps-title">Your apps</h2>
        <nav class="apps" aria-label="Your apps">
          <a class="app" href=${c.env.APP_ORIGIN}
            ><span class="app-mark">${appIcon("mail")}</span
            ><span><strong>Otter Mail</strong><small>Open your inbox</small></span
            ><span class="arrow">${icon("arrow")}</span></a
          >
          <a class="app" href=${c.env.DRIVE_ORIGIN}
            ><span class="app-mark">${appIcon("drive")}</span
            ><span><strong>Otter Drive</strong><small>Open your files</small></span
            ><span class="arrow">${icon("arrow")}</span></a
          >
          <a class="app" href=${codeOrigin(c.env)}
            ><span class="app-mark">${appIcon("code")}</span
            ><span><strong>Otter Code</strong><small>Open your coding workspace</small></span
            ><span class="arrow">${icon("arrow")}</span></a
          >
        </nav>
        <p class="fine"><a href=${c.env.SITE_ORIGIN}>More about Otterware's apps</a></p>
      </section>
      <section class="methods" aria-labelledby="methods-title">
        <h2 id="methods-title">Sign-in methods</h2>
        <div class="settings">
          ${offered.map((method) =>
            method === "password"
              ? html`<div class="row">
                  <div class="method">
                    ${icon("key")}
                    <div>
                      <h2>Password</h2>
                      <p>
                        ${methods.includes("password") ? "Sign in with your email and password." : "Sign in with your email, too."}
                      </p>
                      <p id="password-sent" role="status" hidden>
                        We’ve emailed you a link to choose a password.
                      </p>
                    </div>
                  </div>
                  ${
                    options.password
                      ? html`<button
                          id="password-link"
                          class="secondary"
                          data-email=${found.user.email}
                        >
                          ${methods.includes("password") ? "Change password" : "Add a password"}
                        </button>`
                      : ""
                  }
                </div>`
              : html`<div class="row">
                  <div class="method">
                    ${icon(method)}
                    <div>
                      <h2>${providerNames[method]}</h2>
                      <p>
                        ${methods.includes(method) ? `Sign in with your ${providerNames[method]} account.` : `Sign in with your ${providerNames[method]} account, too.`}
                      </p>
                    </div>
                  </div>
                  ${
                    methods.includes(method)
                      ? html`<span class="badge">Connected</span>`
                      : html`<button class="secondary" data-provider=${method} data-action="link">
                          Connect
                        </button>`
                  }
                </div>`,
          )}
        </div>
        <p class="fine">Otter connects accounts that use ${found.user.email}.</p>
      </section>
      <section class="settings" aria-label="Account settings">
        <div class="row">
          <div>
            <h2>Sign out</h2>
            <p>
              Mail, Drive and Code in this browser. Code connections authorized by this session also
              end.
            </p>
          </div>
          <form method="post" action="/otter/sign-out">
            <input type="hidden" name="app" value="accounts" /><button class="secondary">
              Sign out of Otter
            </button>
          </form>
        </div>
        <div class="row">
          <div>
            <h2>Delete account</h2>
            <p>Permanently remove your account and synced data.</p>
          </div>
          <button id="delete-open" class="danger-link">Delete account…</button>
        </div>
      </section>
      <dialog id="delete-dialog" aria-labelledby="delete-title">
        <h2 id="delete-title">Delete your Otter account?</h2>
        <p>
          This removes your account, synced Mail settings and mailbox list, and signs out your
          devices. Your email stays with your mail provider.
        </p>
        ${linked.some((app) => app.appId === "otter-code") ? html`<p>This also removes your Code cloud connections, notification devices and personal Linear links. Projects and conversations stored on your machines stay there.</p>` : ""}
        ${linked.some((app) => app.appId === "otter-drive") ? html`<p>This also removes your Drive access and API keys. First delete your personal documents and transfer or delete shared drives you own. Documents in other people's shared drives stay with them.</p>` : ""}
        ${
          fresh
            ? ""
            : html`<p>For your security, sign in again before deleting your account.</p>
                <div class="providers">
                  ${methods.flatMap((method) =>
                    method === "password"
                      ? []
                      : html`<button class="secondary wide" data-provider=${method}>
                          ${icon(method)}Sign in again with ${providerNames[method]}
                        </button>`,
                  )}
                </div>
                ${
                  methods.includes("password") && options.password
                    ? html`<form id="reauth" class="email-form">
                        <label for="reauth-password">Password</label
                        ><input
                          id="reauth-password"
                          type="password"
                          autocomplete="current-password"
                          required
                        /><button class="secondary wide" data-email=${found.user.email}>
                          Sign in again
                        </button>
                      </form>`
                    : ""
                }`
        }
        <form id="delete">
          <label for="confirmation">Type DELETE to confirm</label
          ><input
            id="confirmation"
            autocomplete="off"
            required
            pattern="DELETE"
            ${fresh ? "" : "disabled"}
          />
          <p id="delete-message" role="alert"></p>
          <div class="dialog-actions">
            <button id="delete-cancel" type="button" class="secondary" autofocus>Cancel</button
            ><button id="delete-submit" class="danger" disabled>Delete account</button>
          </div>
        </form>
      </dialog>
    `,
    script,
    "",
    "account",
  );
});

routes.post("/delete-account", async (c) => {
  if (c.req.header("origin") !== new URL(c.env.BETTER_AUTH_URL).origin) {
    throw new HTTPException(403, {
      message: "Open your Otter account page to delete your account.",
    });
  }
  const found = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!found) throw new HTTPException(401, { message: "Sign in first." });
  if (Date.now() - found.session.createdAt.getTime() > 10 * 60_000) {
    throw new HTTPException(403, { message: "Sign in again before deleting your account." });
  }
  const body = await c.req.json<{ confirmation?: string }>();
  if (body.confirmation !== "DELETE")
    throw new HTTPException(400, { message: "Type DELETE to confirm." });
  const linked = await c.var.db.query.identityApps.findMany({
    where: eq(identityApps.userId, found.user.id),
  });
  for (const app of [
    { id: "otter-drive", name: "Drive", origin: c.env.DRIVE_ORIGIN, path: "/api/identity/delete" },
    { id: "otter-code", name: "Code", origin: codeRelayOrigin(c.env), path: "/v1/identity/delete" },
  ]) {
    if (!linked.some((membership) => membership.appId === app.id)) continue;
    const now = Math.floor(Date.now() / 1000);
    const { token } = await c.var.auth.api.signJWT({
      body: {
        payload: {
          sub: found.user.id,
          aud: app.id,
          iat: now,
          exp: now + 60,
          jti: crypto.randomUUID(),
          event: "otter.account.delete",
        },
      },
    });
    // Each app releases its own data before the canonical identity is removed.
    const response = await fetch(`${app.origin}${app.path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {
      throw new HTTPException(409, {
        message: `${app.name} is unavailable. Your account has not been deleted; please try again.`,
      });
    });
    if (!response.ok)
      throw new HTTPException(409, {
        message: `${app.name} couldn't release this account. Please try again.`,
      });
  }
  await c.var.db.delete(identityApps).where(eq(identityApps.userId, found.user.id));
  return c.var.auth.api.deleteUser({ headers: c.req.raw.headers, body: {}, asResponse: true });
});

export default routes;
