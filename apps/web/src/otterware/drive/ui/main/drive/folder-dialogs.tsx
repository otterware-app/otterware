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
import { api } from "../../lib/api";

import { announceFoldersChanged, folderLabel, type Folder } from "../folders";

/**
 * Renaming and deleting a folder, asked from its menus with
 * `requestFolderDialog()` and kept mounted by the home view.
 */

type FolderDialogRequest = {
  action: "rename" | "delete";
  folder: Folder;
  onDeleted?: (folder: Folder) => void;
};

const FOLDER_DIALOG_EVENT = "otterdrive:folder-dialog";

export function requestFolderDialog(request: FolderDialogRequest) {
  window.dispatchEvent(new CustomEvent(FOLDER_DIALOG_EVENT, { detail: request }));
}

export function FolderDialogsHost() {
  const [dialogPending, setDialogPending] = useState(false);
  const [request, setRequest] = useState<FolderDialogRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<FolderDialogRequest>).detail;
      setRequest(detail);
      setName(detail.folder.name);
      setError(null);
      setOpen(true);
    };
    window.addEventListener(FOLDER_DIALOG_EVENT, show);
    return () => window.removeEventListener(FOLDER_DIALOG_EVENT, show);
  }, []);

  const folder = request?.folder;
  const isDrive = folder?.parentId === null;

  async function rename() {
    if (!folder) return;
    setError(null);
    try {
      await api(`/api/v1/folders/${encodeURIComponent(folder.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      announceFoldersChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    }
  }

  async function remove() {
    if (!folder) return;
    setError(null);
    try {
      await api(`/api/v1/folders/${encodeURIComponent(folder.id)}`, {
        method: "DELETE",
      });
      announceFoldersChanged();
      toastManager.add({ type: "success", title: `Deleted “${folder.name}”` });
      request?.onDeleted?.(folder);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    }
  }

  if (request?.action === "delete")
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!dialogPending) setOpen(next);
        }}
      >
        <DialogPopup>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (dialogPending) return;
              setDialogPending(true);
              try {
                await remove();
                setOpen(false);
              } catch {
                /* The operation reports its error and keeps the dialog open. */
              } finally {
                setDialogPending(false);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{`Delete “${folder ? folderLabel(folder) : ""}”?`}</DialogTitle>
              <DialogDescription>
                {isDrive
                  ? "The shared drive goes for good, and its members lose it. It must be empty."
                  : "The folder goes for good, and anyone it was shared with loses it. It must be empty."}
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div className="flex flex-col gap-3">
                {error ? (
                  <p role="alert" className="text-sm text-destructive-foreground">
                    {error}
                  </p>
                ) : null}
              </div>
            </DialogPanel>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={dialogPending}
                onClick={() => {
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant={"destructive"} disabled={dialogPending}>
                {"Delete"}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!dialogPending) setOpen(next);
      }}
    >
      <DialogPopup>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (dialogPending || !name.trim() || name.trim() === folder?.name) return;
            setDialogPending(true);
            try {
              await rename();
              setOpen(false);
            } catch {
              /* The operation reports its error and keeps the dialog open. */
            } finally {
              setDialogPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{isDrive ? "Rename shared drive" : "Rename folder"}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">{"Name"}</span>
                <Input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
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
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={dialogPending || !name.trim() || name.trim() === folder?.name}
            >
              {"Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
