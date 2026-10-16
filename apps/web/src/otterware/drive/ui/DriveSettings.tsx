import { QueryClientProvider } from "@tanstack/react-query";
import { DriveHostProvider, type DriveHost } from "./host";
import { useDriveStore } from "./driveStore";
import { FolderPane } from "./main/settings/folder-pane";
import { MembersPane } from "./main/settings/members-pane";
import { ListDensityRow } from "./main/settings/density-row";
import { FolderDialogsHost } from "./main/drive/folder-dialogs";
import { NewFolderDialogHost } from "./main/drive/new-folder-dialog";
import { ShareDialogHost } from "./main/drive/share-dialog";

import { SettingsRow, SettingsSection } from "~/components/settings/settingsLayout";

function Content({ page }: { page: string }) {
  if (page === "command-line")
    return (
      <SettingsSection title="Drive command line">
        <SettingsRow
          id="drive-command-line"
          title="Command line"
          description={
            <>
              Run <code>otterdrive auth login</code> and approve this device in your browser with
              your Otter Account. API keys are optional. Browser approval is currently unavailable
              in this app.
            </>
          }
        />
      </SettingsSection>
    );
  if (page === "appearance")
    return (
      <SettingsSection title="Drive">
        <ListDensityRow />
      </SettingsSection>
    );
  return (
    <>
      {page === "access" ? <MembersPane /> : <FolderPane />}
      <FolderDialogsHost />
      <NewFolderDialogHost />
      <ShareDialogHost />
    </>
  );
}
export function DriveSettings({ host, page = "drives" }: { host: DriveHost; page?: string }) {
  const queryClient = useDriveStore((state) => state.queryClient);
  return (
    <DriveHostProvider host={host}>
      <QueryClientProvider client={queryClient}>
        <Content page={page} />
      </QueryClientProvider>
    </DriveHostProvider>
  );
}
