import { OTTER_ACCOUNTS_URL } from "@t3tools/shared/otterAccounts";
import { Button } from "../../components/ui/button";
import { useDriveHost } from "../../host";
import { UserAvatar } from "../drive/folder-mark";
import { SettingsGroup, SettingsPageContainer, SettingsRow, SettingsSection } from "./settings-ui";

export function AccountPane() {
  const host = useDriveHost();
  const user = host.account;
  return (
    <SettingsPageContainer title="Account" description="Who you are in Otter Drive.">
      {user ? (
        <SettingsGroup>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <UserAvatar user={user} className="size-10 text-sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {user.name || user.email}
              </div>
              <div className="truncate text-[13px] text-muted-foreground">{user.email}</div>
            </div>
          </div>
        </SettingsGroup>
      ) : null}
      <SettingsSection title="Security">
        <SettingsRow
          title="Otter account"
          description="One account for Otterware: Mail, Calendar, Drive and Code."
          control={
            <Button size="sm" onClick={() => window.open(OTTER_ACCOUNTS_URL, "_blank", "noopener")}>
              Manage account
            </Button>
          }
        />
        <SettingsRow
          title="Sign out of Otter"
          description="Signs out of Drive in this browser. Your other devices and agents stay signed in."
          control={
            <Button size="sm" onClick={() => void host.signOut?.()}>
              Sign out of Otter
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
