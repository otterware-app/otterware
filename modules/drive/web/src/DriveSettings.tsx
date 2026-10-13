import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button } from "./components/ui/button";
import { ToastProvider } from "./components/ui/toast";
import { DriveHostProvider, type DriveHost } from "./host";
import { setDriveClient } from "./lib/api";
import { UserAvatar } from "./main/drive/folder-mark";
import { FolderPane } from "./main/settings/folder-pane";
import { ListDensityRow } from "./main/settings/density-row";
import { MembersPane } from "./main/settings/members-pane";
import { SettingsRow, SettingsSection, SettingsSectionsInline } from "./main/settings/settings-ui";
import "./styles/drive.css";

/**
 * Settings › Drive in the Otterware shell: which account Drive uses, and the
 * open drive's folder settings and members (the same panes as Drive's own
 * settings, as sections of the shell's screen). Everything here is stored by
 * Drive in Otter Cloud, so it is the same on every device.
 */
export function DriveSettings({ host }: { host: DriveHost }) {
  setDriveClient(host.client);
  const [queryClient] = useState(() => new QueryClient());
  const user = host.account;
  return (
    <DriveHostProvider host={host}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SettingsSectionsInline value>
            <div className="drive-root space-y-10">
              <SettingsSection
                title="Account"
                description="Drive opens with your Otter Account on every device. Stored in Otter Cloud."
              >
                {user ? (
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <UserAvatar user={user} className="size-8 text-xs" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {user.name || user.email}
                      </div>
                      <div className="truncate text-[13px] text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                ) : (
                  <SettingsRow
                    title="Not signed in"
                    description="Sign in with your Otter Account to use Drive."
                    control={
                      <Button size="sm" onClick={host.signIn}>
                        Sign in
                      </Button>
                    }
                  />
                )}
              </SettingsSection>
              <SettingsSection title="Display">
                <ListDensityRow />
              </SettingsSection>
              {user ? (
                <>
                  <FolderPane />
                  <MembersPane />
                </>
              ) : null}
            </div>
          </SettingsSectionsInline>
        </ToastProvider>
      </QueryClientProvider>
    </DriveHostProvider>
  );
}
