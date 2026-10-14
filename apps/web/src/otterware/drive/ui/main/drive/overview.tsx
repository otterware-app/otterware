import { useDriveHost } from "../../host";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "~/components/ui/empty";
import { Button } from "~/components/ui/button";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FilesIcon, FolderIcon, UploadIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import type { Artifact, SharedItem } from "@otterware/drive-contracts/api";

import { shortcutLabel } from "../keybindings/commands";
import { folderLabel, type Folder } from "../folders";
import { DocumentThumb } from "./document-list";
import { KIND_META, WEEK_MS, documentKind, formatRelative } from "./documents";
import { NewFolderDialog } from "./new-folder-dialog";
import { useDriveAccount } from "../../host";
import { FolderMark, UserAvatar } from "./folder-mark";
import { shareFolder } from "./folder-menu";
import { requestUpload } from "./upload-dialog";

/**
 * The main pane with no document open (Otter Mail's "Select a conversation",
 * made useful): the folder at a glance, and its latest documents to pick up
 * where you left off.
 */
export function Overview({
  folder,
  documents,
  loading,
  noFolder,
}: {
  folder: Folder | null;
  documents: Artifact[];
  loading: boolean;
  noFolder: boolean;
}) {
  if (noFolder) return <NoFolder />;
  if (loading || !folder) return null;
  const active = documents.filter((artifact) => !artifact.archivedAt);
  if (active.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div>
          <Empty size="compact">
            <EmptyMedia variant="icon">
              <FilesIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{`${folderLabel(folder)} has no documents yet`}</EmptyTitle>
              <EmptyDescription>
                {folder.role === "viewer"
                  ? "You can view this folder. Its editors add documents."
                  : "Drop files or folders anywhere in the window, or upload them. Agents can publish here too, with the otterdrive CLI."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {
                <>
                  {folder.role === "viewer" ? null : (
                    <Button onClick={requestUpload} variant="default">
                      <UploadIcon />
                      Upload
                    </Button>
                  )}
                  <ShareFolderButton folder={folder} />
                </>
              }
            </EmptyContent>
          </Empty>
        </div>
      </div>
    );
  }
  return <FolderOverview folder={folder} documents={active} />;
}

function FolderOverview({ folder, documents }: { folder: Folder; documents: Artifact[] }) {
  const stats = useMemo(() => {
    const week = Date.now() - WEEK_MS;
    return {
      versions: documents.reduce((sum, item) => sum + item.versionCount, 0),
      thisWeek: documents.filter((item) => new Date(item.updatedAt).getTime() >= week).length,
    };
  }, [documents]);
  const recent = useMemo(
    () =>
      [...documents]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 6),
    [documents],
  );

  return (
    <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[47rem] space-y-10 px-6 pt-14 pb-20">
        <header className="flex items-center gap-4 px-4.25">
          {folder.parentId ? (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-icon-muted">
              <FolderIcon className="size-5.5" strokeWidth={1.75} />
            </span>
          ) : (
            <FolderMark folder={folder} className="size-11 rounded-xl text-base" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl leading-8 font-medium tracking-tight text-foreground">
              {folderLabel(folder)}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {folder.kind === "shared" ? "Shared drive · " : folder.shared ? "Shared · " : ""}
              Last change {formatRelative(recent[0]!.updatedAt)}
            </p>
          </div>
          <ShareFolderButton folder={folder} />
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Documents" value={documents.length} />
          <Stat label="Versions" value={stats.versions} />
          <Stat label="Updated this week" value={stats.thisWeek} />
        </div>

        <section>
          <h2 className="mb-3 px-4.25 text-sm font-medium text-foreground">Recently updated</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {recent.map((artifact) => (
              <RecentCard key={artifact.id} artifact={artifact} folderSlug={folder.slug} />
            ))}
          </div>
        </section>

        <p
          hidden={folder.role === "viewer"}
          className="px-4.25 text-center text-sm text-muted-foreground"
        >
          Drop files anywhere to upload them, or press{" "}
          <kbd className="font-sans text-foreground">{shortcutLabel("document.upload")}</kbd>. Press{" "}
          <kbd className="font-sans text-foreground">{shortcutLabel("commandPalette.toggle")}</kbd>{" "}
          to find anything.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3.5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl leading-8 font-normal tracking-tight text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}

function RecentCard({
  artifact,
  folderSlug,
  subtitle,
}: {
  artifact: Artifact;
  folderSlug: string;
  subtitle?: string;
}) {
  const host = useDriveHost();
  const kind = KIND_META[documentKind(artifact)].one;
  return (
    <Link
      to={host.href(
        "/" + encodeURIComponent(folderSlug) + "/a/" + encodeURIComponent(artifact.slug),
      )}

      search={(current) => ({ ...current, sheet: undefined })}
      className="group flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card p-1.5 pb-2.5 outline-none transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <DocumentThumb
        artifact={artifact}
        className="aspect-[16/10] w-full rounded-lg [&_svg]:size-6"
      />
      <div className="min-w-0 px-2">
        <div className="truncate text-sm text-foreground">{artifact.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {subtitle ?? `${kind} · ${formatRelative(artifact.updatedAt)}`}
        </div>
      </div>
    </Link>
  );
}

function NoFolder() {
  const canCreate = Boolean(useDriveAccount());
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-full items-center justify-center">
      <div>
        <Empty size="compact">
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{"You’re not in a folder yet"}</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? "Documents live in folders. Create one to start."
                : "Documents live in folders. Ask an administrator to invite you to one."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {canCreate ? (
              <Button onClick={() => setOpen(true)} variant="default">
                New folder
              </Button>
            ) : null}
          </EmptyContent>
        </Empty>
      </div>
      <NewFolderDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * Share a folder, or manage a shared drive's members, from its overview.
 * My Drive itself is never shared.
 */
function ShareFolderButton({ folder }: { folder: Folder }) {
  if (folder.kind === "personal") return null;
  const drive = folder.kind === "shared";
  return (
    <Button onClick={() => shareFolder(folder)} variant="outline">
      {drive ? <UsersIcon /> : <UserPlusIcon />}
      {drive ? (folder.role === "owner" ? "Manage members" : "Members") : "Share"}
    </Button>
  );
}

/**
 * The main pane in "Shared with me": who shared what with you lately, the
 * documents as cards and the folders below.
 */
export function SharedOverview({ items, loading }: { items: SharedItem[]; loading: boolean }) {
  if (loading) return null;
  if (items.length === 0)
    return (
      <div className="flex h-full items-center justify-center">
        <div>
          <Empty size="compact">
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{"Nothing shared with you yet"}</EmptyTitle>
              <EmptyDescription>
                {
                  "When someone shares a folder or a document with you, it shows up here, wherever it lives."
                }
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  const documents = items.filter((item) => item.artifact).slice(0, 6);
  const folders = items.filter((item) => item.folder).slice(0, 6);
  const people = new Set(items.flatMap((item) => (item.sharedBy ? [item.sharedBy.email] : [])))
    .size;
  return (
    <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[47rem] space-y-10 px-6 pt-14 pb-20">
        <header className="flex items-center gap-4 px-4.25">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
            <UsersIcon className="size-5.5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl leading-8 font-medium tracking-tight text-foreground">
              Shared with me
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"} from {people}{" "}
              {people === 1 ? "person" : "people"}
            </p>
          </div>
        </header>

        {documents.length ? (
          <section>
            <h2 className="mb-3 px-4.25 text-sm font-medium text-foreground">Recently shared</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {documents.map((item) => (
                <RecentCard
                  key={item.artifact!.id}
                  artifact={item.artifact!}
                  folderSlug={item.folderSlug}
                  subtitle={`${item.sharedBy?.name || item.sharedBy?.email || "Someone"} · ${formatRelative(item.sharedAt)}`}
                />
              ))}
            </div>
          </section>
        ) : null}

        {folders.length ? (
          <section>
            <h2 className="mb-3 px-4.25 text-sm font-medium text-foreground">Folders</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {folders.map((item) => (
                <SharedFolderCard key={item.folder!.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SharedFolderCard({ item }: { item: SharedItem }) {
  const host = useDriveHost();
  const folder = item.folder!;
  return (
    <Link
      to={host.href("/home")}
      search={(current) => ({
        ...current,
        folder: folder.id,
        view: undefined,
        kind: undefined,
        q: undefined,
        sheet: undefined,
      })}
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 outline-none transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-icon-muted">
        <FolderIcon className="size-4.5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{folder.name}</span>
        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          {item.sharedBy ? <UserAvatar user={item.sharedBy} className="size-3.5 text-5xs" /> : null}
          <span className="truncate">
            {item.sharedBy?.name || item.sharedBy?.email || "Shared"} ·{" "}
            {folder.role === "viewer" ? "Can view" : "Can edit"}
          </span>
        </span>
      </span>
    </Link>
  );
}
