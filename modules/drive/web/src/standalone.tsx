// @effect-diagnostics globalDate:off -- Browser OAuth authorization expiry.
import { StrictMode, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createAccountSession } from "@t3tools/client-runtime/accounts";
import {
  ACCOUNT_CLIENT_IDS,
  OTTER_ACCOUNTS_URL,
  OTTER_CODE_RELAY_URL,
  accountAuthorizationUrl,
  createAccountAuthorization,
} from "@t3tools/shared/otterAccounts";
import { DriveApp, createDriveCloudClient } from "./DriveApp";
import type { DriveHost } from "./host";
import { DriveThemeProvider } from "./lib/theme";
import "./styles/standalone.css";

/**
 * The standalone Drive web app: the `drive` profile for someone who runs no
 * Otterware server (ADR 0008). It signs in to the Otter Account itself and
 * calls Otter Cloud directly. Served at the site root (drive.otterware.app's
 * links) or below `/drive`.
 */

const SESSION_KEY = "otter-drive-account-session-v1";
const PENDING_KEY = "otter-drive-authorization";
const CALLBACK_PATH = "/account/callback";
const prefix =
  location.pathname === "/drive" || location.pathname.startsWith("/drive/") ? "/drive" : "";
const redirectUri = `${location.origin}${CALLBACK_PATH}`;

function currentLocation() {
  return `${location.pathname}${location.search}`;
}

function subscribeToHistory(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener("drive:navigate", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("drive:navigate", onChange);
  };
}

function useBrowserLocation() {
  const current = useSyncExternalStore(subscribeToHistory, currentLocation);
  return useMemo(() => {
    const url = new URL(current, location.origin);
    const pathname = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length) || "/"
      : url.pathname;
    return { pathname, search: url.search };
  }, [current]);
}

function go(to: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", `${prefix}${to}`);
  window.dispatchEvent(new Event("drive:navigate"));
}

function readPending(): { state: string; verifier: string; returnTo: string } {
  const stored = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  const pending: unknown = stored ? JSON.parse(stored) : null;
  if (
    !pending ||
    typeof pending !== "object" ||
    !("state" in pending) ||
    !("verifier" in pending) ||
    !("expiresAt" in pending) ||
    !("returnTo" in pending) ||
    typeof pending.state !== "string" ||
    typeof pending.verifier !== "string" ||
    typeof pending.returnTo !== "string" ||
    typeof pending.expiresAt !== "number" ||
    pending.expiresAt < Date.now()
  )
    throw new Error("This sign-in request expired. Start sign-in again.");
  return pending as { state: string; verifier: string; returnTo: string };
}

/** Where to land after signing in: a Drive page on this site, never elsewhere. */
function safeReturn(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/home";
}

function StandaloneDrive() {
  const [manager] = useState(() =>
    createAccountSession({
      accountsUrl: OTTER_ACCOUNTS_URL,
      resource: OTTER_CODE_RELAY_URL,
      clientId: ACCOUNT_CLIENT_IDS.web,
      fetch: window.fetch.bind(window),
      storage: {
        read: async () => localStorage.getItem(SESSION_KEY),
        write: async (value) => {
          if (value) localStorage.setItem(SESSION_KEY, value);
          else localStorage.removeItem(SESSION_KEY);
        },
      },
      ...(navigator.locks
        ? {
            withStorageLock: <T,>(work: () => Promise<T>) =>
              navigator.locks.request(SESSION_KEY, work),
          }
        : {}),
    }),
  );
  const snapshot = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client] = useState(() => createDriveCloudClient(manager.readToken));
  const where = useBrowserLocation();

  useEffect(() => {
    let active = true;
    void (async () => {
      await manager.load();
      if (location.pathname === CALLBACK_PATH) {
        const query = new URLSearchParams(location.hash.slice(1) || location.search);
        const pending = readPending();
        const code = query.get("code");
        if (
          query.get("state") !== pending.state ||
          !code ||
          query.get("iss") !== OTTER_ACCOUNTS_URL
        )
          throw new Error("This sign-in request expired. Start sign-in again.");
        await manager.signIn({ code, verifier: pending.verifier, redirectUri });
        history.replaceState(null, "", safeReturn(pending.returnTo));
        window.dispatchEvent(new Event("drive:navigate"));
      } else await manager.validate();
    })()
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not finish sign-in.");
      })
      .finally(() => {
        if (active) setRestored(true);
      });
    // Signing in or out in another tab.
    const changed = (event: StorageEvent) => {
      if (event.key === SESSION_KEY) void manager.load().catch(() => undefined);
    };
    window.addEventListener("storage", changed);
    return () => {
      active = false;
      window.removeEventListener("storage", changed);
    };
  }, [manager]);

  const user = snapshot.user;
  const host = useMemo(
    (): DriveHost => ({
      client,
      account: user
        ? {
            id: user.id,
            name: user.name ?? user.email,
            email: user.email,
            image: user.image,
          }
        : null,
      accountPending: !restored,
      signIn: () => {
        const request = createAccountAuthorization(crypto);
        sessionStorage.setItem(
          PENDING_KEY,
          JSON.stringify({
            state: request.state,
            verifier: request.verifier,
            returnTo: currentLocation(),
            expiresAt: Date.now() + 600_000,
          }),
        );
        location.assign(
          accountAuthorizationUrl({
            accountsUrl: OTTER_ACCOUNTS_URL,
            resource: OTTER_CODE_RELAY_URL,
            clientId: ACCOUNT_CLIENT_IDS.web,
            redirectUri,
            challenge: request.challenge,
            state: request.state,
          }),
        );
      },
      signOut: async () => {
        await manager.signOut();
        client.clearSession();
      },
      location: where.pathname === CALLBACK_PATH ? { pathname: "/home", search: "" } : where,
      navigate: (to, options) => go(to, options?.replace),
      href: (to) => `${prefix}${to}`,
      embedded: false,
      active: true,
    }),
    [client, manager, restored, user, where],
  );

  return (
    <DriveThemeProvider>
      {error ? (
        <p
          role="alert"
          className="absolute inset-x-0 top-0 z-50 bg-error-surface px-4 py-2 text-center text-[13px] text-error-foreground"
        >
          {error}
        </p>
      ) : null}
      <DriveApp host={host} />
    </DriveThemeProvider>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <StandaloneDrive />
    </StrictMode>,
  );
