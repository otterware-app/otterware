import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../accounts/AccountProvider";
import { Button } from "../../components/ui/button";
import { ensureLocalApi } from "../../localApi";
import { browserClient, runInBrowser } from "../browser/runtime";

const readConnections = () =>
  runInBrowser(
    Effect.flatMap(browserClient, (client) => client["browser.account.connections"]({})),
  );
type Connection = Awaited<ReturnType<typeof readConnections>>["connections"][number];

export function BrowserAccountConnections() {
  const auth = useAuth();
  const [connections, setConnections] = useState<readonly Connection[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(
    () => readConnections().then((result) => setConnections(result.connections)),
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    void runInBrowser(
      Effect.flatMap(browserClient, (client) =>
        client["browser.account.watch"]({}).pipe(
          Stream.runForEach((state) =>
            Effect.sync(() => {
              setConnected(state.status === "connected");
              setError(state.message);
              if (state.status === "connected") void refresh().catch(() => {});
              else setConnections([]);
            }),
          ),
        ),
      ),
      controller.signal,
    ).catch(() => {});
    const focus = () => {
      void refresh().catch(() => {});
    };
    window.addEventListener("focus", focus);
    return () => {
      controller.abort();
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const connect = (provider: "google" | "microsoft") =>
    run(async () => {
      const result = await runInBrowser(
        Effect.flatMap(browserClient, (client) =>
          client["browser.account.connect"]({
            provider,
            scopes:
              provider === "google"
                ? [
                    "https://www.googleapis.com/auth/gmail.modify",
                    "https://www.googleapis.com/auth/gmail.settings.basic",
                    "https://www.googleapis.com/auth/contacts.readonly",
                    "https://www.googleapis.com/auth/calendar",
                  ]
                : [
                    "User.Read",
                    "Mail.ReadWrite",
                    "Mail.Send",
                    "Contacts.Read",
                    "Calendars.ReadWrite",
                  ],
            returnTo: "https://mail.otterware.app/settings/mail?pane=accounts",
          }),
        ),
      );
      await ensureLocalApi().shell.openExternal(result.url);
    });
  return (
    <section className="flex flex-col gap-3" aria-label="Mail account connections">
      <p className="text-sm text-muted-foreground">
        This browser · Sign in to use your Otter Account's mail connections. Mail stays available
        without pairing an environment.
      </p>
      {!auth.isSignedIn ? (
        <Button disabled={busy} onClick={() => void auth.signIn()}>
          Sign in to Otterware
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button disabled={!connected || busy} onClick={() => void connect("google")}>
            Connect Google
          </Button>
          <Button disabled={!connected || busy} onClick={() => void connect("microsoft")}>
            Connect Microsoft
          </Button>
          <Button variant="outline" disabled={!connected || busy} onClick={() => void run(refresh)}>
            Refresh connections
          </Button>
        </div>
      )}
      {connections.map((connection) => (
        <div key={connection.id} className="flex items-center justify-between gap-3 text-sm">
          <span>
            {connection.email} · {connection.provider}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(() =>
                runInBrowser(
                  Effect.flatMap(browserClient, (client) =>
                    client["browser.account.disconnect"]({ connectionId: connection.id }),
                  ),
                ),
              )
            }
          >
            Disconnect
          </Button>
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}
    </section>
  );
}
