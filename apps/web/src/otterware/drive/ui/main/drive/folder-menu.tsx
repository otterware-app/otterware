import { MenuItem, MenuSeparator } from "~/components/ui/menu";
import { toastManager } from "~/components/ui/toast";
import {
  FolderOpenIcon,
  FolderPlusIcon,
  LinkIcon,
  PencilIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

import { folderUrl } from "../../lib/links";
import { folderLabel, type Folder } from "../folders";
import { requestFolderDialog } from "./folder-dialogs";
import { requestNewFolder } from "./new-folder-dialog";
import { requestShare } from "./share-dialog";

/** Where a folder opens: `/home?folder=…`, for anyone with access. */
function folderLink(folder: Pick<Folder, "id">) {
  return folderUrl(folder.id);
}

export function shareFolder(folder: Folder) {
  requestShare({ type: "folder", id: folder.id, name: folderLabel(folder) });
}

/**
 * What you can do to a folder, wherever it shows (the list, the sidebar's
 * tree): open it, share it (a shared drive manages its members), copy its
 * link, add a folder inside, rename it, and delete it once it's empty.
 */
export function FolderMenuItems({
  folder,
  onOpen,
  onDeleted,
}: {
  folder: Folder;
  onOpen?: () => void;
  onDeleted?: (folder: Folder) => void;
}) {
  const isDrive = folder.parentId === null;
  const canEdit = folder.role !== "viewer";
  const canRename = isDrive ? folder.kind === "shared" && folder.role === "owner" : canEdit;
  return (
    <>
      {onOpen ? <MenuItem onClick={onOpen}>{<FolderOpenIcon />}Open</MenuItem> : null}
      {folder.kind !== "personal" ? (
        <MenuItem onClick={() => shareFolder(folder)}>
          {isDrive ? <UsersIcon /> : <UserPlusIcon />}
          {isDrive ? (folder.role === "owner" ? "Manage members…" : "Members…") : "Share…"}
        </MenuItem>
      ) : null}
      <MenuItem
        onClick={() =>
          void navigator.clipboard.writeText(folderLink(folder)).then(
            () => toastManager.add({ type: "success", title: "Link copied" }),
            () => toastManager.add({ type: "error", title: "Could not copy to the clipboard" }),
          )
        }
      >
        {<LinkIcon />}Copy link
      </MenuItem>
      {canEdit ? (
        <MenuItem onClick={() => requestNewFolder(folder)}>
          {<FolderPlusIcon />}New folder inside
        </MenuItem>
      ) : null}
      {canRename ? (
        <MenuItem onClick={() => requestFolderDialog({ action: "rename", folder })}>
          {<PencilIcon />}Rename…
        </MenuItem>
      ) : null}
      {folder.role === "owner" && folder.kind !== "personal" ? (
        <>
          <MenuSeparator></MenuSeparator>
          <MenuItem
            variant="destructive"
            onClick={() =>
              requestFolderDialog({
                action: "delete",
                folder,
                ...(onDeleted ? { onDeleted } : {}),
              })
            }
          >
            {<Trash2Icon />}Delete…
          </MenuItem>
        </>
      ) : null}
    </>
  );
}
