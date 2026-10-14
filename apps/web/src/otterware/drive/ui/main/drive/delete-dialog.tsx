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
import type { Artifact } from "@otterware/drive-contracts/api";
import { api } from "../../lib/api";

/**
 * Permanent deletion, asked from anywhere (a row's menu, the viewer) and
 * confirmed in one dialog the home view keeps mounted: type the document's
 * slug to delete every version and file.
 */

const DELETE_EVENT = "otterdrive:delete-document";

type DeleteRequest = {
  artifact: Artifact;
  folderId: string | undefined;
  onDeleted?: (artifact: Artifact) => void;
};

export function requestDeleteDocument(request: DeleteRequest) {
  window.dispatchEvent(new CustomEvent(DELETE_EVENT, { detail: request }));
}

export function DeleteDocumentDialogHost({
  onDeleted,
}: {
  /** Runs after any deletion (the lists drop the document). */
  onDeleted: (artifact: Artifact, folderId: string | undefined) => void;
}) {
  const [dialogPending, setDialogPending] = useState(false);
  const [request, setRequest] = useState<DeleteRequest | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      setRequest((event as CustomEvent<DeleteRequest>).detail);
      setConfirmation("");
      setError(null);
    };
    window.addEventListener(DELETE_EVENT, open);
    return () => window.removeEventListener(DELETE_EVENT, open);
  }, []);

  const artifact = request?.artifact;

  async function remove() {
    if (!request || confirmation !== request.artifact.slug) return;
    setError(null);
    try {
      await api<void>(`/api/v1/artifacts/${encodeURIComponent(request.artifact.id)}/permanent`, {
        method: "DELETE",
        folderId: request.folderId,
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      throw reason;
    }
    onDeleted(request.artifact, request.folderId);
    request.onDeleted?.(request.artifact);
    toastManager.add({ type: "success", title: `Deleted “${request.artifact.title}”` });
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(next) => {
        if (!dialogPending) {
          if (!next) setRequest(null);
        }
      }}
    >
      <DialogPopup>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (dialogPending || !artifact || confirmation !== artifact.slug) return;
            setDialogPending(true);
            try {
              await remove();
              {
                setRequest(null);
              }
            } catch {
              /* The operation reports its error and keeps the dialog open. */
            } finally {
              setDialogPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{"Delete permanently?"}</DialogTitle>
            <DialogDescription>
              {
                <>
                  Every version and file of{" "}
                  <span className="font-medium text-foreground">{artifact?.title}</span> goes for
                  good. This can’t be undone.
                </>
              }
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">
                  {
                    <>
                      Type <code className="font-mono text-foreground">{artifact?.slug}</code> to
                      confirm
                    </>
                  }
                </span>
                <Input
                  font="mono"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
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
                  setRequest(null);
                }
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={"destructive"}
              disabled={dialogPending || !artifact || confirmation !== artifact.slug}
            >
              {"Delete permanently"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
