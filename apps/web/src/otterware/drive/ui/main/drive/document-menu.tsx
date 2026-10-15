import {
  MenuItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  MenuSeparator,
} from "~/components/ui/menu";
import { toastManager } from "~/components/ui/toast";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderIcon,
  LinkIcon,
  MoveRightIcon,
  SparklesIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";
import type { Artifact } from "@otterware/drive-contracts/api";

import { apiFetch } from "../../lib/api";
import { useDriveHost } from "../../host";
import { useFolderRole } from "../folder-role";
import {
  announceSharingChanged,
  folderLabel,
  folderPath,
  useFolders,
  type Folder,
} from "../folders";
import { requestDeleteDocument } from "./delete-dialog";
import { useDocumentActions } from "./documents";
import { FolderMark } from "./folder-mark";
import { requestShare } from "./share-dialog";

/**
 * What you can do to a document, wherever it shows (a row's menus, the
 * viewer's): share it, copy its link or an agent prompt, download it, move
 * it, archive it (with Undo), and, once archived, delete it for good.
 */

export function shareDocument(artifact: Artifact, folderId?: string) {
  requestShare({
    type: "artifact",
    id: artifact.id,
    name: artifact.title,
    url: artifact.url,
    folderId,
  });
}

async function copy(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value);
    toastManager.add({ type: "success", title: message });
  } catch {
    toastManager.add({ type: "error", title: "Could not copy to the clipboard" });
  }
}

export function copyLink(artifact: Artifact) {
  return copy(artifact.url, "Link copied");
}

/** What to paste into an agent so it edits the document with the CLI. */
export function copyAgentPrompt(artifact: Artifact) {
  return copy(
    `Edit my Otter Drive document at ${artifact.url}. Read the current version first and publish a new immutable version with Otter Drive's tools or CLI.`,
    "Prompt copied: paste it into your agent",
  );
}

export async function downloadDocument(
  artifact: Artifact,
  folderId: string | undefined,
  version?: number,
) {
  const query = version ? `?version=${version}` : "";
  try {
    const response = await apiFetch(
      `/api/v1/artifacts/${encodeURIComponent(artifact.id)}/download${query}`,
      { folderId },
    );
    const disposition = response.headers.get("content-disposition");
    const filename =
      disposition?.match(/filename="?([^";]+)"?/i)?.[1] ??
      artifact.currentVersion?.entryPath ??
      artifact.slug;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (reason) {
    toastManager.add({
      type: "error",
      title: "Could not download",
      description: reason instanceof Error ? reason.message : String(reason),
    });
  }
}

/** Archive or restore, with Undo on the toast (Otter Mail's). */
export function useArchiveDocument(folderId: string | undefined) {
  const { setArchived } = useDocumentActions(folderId);
  return async (artifact: Artifact, archived: boolean) => {
    try {
      const result = await setArchived(artifact, archived);
      // A shared document leaves (or rejoins) Shared with me.
      if (!folderId) announceSharingChanged();
      toastManager.add({
        type: "success",
        title: `${archived ? "Archived" : "Restored"} “${artifact.title}”`,
        actionProps: { children: "Undo", onClick: () => void setArchived(result, !archived) },
      });
      return result;
    } catch (reason) {
      toastManager.add({
        type: "error",
        title: `Could not ${archived ? "archive" : "restore"}`,
        description: reason instanceof Error ? reason.message : String(reason),
      });
      return null;
    }
  };
}

export function DocumentMenuItems({
  artifact,
  folderId,
  href,
  version,
  onMoved,
  onDeleted,
}: {
  artifact: Artifact;
  /**
   * The folder you reach the document through; undefined for a document
   * shared with you on its own, which is addressed by its id.
   */
  folderId: string | undefined;
  /** A Drive path; offers "Open in new tab" (rows, not the viewer). */
  href?: string;
  /** The version showing, for Download. */
  version?: number;
  onMoved?: (artifact: Artifact, destination: Folder) => void;
  onDeleted?: (artifact: Artifact) => void;
}) {
  const host = useDriveHost();
  const { folders } = useFolders();
  // The document's own role covers sharing; the folder's is the fallback for
  // responses from before it was reported.
  const folderRole = useFolderRole(folderId, Boolean(folderId) && !artifact.role);
  const role =
    artifact.role ?? (folderRole.isOwner ? "owner" : folderRole.canEdit ? "editor" : "viewer");
  const isOwner = role === "owner";
  const canEdit = role !== "viewer";
  const { move } = useDocumentActions(folderId);
  const archive = useArchiveDocument(folderId);
  const destinations = folders.filter(
    (item) => item.id !== artifact.folderId && item.role === "owner",
  );

  async function moveTo(destination: Folder) {
    try {
      const moved = await move(artifact, destination.id);
      toastManager.add({
        type: "success",
        title: `Moved “${artifact.title}” to ${folderLabel(destination)}`,
      });
      onMoved?.(moved, destination);
    } catch (reason) {
      toastManager.add({
        type: "error",
        title: "Could not move the document",
        description: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  return (
    <>
      {href ? (
        <MenuItem onClick={() => host.openInNewTab(href)}>
          {<ExternalLinkIcon />}Open in new tab
        </MenuItem>
      ) : null}
      <MenuItem onClick={() => shareDocument(artifact, folderId)}>
        {<UserPlusIcon />}Share…
      </MenuItem>
      <MenuItem onClick={() => void copyLink(artifact)}>{<LinkIcon />}Copy link</MenuItem>
      <MenuItem onClick={() => void copyAgentPrompt(artifact)}>
        {<SparklesIcon />}Copy prompt for an agent
      </MenuItem>
      <MenuItem onClick={() => void downloadDocument(artifact, folderId, version)}>
        {<DownloadIcon />}Download
      </MenuItem>
      {isOwner && destinations.length > 0 ? (
        <MenuSub>
          <MenuSubTrigger>
            {<MoveRightIcon />}
            {"Move to"}
          </MenuSubTrigger>
          <MenuSubPopup>
            {destinations.map((destination) => (
              <MenuItem key={destination.id} onClick={() => void moveTo(destination)}>
                {destination.parentId ? (
                  <FolderIcon />
                ) : (
                  <FolderMark folder={destination} className="size-4 text-5xs" />
                )}
                {folderPath(folders, destination).map(folderLabel).join(" › ")}
              </MenuItem>
            ))}
          </MenuSubPopup>
        </MenuSub>
      ) : null}
      {canEdit ? (
        <>
          <MenuSeparator></MenuSeparator>
          {artifact.archivedAt ? (
            <MenuItem onClick={() => void archive(artifact, false)}>
              {<ArchiveRestoreIcon />}Restore
            </MenuItem>
          ) : (
            <MenuItem onClick={() => void archive(artifact, true)}>
              {<ArchiveIcon />}Archive
            </MenuItem>
          )}
        </>
      ) : null}
      {artifact.archivedAt && isOwner ? (
        <MenuItem
          variant="destructive"
          onClick={() =>
            requestDeleteDocument({
              artifact,
              folderId,
              ...(onDeleted ? { onDeleted } : {}),
            })
          }
        >
          {<Trash2Icon />}Delete permanently…
        </MenuItem>
      ) : null}
    </>
  );
}
