import { useOptionalSettingsScope } from "~/components/settings/SettingsScopeContext";
import type { ReactNode } from "react";
import { useMailStore } from "./mailStore";
import { MailContentProvider } from "./content/host/surface";
import { GeneralRows } from "./content/main/settings/general-rows";
import { AppearanceRows } from "./content/main/settings/appearance-rows";
import { AccountsPane } from "./content/main/settings/accounts-pane";
import { TodoistSettingsPane } from "./content/main/integrations/todoist";
import { MailSettingScope } from "./content/main/settings/settings-ui";

function MailSettingsRows({
  children,
  scope = "account",
}: {
  children: ReactNode;
  scope?: "account" | "environment" | "client";
}) {
  const current = useMailStore((s) => s.current);
  const selected = useOptionalSettingsScope();
  if (
    selected?.environment &&
    current &&
    selected.environment.environmentId !== current.host.environmentId
  )
    return (
      <p className="text-sm text-muted-foreground">
        Switch Mail to the selected environment to change its settings.
      </p>
    );
  if (!current)
    return (
      <p className="text-sm text-muted-foreground">
        Connect to an environment with Mail enabled to change these settings.
      </p>
    );
  return (
    <MailContentProvider session={current.session}>
      <MailSettingScope.Provider value={scope}>
        <fieldset
          disabled={current.host.canWrite?.() === false}
          className="flex min-w-0 flex-col gap-8"
        >
          {children}
        </fieldset>
      </MailSettingScope.Provider>
    </MailContentProvider>
  );
}
export function MailboxesSettings() {
  return (
    <MailSettingsRows>
      <AccountsPane />
    </MailSettingsRows>
  );
}
export function AppearanceSettings() {
  return (
    <MailSettingsRows>
      <AppearanceRows />
    </MailSettingsRows>
  );
}
export function GeneralSettings() {
  return (
    <MailSettingsRows>
      <GeneralRows />
    </MailSettingsRows>
  );
}
export function IntegrationsSettings() {
  return (
    <MailSettingsRows scope="environment">
      <TodoistSettingsPane />
    </MailSettingsRows>
  );
}
