import { useDriveHost } from "../../host";
import { toastManager } from "~/components/ui/toast";
import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UploadIcon } from "lucide-react";
import type { Artifact } from "@otterware/drive-contracts/api";
import { hasDraggedFiles, readDroppedItems, type DroppedItem } from "../../lib/dropped-files";
import { slugify, titleFromName, uploadDocument } from "../../lib/upload-document";

import { isOverlayOpen } from "../keybindings/dispatch";
import type { Folder } from "../folders";

/**
 * Anything dragged onto the window uploads straight away: each file becomes
 * a document, and a folder becomes one multi-file document. Progress shows
 * in a toast that turns into "Uploaded", with Open.
 */
export function useDropUpload(folder: Folder | null, onUploaded: (artifact: Artifact) => void) {
  const host = useDriveHost();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const navigate = useNavigate();

  const accepts = (event: DragEvent) =>
    hasDraggedFiles(event.dataTransfer) &&
    folder !== null &&
    folder.role !== "viewer" &&
    // A dialog (the upload dialog has its own drop zone) keeps its drops.
    !isOverlayOpen();

  async function upload(item: DroppedItem, target: Folder) {
    const title = titleFromName(item.name) || item.name;
    const heading = `Uploading ${title}`;
    const id = toastManager.add({
      type: "loading",
      title: heading,
      timeout: 0,
      description: "Preparing files…",
    });
    try {
      const uploaded = await uploadDocument({
        folderId: target.id,
        files: item.files,
        title,
        slug: slugify(title) || "document",
        retryTakenSlug: true,
        onStatus: (description) =>
          toastManager.update(id, { type: "loading", title: heading, description, timeout: 0 }),
      });
      onUploaded(uploaded);
      toastManager.update(id, {
        type: "success",
        title: `Uploaded ${uploaded.title}`,
        actionProps: {
          children: "Open",
          onClick: () =>
            void navigate({
              to: host.href(
                "/" + encodeURIComponent(target.slug) + "/a/" + encodeURIComponent(uploaded.slug),
              ),
            }),
        },
      });
    } catch (reason) {
      toastManager.update(id, {
        type: "error",
        title: `Could not upload ${title}`,
        description: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  const handlers = {
    onDragEnter(event: DragEvent) {
      if (!accepts(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver(event: DragEvent) {
      if (!accepts(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(event: DragEvent) {
      if (!accepts(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop(event: DragEvent) {
      if (!accepts(event) || !folder) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const target = folder;
      void readDroppedItems(event.dataTransfer).then((items) => {
        if (items.length === 0) {
          toastManager.add({
            type: "error",
            title: "Nothing to upload",
            description: "The dropped folders were empty.",
          });
          return;
        }
        for (const item of items) void upload(item, target);
      });
    },
  };

  return { dragging, handlers };
}

/** Over the content panel while files are dragged in. */
export function DropOverlay({ folder }: { folder: Folder | null }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-(--drive-workspace-topbar-height) right-1 bottom-1 left-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-ring/60 bg-background/80 backdrop-blur-sm "
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-ring/10 text-ring">
          <UploadIcon className="size-6" />
        </span>
        <div>
          <p className="text-lg font-medium text-foreground">Drop to upload to {folder?.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Each file becomes a document. A folder becomes one document.
          </p>
        </div>
      </div>
    </div>
  );
}
