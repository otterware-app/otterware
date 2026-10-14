import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";
import { QueryClientProvider } from "@tanstack/react-query";
import { DriveHostProvider, type DriveHost } from "./host";
import { useDriveStore } from "./driveStore";
import { FolderPane } from "./main/settings/folder-pane";
import { MembersPane } from "./main/settings/members-pane";
import { ListDensityRow } from "./main/settings/density-row";
import { FolderDialogsHost } from "./main/drive/folder-dialogs";
import { NewFolderDialogHost } from "./main/drive/new-folder-dialog";
import { ShareDialogHost } from "./main/drive/share-dialog";

import { SettingsRow } from "~/components/settings/settingsLayout";
import { folderLabel, useFolders } from "./main/folders";

function Content({ page }: { page: string }) {
  const { folders, activeFolder, selectFolder } = useFolders();
  if (page === "command-line")
    return (
      <SettingsRow
        id="drive-command-line"
        title="Command line"
        description={
          <>
            Run <code>otterdrive auth login</code> and approve this device in your browser with your
            Otter Account. API keys are optional. Browser approval is currently unavailable in this
            app.
          </>
        }
      />
    );
  if (page === "appearance") return <ListDensityRow />;
  return (
    <div className="space-y-6">
      <SettingsRow
        title="Folder"
        description="Account · Stored in Otter Cloud"
        control={
          <Select
            value={activeFolder?.id ?? null}
            items={folders.map((folder) => ({ value: folder.id, label: folderLabel(folder) }))}
            disabled={undefined}
            onValueChange={(value) => {
              if (typeof value === "string") void selectFolder(value);
            }}
          >
            <SelectTrigger size="sm" aria-label={"Folder"}>
              <SelectValue placeholder={"Select…"} />
            </SelectTrigger>
            <SelectPopup>
              {folders
                .map((folder) => ({ value: folder.id, label: folderLabel(folder) }))
                .map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
            </SelectPopup>
          </Select>
        }
      />
      {page === "access" ? <MembersPane /> : <FolderPane />}
      <FolderDialogsHost />
      <NewFolderDialogHost />
      <ShareDialogHost />
    </div>
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
