import { OTTER_ACCOUNTS_URL } from "@t3tools/shared/otterAccounts";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../accounts/AccountProvider";
import { SettingsRow, SettingsSection } from "../../components/settings/settingsLayout";
import { Button } from "../../components/ui/button";

interface Grant {
  readonly id: string;
  readonly clientId: string;
  readonly usedAt: number;
  readonly current: boolean;
}

const clientNames: Record<string, string> = {
  "otter-code-desktop": "Desktop app",
  "otter-code-web": "Web browser",
  "otter-code-mobile": "Mobile app",
  "otter-code-cli": "Environment or command line",
};

const call = async (token: string, path: string, body?: unknown) => {
  const response = await fetch(`${OTTER_ACCOUNTS_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? null : JSON.stringify(body),
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not reach Otter Accounts.");
  return response.json() as Promise<unknown>;
};

/**
 * Every sign-in of this Otter Account (apps, environments, command lines), each its own grant.
 * Revoking one ends it and the Mail, Calendar and Drive access derived from it.
 */
export function AccountSessions() {
  const auth = useAuth();
  const [grants, setGrants] = useState<ReadonlyArray<Grant> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const token = await auth.getToken();
    if (!token) return setGrants(null);
    const result = (await call(token, "/code/grants")) as { grants: ReadonlyArray<Grant> };
    setGrants(result.grants);
  }, [auth]);
  useEffect(() => {
    if (!auth.isSignedIn) return;
    void load().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Could not load sessions."),
    );
  }, [auth.isSignedIn, load]);
  const revoke = async (grant: Grant) => {
    setBusy(true);
    setError(null);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("Sign in to your Otter Account again.");
      await call(token, "/code/grants/revoke", { id: grant.id });
      if (grant.current) await auth.signOut();
      else await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke that session.");
    } finally {
      setBusy(false);
    }
  };
  if (!auth.isSignedIn) return null;
  return (
    <SettingsSection id="account-sessions" title="Sessions">
      {grants?.map((grant) => (
        <SettingsRow
          key={grant.id}
          title={`${clientNames[grant.clientId] ?? grant.clientId}${grant.current ? " · This app" : ""}`}
          description={`Last active ${new Date(grant.usedAt).toLocaleString()}`}
          control={
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void revoke(grant)}>
              {grant.current ? "Sign out" : "Revoke"}
            </Button>
          }
        />
      ))}
      {error ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  );
}
