import { OTTER_ACCOUNTS_URL } from "@t3tools/shared/otterAccounts";
import { ensureLocalApi } from "../../localApi";
/**
 * Settings › Account (ADR 0020): the Otter Account this client is signed in
 * to, and the environment it is attached to. Modules add their own rows here
 * (Mail's devices and agent tokens, Drive's API keys) through a settings page
 * placed on `account`; they never draw an account screen of their own.
 */
import { useOptionalSettingsScope } from "../../components/settings/SettingsScopeContext";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "../../components/settings/settingsLayout";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../accounts/AccountProvider";
import { useModuleEnvironmentId } from "../browser/moduleEndpoint";
import { AccountConnections } from "./AccountConnections";

export function AccountSettingsPage() {
  const auth = useAuth();
  const scope = useOptionalSettingsScope();
  const primaryEnvironmentId = useModuleEnvironmentId();
  const environmentId = scope?.environment?.environmentId ?? primaryEnvironmentId;
  return (
    <SettingsPageContainer>
      <SettingsSection id="account" title="Otter Account">
        <SettingsRow
          id="account-session"
          title={auth.user ? (auth.user.name ?? auth.user.email) : "Not signed in"}
          description={
            auth.user
              ? `${auth.user.email} · Account scope: preferences and pins follow this account to every device.`
              : "Sign in to sync your preferences, projects and rail pins across devices."
          }
          control={
            !auth.isLoaded ? null : auth.user ? (
              <Button variant="outline" size="sm" onClick={() => void auth.signOut()}>
                Sign out
              </Button>
            ) : (
              <Button size="sm" onClick={() => void auth.signIn()}>
                Sign in
              </Button>
            )
          }
        />
        <SettingsRow
          id="account-security"
          title="Security"
          description="Account · Manage your sign-in methods and account security."
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void ensureLocalApi().shell.openExternal(OTTER_ACCOUNTS_URL)}
            >
              Manage account
            </Button>
          }
        />
        <SettingsRow
          id="account-command-line"
          title="Command line"
          description={
            <>
              Run <code>otterdrive auth login</code> in your terminal, then approve the sign-in in
              your browser with your Otter Account.
            </>
          }
        />
      </SettingsSection>
      {environmentId !== null ? (
        <SettingsSection id="account-environment" title="Environment">
          <AccountConnections environmentId={environmentId} accountOnly />
        </SettingsSection>
      ) : null}
    </SettingsPageContainer>
  );
}
