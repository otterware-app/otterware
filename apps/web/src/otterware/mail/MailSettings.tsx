import { useOptionalSettingsScope } from "~/components/settings/SettingsScopeContext";
import type { ReactNode } from "react";
import { useMailStore } from "./mailStore";
import { MailContentProvider } from "./content/host/surface";
import { GeneralRows } from "./content/main/settings/general-rows";
import { ReadingRows } from "./content/main/settings/reading-rows";
import { AccountsPane } from "./content/main/settings/accounts-pane";
import { TranslationSection } from "./content/main/settings/translation-section";
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
        <fieldset disabled={current.host.canWrite?.() === false} className="min-w-0 space-y-6">
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
      <GeneralRows behavior />
    </MailSettingsRows>
  );
}
export function ReadingSettings() {
  return (
    <MailSettingsRows>
      <ReadingRows />
    </MailSettingsRows>
  );
}
export function TranslationSettings() {
  return (
    <MailSettingsRows>
      <TranslationSection />
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
