import { useEffect, useState } from "react";
import * as Effect from "effect/Effect";
import { useAuth } from "../../accounts/AccountProvider";
import { Button } from "../../components/ui/button";
import { SettingsRow } from "../../components/settings/settingsLayout";
import { ensureLocalApi } from "../../localApi";
import { useModuleTarget, browserClient, runInBrowser } from "../browser/runtime";
import { AccountConnections } from "./AccountConnections";

/** One Google connection supplies Mail and Calendar, including standalone profiles. */
export function ProviderConnections() {
  const target = useModuleTarget();
  return target._tag === "environment" ? (
    <AccountConnections environmentId={target.environmentId} />
  ) : (
    <BrowserConnections />
  );
}
const read = () =>
  runInBrowser(
    Effect.flatMap(browserClient, (client) => client["browser.account.connections"]({})),
  );
function BrowserConnections() {
  const auth = useAuth();
  const [connections, setConnections] = useState<Awaited<ReturnType<typeof read>>["connections"]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void read()
        .then((result) => {
          if (active) setConnections(result.connections);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [auth.userId]);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!auth.isSignedIn) {
        await auth.signIn();
        return;
      }
      const result = await runInBrowser(
        Effect.flatMap(browserClient, (client) =>
          client["browser.account.connect"]({
            provider: "google",
            scopes: [
              "https://www.googleapis.com/auth/gmail.modify",
              "https://www.googleapis.com/auth/gmail.settings.basic",
              "https://www.googleapis.com/auth/contacts.readonly",
              "https://www.googleapis.com/auth/calendar",
            ],
            returnTo: window.location.href,
          }),
        ),
      );
      await ensureLocalApi().shell.openExternal(result.url);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SettingsRow
        title="Google"
        description="Account · One sign-in for Mail and Calendar."
        control={
          <Button size="sm" disabled={busy} onClick={() => void connect()}>
            {auth.isSignedIn ? "Connect Google" : "Sign in to Otterware"}
          </Button>
        }
      />
      {connections.map((connection) => (
        <SettingsRow
          key={connection.id}
          title={connection.email}
          description={connection.provider}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void runInBrowser(
                  Effect.flatMap(browserClient, (client) =>
                    client["browser.account.disconnect"]({ connectionId: connection.id }),
                  ),
                )
                  .then(read)
                  .then((result) => setConnections(result.connections))
                  .catch((cause) => setError(String(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Disconnect
            </Button>
          }
        />
      ))}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
