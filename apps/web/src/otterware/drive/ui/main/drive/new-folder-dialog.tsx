import { withDriveSearch } from "~/otterware/drive/drivePaths";
import { useDriveHost } from "../../host";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogPanel,
} from "~/components/ui/dialog";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "../../lib/api";

import { announceFoldersChanged, folderLabel, useFolders, type Folder } from "../folders";

/**
 * A new shared drive (which opens), or a folder inside `parent` (the open
 * folder by default), which appears where you are, as in Google Drive.
 */
export function NewFolderDialog({
  open,
  onOpenChange,
  kind = "folder",
  parent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: "folder" | "shared";
  parent?: Folder | null;
}) {
  const host = useDriveHost();
  const [dialogPending, setDialogPending] = useState(false);
  const { activeFolder, selectFolder } = useFolders(),
    navigate = useNavigate();
  const inside = parent ?? activeFolder;
  const [name, setName] = useState(""),
    [error, setError] = useState<string | null>(null);
  async function create() {
    try {
      const result = await api<{ data: Folder }>("/api/v1/folders", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          kind,
          ...(kind === "folder" ? { parentId: inside?.id } : {}),
        }),
      });
      announceFoldersChanged();
      setName("");
      if (kind === "shared") {
        await selectFolder(result.data.id);
        await navigate({ href: withDriveSearch(host.href("/home"), {}) });
      } else toastManager.add({ type: "success", title: `Created “${result.data.name}”` });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!dialogPending) {
          if (!next) setError(null);
          onOpenChange(next);
        }
      }}
    >
      <DialogPopup>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (dialogPending || !name.trim()) return;
            setDialogPending(true);
            try {
              await create();
              {
                setError(null);
                onOpenChange(false);
              }
            } catch {
              /* The operation reports its error and keeps the dialog open. */
            } finally {
              setDialogPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{kind === "shared" ? "New shared drive" : "New folder"}</DialogTitle>
            <DialogDescription>
              {kind === "shared"
                ? "A drive you share with a team: its members open everything in it."
                : `Inside ${inside ? folderLabel(inside) : "your drive"}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">{"Name"}</span>
                <Input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={kind === "shared" ? "Project" : "Untitled folder"}
                />
                {error ? (
                  <span role="alert" className="text-xs text-destructive-foreground">
                    {error}
                  </span>
                ) : null}
              </label>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={dialogPending}
              onClick={() => {
                {
                  setError(null);
                  onOpenChange(false);
                }
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={dialogPending || !name.trim()}>
              {"Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

const NEW_FOLDER_EVENT = "otterdrive:new-folder";

/** A new folder inside `parent`, from a folder's menu. */
export function requestNewFolder(parent: Folder) {
  window.dispatchEvent(new CustomEvent(NEW_FOLDER_EVENT, { detail: parent }));
}

export function NewFolderDialogHost() {
  const [parent, setParent] = useState<Folder | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = (event: Event) => {
      setParent((event as CustomEvent<Folder>).detail);
      setOpen(true);
    };
    window.addEventListener(NEW_FOLDER_EVENT, show);
    return () => window.removeEventListener(NEW_FOLDER_EVENT, show);
  }, []);
  return <NewFolderDialog open={open} onOpenChange={setOpen} parent={parent} />;
}
