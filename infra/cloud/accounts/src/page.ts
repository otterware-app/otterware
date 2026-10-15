/** Accounts wears the same inset canvas, typography and quiet controls as Mail and Drive. */
import type { Context } from "hono";
import { html, raw } from "hono/html";
import { APP_SYMBOLS, type AppName, OTTERWARE_SYMBOL } from "./app-symbols.ts";
import type { App } from "./env.ts";

const themeScript = `
try {
  const theme = localStorage.getItem('otter:accounts:appearance');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {}
`;

export function page(
  c: Context<App>,
  title: string,
  content: ReturnType<typeof html>,
  script: string,
  query = "",
  layout: "welcome" | "account" = "welcome",
  /** The app a welcome page is for: its icon in place of Otterware's. */
  app?: AppName,
) {
  const nonce = crypto.randomUUID();
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "strict-origin");
  c.header(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  );
  return c.html(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>${title} · Otterware</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <script nonce=${nonce}>
          ${raw(themeScript)};
        </script>
        <style nonce=${nonce}>
          :root {
            color-scheme: light dark;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
            font-size: 14px;
            --canvas: light-dark(#fff, #181818);
            --frame: light-dark(#f9f9f9, #202020);
            --text: light-dark(#0d0d0d, #ececec);
            --muted: light-dark(#5d5d5d, #a3a3a3);
            --line: light-dark(#e8e8e8, #2c2c2c);
            --hover: light-dark(#f4f4f4, #262626);
            --primary: light-dark(#0d0d0d, #fff);
            --on-primary: light-dark(#fff, #0d0d0d);
            --error: light-dark(#c4201c, #ff8a8a);
            background: var(--frame);
            color: var(--text);
          }
          :root[data-theme="light"] {
            color-scheme: light;
          }
          :root[data-theme="dark"] {
            color-scheme: dark;
          }
          * {
            box-sizing: border-box;
          }
          [hidden] {
            display: none !important;
          }
          body {
            margin: 0;
          }
          body::before {
            content: "";
            pointer-events: none;
            position: fixed;
            inset: 0;
            opacity: 0.035;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          }
          .topbar {
            height: 42px;
            padding: 0 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
          }
          .wordmark {
            display: flex;
            align-items: center;
            font-weight: 500;
            letter-spacing: -0.025em;
            text-decoration: none;
          }
          .wordmark svg {
            width: 20px;
            height: 20px;
          }
          .wordmark span {
            color: var(--muted);
            margin-left: 4px;
          }
          .canvas {
            position: relative;
            margin: 0 4px 4px;
            /* With its border, it fills the window under the top bar exactly. The window never
               scrolls; a page taller than the canvas scrolls inside it, as in Mail and Drive. */
            box-sizing: border-box;
            height: calc(100svh - 46px);
            overflow-y: auto;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: var(--canvas);
            display: flex;
          }
          main {
            /* Centered while it fits; from the top, not clipped, once it doesn't. */
            margin: auto;
            width: 100%;
            max-width: 416px;
            padding: 48px 32px;
          }
          .welcome {
            text-align: center;
          }
          .brand-mark {
            display: inline-block;
            width: 72px;
            height: 72px;
            object-fit: contain;
            margin-bottom: 20px;
          }
          .app-icon {
            display: block;
            width: 100%;
            height: 100%;
            border-radius: 22.5%;
            box-shadow: 0 0 0 1px var(--line);
          }
          .app-icon rect {
            fill: light-dark(#f8f5ec, #2c2f31);
          }
          .app-icon path {
            fill: light-dark(#2c2f31, #f8f5ec);
          }
          h1 {
            margin: 0 0 12px;
            font-size: 28px;
            font-weight: 500;
            letter-spacing: -0.025em;
            line-height: 1.3;
          }
          h2 {
            margin: 0 0 18px;
            font-size: 15px;
            font-weight: 500;
          }
          p {
            margin: 0 0 24px;
            color: var(--muted);
            line-height: 1.65;
            font-size: 14px;
          }
          a {
            color: inherit;
          }
          button,
          .button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            border: 1px solid transparent;
            border-radius: 8px;
            padding: 10px 16px;
            background: var(--primary);
            color: var(--on-primary);
            font: inherit;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            white-space: nowrap;
          }
          button:hover,
          .button:hover {
            opacity: 0.88;
          }
          button:disabled {
            opacity: 0.45;
            cursor: default;
          }
          button:focus-visible,
          a:focus-visible,
          input:focus-visible,
          summary:focus-visible {
            outline: 2px solid #0285ff;
            outline-offset: 3px;
          }
          .wide {
            width: 100%;
            min-height: 42px;
          }
          .secondary {
            background: var(--canvas);
            color: var(--text);
            border-color: var(--line);
          }
          .quiet {
            background: transparent;
            color: var(--muted);
          }
          .danger {
            background: #c4201c;
            color: #fff;
          }
          .danger-link {
            color: var(--error);
            background: transparent;
          }
          .theme-toggle {
            width: 30px;
            height: 30px;
            padding: 6px;
            background: transparent;
            color: var(--muted);
          }
          svg {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
          }
          .fine {
            font-size: 12px;
            margin: 18px 0 0;
            color: var(--muted);
          }
          .notice {
            padding: 10px 14px;
            margin-bottom: 20px;
            border-radius: 8px;
            background: var(--hover);
            font-size: 13px;
          }
          [role="alert"] {
            color: var(--error);
            font-size: 13px;
            line-height: 1.6;
          }
          [role="alert"]:empty {
            display: none;
          }
          #message {
            margin-top: 16px;
          }
          .account {
            max-width: 720px;
            padding: 48px 32px 64px;
          }
          .account-header {
            margin-bottom: 32px;
          }
          .account-header p {
            margin-bottom: 0;
          }
          .profile {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 20px;
            background: var(--frame);
            border: 1px solid var(--line);
            border-radius: 12px;
            margin-bottom: 32px;
          }
          .avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: var(--hover);
            font-size: 20px;
            font-weight: 500;
            flex-shrink: 0;
          }
          .profile-text {
            min-width: 0;
            flex: 1;
          }
          .profile-name {
            font-size: 15px;
            font-weight: 500;
            margin-bottom: 5px;
            overflow-wrap: anywhere;
          }
          .profile-email {
            font-size: 13px;
            color: var(--muted);
            overflow-wrap: anywhere;
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--muted);
            white-space: nowrap;
          }
          .badge svg {
            width: 14px;
            height: 14px;
          }
          .apps {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 36px;
          }
          .app {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 18px;
            border: 1px solid var(--line);
            border-radius: 10px;
            text-decoration: none;
          }
          .app:hover {
            background: var(--hover);
          }
          .app-mark {
            flex: none;
            width: 36px;
            height: 36px;
          }
          .app strong {
            display: block;
            font-size: 14px;
            font-weight: 500;
          }
          .app small {
            display: block;
            margin-top: 4px;
            color: var(--muted);
            font-size: 12px;
          }
          .arrow {
            margin-left: auto;
            color: var(--muted);
          }
          .settings {
            border-top: 1px solid var(--line);
          }
          .row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            padding: 22px 0;
            border-bottom: 1px solid var(--line);
          }
          .row h2 {
            font-size: 14px;
            margin-bottom: 5px;
          }
          .row p {
            font-size: 13px;
            margin: 0;
          }
          dialog {
            background: var(--canvas);
            color: var(--text);
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 28px;
            width: min(460px, calc(100% - 32px));
            max-height: calc(100svh - 48px);
            overflow-y: auto;
            box-shadow: 0 24px 80px #0003;
          }
          dialog::backdrop {
            background: #0006;
            backdrop-filter: blur(4px);
          }
          dialog h2 {
            font-size: 20px;
            margin-bottom: 16px;
          }
          dialog p {
            font-size: 13px;
            margin-bottom: 16px;
          }
          label {
            display: block;
            font-size: 13px;
            margin: 20px 0 8px;
          }
          input {
            width: 100%;
            border: 1px solid var(--line);
            border-radius: 8px;
            padding: 10px 12px;
            font: inherit;
            background: var(--canvas);
            color: var(--text);
          }
          .dialog-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 24px;
          }
          .providers {
            display: grid;
            gap: 8px;
          }
          .divider {
            display: flex;
            align-items: center;
            gap: 12px;
            margin: 20px 0 4px;
            color: var(--muted);
            font-size: 12px;
          }
          .divider::before,
          .divider::after {
            content: "";
            flex: 1;
            border-top: 1px solid var(--line);
          }
          .email-form {
            text-align: left;
          }
          .email-form label {
            margin-top: 16px;
          }
          .email-form .wide {
            margin-top: 20px;
          }
          .email-form .fine {
            margin-top: 8px;
          }
          button.link {
            padding: 0;
            border: 0;
            background: none;
            color: var(--text);
            font-weight: 400;
            text-decoration: underline;
            text-underline-offset: 2px;
          }
          .switch {
            line-height: 1.8;
          }
          #check-email h2 {
            font-size: 18px;
            margin-bottom: 10px;
          }
          .methods {
            margin: 36px 0;
          }
          .method {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .method > svg {
            color: var(--muted);
          }
          .consent-actions {
            display: flex;
            gap: 8px;
          }
          .consent-actions button {
            flex: 1;
          }
          @media (max-width: 540px) {
            .account {
              padding: 32px 20px;
            }
            .profile {
              flex-wrap: wrap;
              padding: 16px;
            }
            .badge {
              margin-left: 64px;
            }
            .apps {
              grid-template-columns: 1fr;
            }
            .row {
              align-items: flex-start;
              flex-direction: column;
              gap: 12px;
            }
            .row button {
              align-self: flex-start;
            }
          }
        </style>
      </head>
      <body data-query=${query}>
        <header class="topbar">
          <a class="wordmark" href="/otter/account" aria-label="Otterware Accounts"
            ><svg viewBox="134 129 758 758" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="${OTTERWARE_SYMBOL}" /></svg
            ><span>Accounts</span></a
          ><button
            id="theme-toggle"
            class="theme-toggle"
            aria-label="Change appearance"
            title="Change appearance"
          >
            ${icon("theme")}
          </button>
        </header>
        <div class="canvas">
          <main class=${layout}>
            ${
              layout === "welcome"
                ? html`<span class="brand-mark">${appIcon(app)}</span>
                    <h1>${title}</h1>`
                : ""
            }
            ${content}
            <p id="message" role="alert"></p>
          </main>
        </div>
        <script nonce=${nonce}>
          ${raw(`
const toggle = document.querySelector('#theme-toggle');
toggle.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('otter:accounts:appearance', root.dataset.theme); } catch {}
});
${script}`)};
        </script>
      </body>
    </html>`);
}

/** An Otterware app's icon (Otterware's own without one): its symbol on the tile, ivory in light and charcoal in dark. */
export function appIcon(app?: AppName) {
  return html`<svg class="app-icon" viewBox="0 0 1024 1024" aria-hidden="true">
    <rect width="1024" height="1024" rx="230" />
    <path fill-rule="evenodd" d="${app ? APP_SYMBOLS[app] : OTTERWARE_SYMBOL}" />
  </svg>`;
}

export function icon(name: "arrow" | "theme" | "google" | "microsoft" | "key") {
  const paths = {
    arrow: html`<path d="M7 17 17 7M7 7h10v10" />`,
    theme: html`<circle cx="12" cy="12" r="8" /><path d="M12 4v16" />`,
    google: html`<path d="M20 12h-8m8 0a8 8 0 1 1-2.3-5.7M20 12c0 4.4-3.6 8-8 8" />`,
    microsoft: html`<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />`,
    key: html`<circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-4 0 1 1" />`,
  };
  return html`<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${paths[name]}
  </svg>`;
}

/** The tab's icon: Otterware's, following the system's light or dark. */
export const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><style>rect{fill:#f8f5ec}path{fill:#2c2f31}@media (prefers-color-scheme:dark){rect{fill:#2c2f31}path{fill:#f8f5ec}}</style><rect width="1024" height="1024" rx="230"/><path fill-rule="evenodd" d="${OTTERWARE_SYMBOL}"/></svg>`;
