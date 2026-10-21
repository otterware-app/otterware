import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import { PROVIDER_SCOPES } from "@otterware/otter-cloud-client/scopes";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { useAuth } from "../../accounts/AccountProvider";
import { SettingsRow } from "../../components/settings/settingsLayout";
import { Button } from "../../components/ui/button";
import { isElectron } from "../../env";
import { ensureLocalApi } from "../../localApi";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  accountState,
  accountConnections,
  signInEnvironment,
  signOutEnvironment,
  unlinkProvider,
} from "./rpc";
import { useConnectProvider } from "./useConnectProvider";

function checked<A, E>(result: AtomCommandResult<A, E>): A {
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}

/**
 * The environment's Otter Account, which Code, Home, Mail, Calendar and Drive there use, and the
 * Google accounts linked to it. A desktop app's built-in environment uses the app's account
 * (`AppAccountHandoff`); any other environment is signed in on itself (any client can approve
 * it), so it keeps working when this client signs out. The linked Google accounts are the same on
 * every device; each device authorizes them itself.
 */
export function AccountConnections({ environmentId }: { environmentId: EnvironmentId }) {
  const auth = useAuth();
  const state = useEnvironmentQuery(accountState({ environmentId, input: {} }));
  const connections = useEnvironmentQuery(
    state.data?.accountId ? accountConnections({ environmentId, input: {} }) : null,
  );
  const canWrite = useAtomValue(signInEnvironment.permissionAtom(environmentId));
  const signIn = useAtomCommand(signInEnvironment);
  const signOut = useAtomCommand(signOutEnvironment);
  const connect = useConnectProvider(environmentId);
  const unlink = useAtomCommand(unlinkProvider);
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
      setError(cause instanceof Error ? cause.message : "Could not update the Otter Account.");
    } finally {
      setBusy(false);
    }
  };
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const account = state.data;
  const pending = account?.pendingSignIn ?? null;
  const differs = Boolean(account?.accountId && auth.userId && account.accountId !== auth.userId);
  // This app runs the environment, so the environment uses this app's sign-in.
  const ownApp = isElectron && environmentId === primaryEnvironmentId;
  // Rows only: the host's "Otter Account connections" card draws the frame.
  return (
    <>
      <SettingsRow
        title={account?.email ?? "Not signed in"}
        description={
          account?.followsApp
            ? account.accountId
              ? "This app's Otter Account. Code, Drive, Mail and Calendar use it."
              : !ownApp
                ? "Uses the Otter Account of the desktop app it runs in."
                : auth.user
                  ? `Connecting to this app's Otter Account (${auth.user.email}).`
                  : "Sign in to this app to use your Otter Account here."
            : account?.accountId
              ? differs
                ? `This environment uses a different Otter Account than this app (${auth.user?.email ?? "you"}).`
                : "This environment's Otter Account. Code, Drive, Mail and Calendar here use it."
              : pending
                ? `Approve code ${pending.userCode} in your browser to sign this environment in.`
                : "Sign this environment in to your Otter Account. It keeps its own sign-in."
        }
        control={
          account?.followsApp ? (
            ownApp && auth.isLoaded && !auth.user ? (
              <Button size="sm" onClick={() => void auth.signIn()}>
                Sign in
              </Button>
            ) : null
          ) : account?.accountId ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!canWrite || busy}
              onClick={() => void run(() => signOut({ environmentId, input: {} }).then(checked))}
            >
              Sign out environment
            </Button>
          ) : pending ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void ensureLocalApi().shell.openExternal(pending.verificationUrl)}
            >
              Open sign-in
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!canWrite || busy}
              onClick={() =>
                void run(async () => {
                  const prompt = checked(await signIn({ environmentId, input: {} }));
                  await ensureLocalApi().shell.openExternal(prompt.verificationUrl);
                })
              }
            >
              Sign in environment
            </Button>
          )
        }
      />
      {account?.accountId ? (
        <>
          <SettingsRow
            title="Google accounts"
            description="Linked to your Otter Account, so every device lists the same ones. Each device authorizes them once for Mail, Calendar and contacts."
            control={
              <Button
                size="sm"
                disabled={!canWrite || busy}
                onClick={() => void run(() => connect("google"))}
              >
                Link Google account
              </Button>
            }
          />
          {connections.data?.map((linked) => {
            const complete = PROVIDER_SCOPES.google.every((scope) =>
              linked.connection?.scopes.includes(scope),
            );
            return (
              <SettingsRow
                key={linked.email}
                title={linked.email}
                description={
                  !linked.connection
                    ? "Not authorized on this device yet."
                    : complete
                      ? "Authorized on this device."
                      : "Authorized on this device for Calendar only. Allow Mail access to use it in Mail."
                }
                control={
                  <div className="flex gap-2">
                    {complete ? null : (
                      <Button
                        size="sm"
                        disabled={!canWrite || busy}
                        onClick={() => void run(() => connect("google", linked.email))}
                      >
                        {linked.connection ? "Allow Mail access" : "Authorize on this device"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canWrite || busy}
                      onClick={() =>
                        void run(() =>
                          unlink({ environmentId, input: { email: linked.email } }).then(checked),
                        )
                      }
                    >
                      Unlink
                    </Button>
                  </div>
                }
              />
            );
          })}
        </>
      ) : null}
      {error || account?.error || state.error ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error ?? account?.error ?? state.error}
        </p>
      ) : null}
    </>
  );
}
