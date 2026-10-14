import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";
import { toastManager } from "~/components/ui/toast";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { folderUrl } from "../../lib/links";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

import { NewFolderDialog } from "../drive/new-folder-dialog";
import { announceFoldersChanged, driveForFolder, folderLabel, useFolders } from "../folders";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settings-ui";
export function FolderPane() {
  const { activeFolder: folder, folders, selectFolder } = useFolders(),
    drive = driveForFolder(folders, folder);
  const [name, setName] = useState(folder?.name ?? ""),
    [creating, setCreating] = useState(false);
  useEffect(() => setName(folder?.name ?? ""), [folder?.id, folder?.name]);
  async function change(body: object) {
    try {
      await api(`/api/v1/folders/${folder!.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      announceFoldersChanged();
      toastManager.add({ type: "success", title: "Saved" });
    } catch (e) {
      toastManager.add({ type: "error", title: e instanceof Error ? e.message : String(e) });
    }
  }
  return (
    <SettingsPageContainer
      title="Drives and folders"
      description="My Drive is yours alone; share its folders and documents from their menus. Shared drive members can open every folder inside it."
    >
      <SettingsSection title={folder ? folderLabel(folder) : "Folder"}>
        <SettingsRow
          title="Name"
          description={
            folder?.kind === "personal"
              ? "Your personal drive is always called My Drive."
              : undefined
          }
          control={
            folder?.role === "owner" && folder.kind !== "personal" ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void change({ name });
                }}
              >
                <Input
                  aria-label="Folder name"
                  value={name}
                  required
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button type="submit" variant="outline">
                  Save
                </Button>
              </form>
            ) : (
              <span>{folder ? folderLabel(folder) : null}</span>
            )
          }
        />
        {folder?.kind === "folder" && folder.role === "owner" ? (
          <SettingsRow
            id="drive-move-folder"
            title="Move folder"
            description="Its subfolders move with it. Access follows the drive."
            control={
              <Select
                value={folder.parentId ?? undefined ?? null}
                items={folders
                  .filter((f) => f.id !== folder.id && driveForFolder(folders, f)?.id === drive?.id)
                  .map((f) => ({ value: f.id, label: f.name }))}
                disabled={undefined}
                onValueChange={(value) => {
                  if (typeof value === "string") void change({ parentId: value });
                }}
              >
                <SelectTrigger size="sm" aria-label={"Parent folder"}>
                  <SelectValue placeholder={"Select…"} />
                </SelectTrigger>
                <SelectPopup>
                  {folders
                    .filter(
                      (f) => f.id !== folder.id && driveForFolder(folders, f)?.id === drive?.id,
                    )
                    .map((f) => ({ value: f.id, label: f.name }))
                    .map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                </SelectPopup>
              </Select>
            }
          />
        ) : null}
        {folder?.role === "owner" && folder.kind !== "personal" ? (
          <SettingsRow
            id="drive-delete-empty-folder"
            title="Delete empty folder"
            description="Remove documents and subfolders first."
            control={
              <Button
                onClick={() => {
                  if (!confirm(`Delete “${folder.name}”?`)) return;
                  void api(`/api/v1/folders/${folder.id}`, { method: "DELETE" })
                    .then(async () => {
                      announceFoldersChanged();
                      if (folder.parentId) await selectFolder(folder.parentId);
                    })
                    .catch((e) => toastManager.add({ type: "error", title: e.message }));
                }}
                variant={"ghost-destructive"}
              >
                Delete
              </Button>
            }
          />
        ) : null}
      </SettingsSection>
      {folder && (
        <SettingsRow
          id="drive-drive-link"
          title="Drive link"
          description="Account · People with access can open this link."
          control={
            <Button
              onClick={() =>
                void navigator.clipboard.writeText(folderUrl(folder.id)).then(
                  () => toastManager.add({ type: "success", title: "Link copied" }),
                  () => toastManager.add({ type: "error", title: "Could not copy the link" }),
                )
              }
              variant="outline"
            >
              Copy link
            </Button>
          }
        />
      )}
      <SettingsSection id="drive-shared-drives" title="Shared drives">
        <SettingsRow
          id="drive-new-drive"
          title="New shared drive"
          description="A separate drive you can invite people to."
          control={
            <Button onClick={() => setCreating(true)} variant="outline">
              Create shared drive
            </Button>
          }
        />
      </SettingsSection>
      <NewFolderDialog kind="shared" open={creating} onOpenChange={setCreating} />
    </SettingsPageContainer>
  );
}
