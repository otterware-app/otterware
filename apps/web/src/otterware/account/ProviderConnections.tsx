import { useCallback, useEffect, useState } from "react";
import * as Effect from "effect/Effect";
import { useAuth } from "../../accounts/AccountProvider";
import { Button } from "../../components/ui/button";
import { SettingsRow } from "../../components/settings/settingsLayout";
import { useModuleTarget, browserClient, runInBrowser } from "../browser/runtime";
import { AccountConnections } from "./AccountConnections";
import { connectGoogleInBrowser } from "./browserGoogle";

/** Google on this device for Mail, Calendar and contacts, including standalone profiles. */
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
  const refresh = useCallback(() => {
    void read()
      .then((result) => setConnections(result.connections))
      .catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [auth.userId, refresh]);
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void action()
      .then(refresh)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not update Google."),
      )
      .finally(() => setBusy(false));
  };
  if (!auth.isSignedIn) return null;
  return (
    <>
      <SettingsRow
        title="Google on this device"
        description={
          connections.length
            ? "Connected in this browser. Mail, Calendar and contacts here use it."
            : "Not connected in this browser. Mail, Calendar and contacts here use the Google account you connect here."
        }
        control={
          <Button size="sm" disabled={busy} onClick={() => run(connectGoogleInBrowser)}>
            Connect Google on this device
          </Button>
        }
      />
      {connections.map((connection) => (
        <SettingsRow
          key={connection.id}
          title={connection.email}
          description="Google · Connected on this device"
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(() =>
                  runInBrowser(
                    Effect.flatMap(browserClient, (client) =>
                      client["browser.account.disconnect"]({ connectionId: connection.id }),
                    ),
                  ),
                )
              }
            >
              Remove from this device
            </Button>
          }
        />
      ))}
      {error ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
