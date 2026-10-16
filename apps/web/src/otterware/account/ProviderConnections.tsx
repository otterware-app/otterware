import { useEffect, useState } from "react";
import * as Effect from "effect/Effect";
import { useAuth } from "../../accounts/AccountProvider";
import { Button } from "../../components/ui/button";
import { SettingsRow } from "../../components/settings/settingsLayout";
import { useModuleTarget, browserClient, runInBrowser } from "../browser/runtime";
import { AccountConnections } from "./AccountConnections";

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
  return (
    <>
      <SettingsRow
        title="Google on this device"
        description="Not available in this browser yet. Google is connected separately on each device and does not carry over between them."
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
