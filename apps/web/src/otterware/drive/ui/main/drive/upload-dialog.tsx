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
import { Button } from "~/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpenIcon, UploadIcon, XIcon } from "lucide-react";
import type { Artifact } from "@otterware/drive-contracts/api";
import {
  pickEntryPath,
  relativePaths,
  slugify,
  titleFromName,
  uploadDocument,
  type PickedFile,
} from "../../lib/upload-document";

import { cn } from "~/lib/utils";
import { formatBytes } from "./documents";

/**
 * Upload with a title and slug of your choosing (dropping files anywhere
 * uploads them straight away instead). Asked from anywhere with
 * `requestUpload()`; the home view keeps it mounted.
 */

const UPLOAD_EVENT = "otterdrive:upload-artifact";

export function requestUpload() {
  window.dispatchEvent(new Event(UPLOAD_EVENT));
}

export function UploadDialogHost({
  folder,
  onUploaded,
}: {
  folder: { id: string; name: string } | null;
  onUploaded: (artifact: Artifact) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(UPLOAD_EVENT, show);
    return () => window.removeEventListener(UPLOAD_EVENT, show);
  }, []);
  return (
    <UploadDialog
      open={open && folder !== null}
      folder={folder}
      onOpenChange={setOpen}
      onUploaded={onUploaded}
    />
  );
}

function UploadDialog({
  open,
  folder,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  folder: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onUploaded: (artifact: Artifact) => void;
}) {
  const [dialogPending, setDialogPending] = useState(false);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) return;
    setFiles([]);
    setTitle("");
    setSlug("");
    setSlugEdited(false);
    setStatus(null);
    setError(null);
  }, [open]);

  const totalBytes = useMemo(() => files.reduce((sum, item) => sum + item.file.size, 0), [files]);
  const entryPath = files.length > 0 ? pickEntryPath(files) : null;

  function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    const picked = relativePaths(list);
    setFiles(picked);
    setError(null);
    if (!title) {
      const source =
        picked.length === 1
          ? picked[0]!.file.name
          : (list[0]!.webkitRelativePath.split("/")[0] ?? "");
      const suggested = titleFromName(source);
      setTitle(suggested);
      if (!slugEdited) setSlug(slugify(suggested));
    }
  }

  async function upload() {
    if (!folder || files.length === 0 || !entryPath) return;
    const finalSlug = slug || slugify(title);
    if (!title.trim() || !finalSlug) {
      setError("A title and slug are required.");
      throw new Error("missing title");
    }
    setError(null);
    try {
      const uploaded = await uploadDocument({
        folderId: folder.id,
        files,
        title: title.trim(),
        slug: finalSlug,
        onStatus: setStatus,
      });
      onUploaded(uploaded);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus(null);
      throw reason;
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!(dialogPending || status !== null)) onOpenChange(next);
      }}
    >
      <DialogPopup>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (dialogPending || status !== null || files.length === 0 || !title.trim()) return;
            setDialogPending(true);
            try {
              await upload();
              onOpenChange(false);
            } catch {
              /* The operation reports its error and keeps the dialog open. */
            } finally {
              setDialogPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{"Upload"}</DialogTitle>
            <DialogDescription>
              {
                <>
                  A file or a folder becomes version 1 of a new document in{" "}
                  <span className="text-foreground">{folder?.name}</span>.
                </>
              }
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3">
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(event) => pick(event.target.files)}
              />
              <input
                ref={folderInput}
                type="file"
                hidden
                // @ts-expect-error non-standard attribute understood by browsers
                webkitdirectory=""
                onChange={(event) => pick(event.target.files)}
              />
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  pick(event.dataTransfer.files);
                }}
                className={cn(
                  "flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-input bg-surface-raised/40 px-4 py-5 text-center transition-colors",
                  dragging && "border-ring bg-ring/5",
                )}
              >
                {files.length === 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">Drop files or a folder here, or</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => fileInput.current?.click()}
                        variant="outline"
                      >
                        <UploadIcon />
                        Choose files
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => folderInput.current?.click()}
                        variant="outline"
                      >
                        <FolderOpenIcon />
                        Choose folder
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex w-full items-center gap-3 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">
                        {files.length} {files.length === 1 ? "file" : "files"} ·{" "}
                        {formatBytes(totalBytes)}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        Opens <code className="font-mono">{entryPath}</code>
                      </p>
                    </div>
                    <Button
                      size="icon-sm"
                      aria-label="Change selection"
                      disabled={status !== null}
                      onClick={() => setFiles([])}
                      variant={"ghost-muted"}
                    >
                      <XIcon />
                    </Button>
                  </div>
                )}
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">{"Title"}</span>
                <Input
                  value={title}
                  disabled={status !== null}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (!slugEdited) setSlug(slugify(event.target.value));
                  }}
                  placeholder="Quarterly report"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">{"Slug"}</span>
                <span className="text-xs text-muted-foreground">
                  {"The last part of the document's link."}
                </span>
                <Input
                  font="mono"
                  value={slug}
                  disabled={status !== null}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(slugify(event.target.value));
                  }}
                  placeholder="quarterly-report"
                />
                {error ? (
                  <span role="alert" className="text-xs text-destructive-foreground">
                    {error}
                  </span>
                ) : null}
              </label>
              {status ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {status}
                </p>
              ) : null}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={dialogPending || status !== null}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={dialogPending || status !== null || files.length === 0 || !title.trim()}
            >
              {status ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
