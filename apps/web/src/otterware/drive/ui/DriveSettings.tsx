import { QueryClientProvider } from "@tanstack/react-query";
import { DriveHostProvider, type DriveHost } from "./host";
import { useDriveStore } from "./driveStore";
import { FolderPane } from "./main/settings/folder-pane";
import { MembersPane } from "./main/settings/members-pane";
import { ListDensityRow } from "./main/settings/density-row";
import { FolderDialogsHost } from "./main/drive/folder-dialogs";
import { NewFolderDialogHost } from "./main/drive/new-folder-dialog";
import { ShareDialogHost } from "./main/drive/share-dialog";
import { RowSelect } from "./components/ui/select";
import { SettingsRow } from "~/components/settings/settingsLayout";
import { folderLabel, useFolders } from "./main/folders";

function Content({ page }: { page: string }) {
  const { folders, activeFolder, selectFolder } = useFolders();
  if (page === "appearance") return <ListDensityRow />;
  return (
    <div className="space-y-6">
      <SettingsRow
        title="Folder"
        description="Account · Stored in Otter Cloud"
        control={
          <RowSelect
            ariaLabel="Folder"
            value={activeFolder?.id}
            options={folders.map((folder) => ({ value: folder.id, label: folderLabel(folder) }))}
            onValueChange={(id) => void selectFolder(id)}
          />
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
