import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { useAuth } from "../../accounts/AccountProvider";
import { Button } from "../../components/ui/button";
import { ensureLocalApi } from "../../localApi";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  accountState,
  accountConnections,
  attachAccount,
  detachAccount,
  connectProvider,
  disconnectProvider,
} from "./rpc";

function checked<A, E>(result: AtomCommandResult<A, E>): A {
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}

/** The account is attached explicitly to the selected environment, including remote ones. */
export function AccountConnections({ environmentId }: { environmentId: EnvironmentId }) {
  const auth = useAuth();
  const state = useEnvironmentQuery(accountState({ environmentId, input: {} }));
  const connections = useEnvironmentQuery(
    state.data?.accountId ? accountConnections({ environmentId, input: {} }) : null,
  );
  const canWrite = useAtomValue(attachAccount.permissionAtom(environmentId));
  const attach = useAtomCommand(attachAccount);
  const detach = useAtomCommand(detachAccount);
  const connect = useAtomCommand(connectProvider);
  const disconnect = useAtomCommand(disconnectProvider);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      state.refresh();
      connections.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect the account.");
    } finally {
      setBusy(false);
    }
  };
  // The environment keeps the suite session; refresh its grant only while this owner is signed in.
  useEffect(() => {
    if (!canWrite || !auth.userId || state.data?.accountId !== auth.userId) return;
    let active = true;
    const refresh = async () => {
      const accessToken = await auth.getToken().catch(() => null);
      if (active && accessToken)
        await attach({ environmentId, input: { accessToken } })
          .then(checked)
          .catch(() => {});
    };
    const timer = window.setInterval(() => void refresh(), 20 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canWrite, auth.userId, auth.getToken, state.data?.accountId, attach, environmentId]);
  const add = (provider: "google" | "microsoft") =>
    run(async () => {
      const result = await connect({
        environmentId,
        input: {
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
        },
      }).then(checked);
      await ensureLocalApi().shell.openExternal(result.url);
    });
  return (
    <section className="flex flex-col gap-3" aria-label="Otter Account connections">
      <p className="text-sm text-muted-foreground">
        Environment scope · Connect your Otter Account to share provider connections and Mail
        preferences with this environment.
      </p>
      {!auth.isSignedIn ? (
        <Button onClick={() => void run(auth.signIn)} disabled={busy}>
          Sign in to Otterware
        </Button>
      ) : !state.data?.accountId ? (
        <Button
          disabled={!canWrite || busy}
          onClick={() =>
            void run(async () => {
              const accessToken = await auth.getToken();
              if (!accessToken) throw new Error("Sign in to your Otter Account again.");
              await attach({ environmentId, input: { accessToken } }).then(checked);
            })
          }
        >
          Use my Otter Account on this environment
        </Button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!canWrite || busy} onClick={() => void add("google")}>
              Connect Google
            </Button>
            <Button disabled={!canWrite || busy} onClick={() => void add("microsoft")}>
              Connect Microsoft
            </Button>
            <Button
              variant="outline"
              disabled={!canWrite || busy}
              onClick={() => void run(() => detach({ environmentId, input: {} }).then(checked))}
            >
              Disconnect environment
            </Button>
          </div>
          {connections.data?.map((connection) => (
            <div key={connection.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {connection.email} · {connection.provider}
              </span>
              <Button
                variant="ghost"
                disabled={!canWrite || busy}
                onClick={() =>
                  void run(() =>
                    disconnect({ environmentId, input: { connectionId: connection.id } }).then(
                      checked,
                    ),
                  )
                }
              >
                Disconnect provider
              </Button>
            </div>
          ))}
        </>
      )}
      {error || state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? state.error}
        </p>
      ) : null}
    </section>
  );
}
