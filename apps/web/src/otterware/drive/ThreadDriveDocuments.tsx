/**
 * A thread's linked Drive documents (`WebModule.threadAccessory`): a pill
 * with their count over the conversation, a list of them with the version
 * Drive last reported, and a dialog to link one by its link or by search.
 * In Drive's side chat it also offers to link the document on the page.
 */
import { useAtomValue } from "@effect/atom-react";
import {
  driveThreadLinkTitle,
  parseDriveUrl,
  type DriveDocumentKind,
  type DriveDocumentSummary,
  type DriveThreadLink,
} from "@otterware/composition/contracts";
import type { ModuleThreadAccessoryProps } from "@otterware/module-kit/web";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  FileCodeIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  HardDriveIcon,
  LinkIcon,
  type LucideIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SheetIcon,
  UnlinkIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../../components/ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "../../components/ui/popover";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Spinner } from "../../components/ui/spinner";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentQuery } from "../../state/query";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import {
  canLinkDriveDocuments,
  driveDocumentSearch,
  linkDriveDocument,
  unlinkDriveDocument,
  useDriveThreadLinks,
} from "./threadLinks";
import { driveShellPath } from "./drivePaths";

const KIND_ICONS: Record<DriveDocumentKind, LucideIcon> = {
  markdown: FileTextIcon,
  text: FileTextIcon,
  csv: SheetIcon,
  tsv: SheetIcon,
  workbook: FileSpreadsheetIcon,
  video: FileVideoIcon,
  frame: FileCodeIcon,
};

function KindIcon({ kind }: { readonly kind: DriveDocumentKind | null }) {
  const Icon = kind === null ? FileIcon : KIND_ICONS[kind];
  return <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />;
}

const SOURCE_LABELS: Record<DriveThreadLink["source"], string> = {
  manual: "Linked by you",
  agent: "Linked by the agent",
};

const SYNC_LABELS: Record<DriveThreadLink["syncState"], string | null> = {
  pending: "Not synced yet",
  synced: null,
  not_connected: "Drive not connected",
  not_found: "Not found in Drive",
  unavailable: "Drive unreachable",
};

export default function ThreadDriveDocuments({
  environmentId,
  threadId,
  sideChat,
  pageContext,
}: ModuleThreadAccessoryProps) {
  const links = useDriveThreadLinks(environmentId, threadId);
  const environment = EnvironmentId.make(environmentId);
  const canLink = useAtomValue(canLinkDriveDocuments(environment));
  const link = useAtomCommand(linkDriveDocument);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linking, setLinking] = useState(false);

  // In Drive's side chat: the document on the page, unless it is linked already.
  const page = pageContext?.refs.find((ref) => ref.kind === "drive.document") ?? null;
  const pageLinked =
    page !== null && links.some((entry) => entry.artifactId === page.id || entry.url === page.href);
  const offerPage = sideChat && canLink && page?.href !== undefined && !pageLinked;

  if (links.length === 0 && !offerPage && !sideChat) return null;
  const changed = links.some((entry) => entry.changed);
  const linkUrl = (url: string) =>
    link({
      environmentId: environment,
      input: { threadId: ThreadId.make(threadId), url, source: "manual" },
    });

  return (
    <>
      {offerPage && page?.href ? (
        <Button
          variant="outline"
          size="micro"
          disabled={linking}
          onClick={() => {
            setLinking(true);
            void linkUrl(page.href!).finally(() => setLinking(false));
          }}
        >
          <LinkIcon />
          Link to this chat
        </Button>
      ) : null}
      {links.length > 0 || sideChat ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost-muted"
                size="micro"
                aria-label={`${links.length} linked Drive document${links.length === 1 ? "" : "s"}${changed ? ", updated" : ""}`}
              />
            }
          >
            <span className="relative inline-flex">
              <HardDriveIcon />
              {changed ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-info"
                />
              ) : null}
            </span>
            <span className="tabular-nums">{links.length}</span>
          </PopoverTrigger>
          <PopoverPopup align="end" padding="none" width="md">
            <LinkedDocuments
              environmentId={environment}
              threadId={threadId}
              links={links}
              canLink={canLink}
              onLink={() => setDialogOpen(true)}
            />
          </PopoverPopup>
        </Popover>
      ) : null}
      {dialogOpen ? (
        <LinkDocumentDialog
          environmentId={environment}
          onLink={linkUrl}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </>
  );
}

function LinkedDocuments({
  environmentId,
  threadId,
  links,
  canLink,
  onLink,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: string;
  readonly links: ReadonlyArray<DriveThreadLink>;
  readonly canLink: boolean;
  readonly onLink: () => void;
}) {
  const unlink = useAtomCommand(unlinkDriveDocument);
  return (
    <div className="flex flex-col">
      {links.length === 0 ? (
        <p className="px-3 py-3 text-muted-foreground text-xs">
          Documents the agent works on show here. Link one yourself by its Drive link.
        </p>
      ) : (
        <ScrollArea className="max-h-80">
          <div className="flex flex-col p-1.5">
            {links.map((entry) => (
              <LinkedDocument
                key={entry.id}
                link={entry}
                onUnlink={
                  canLink
                    ? () =>
                        void unlink({
                          environmentId,
                          input: { threadId: ThreadId.make(threadId), linkId: entry.id },
                        })
                    : null
                }
              />
            ))}
          </div>
        </ScrollArea>
      )}
      {canLink ? (
        <footer className="flex justify-end border-t border-border/60 px-2 py-1.5">
          <Button size="compact" variant="ghost" onClick={onLink}>
            <PlusIcon />
            Link a document
          </Button>
        </footer>
      ) : null}
    </div>
  );
}

function LinkedDocument({
  link,
  onUnlink,
}: {
  readonly link: DriveThreadLink;
  readonly onUnlink: (() => void) | null;
}) {
  const navigate = useNavigate();
  const snapshot = link.snapshot;
  const syncLabel = SYNC_LABELS[link.syncState];
  const path = driveShellPath(link.url);
  const title = driveThreadLinkTitle(link);
  return (
    <div className="flex w-full items-center gap-2 rounded-md py-1 pr-1 pl-2 hover:bg-accent/60">
      <KindIcon kind={snapshot?.kind ?? null} />
      <a
        href={path ?? link.url}
        onClick={(event) => {
          if (path === null || event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          void navigate({ href: path });
        }}
        className="flex min-w-0 flex-1 flex-col"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm">{title}</span>
          {link.changed ? (
            <span className="shrink-0 rounded-full bg-info/12 px-1.5 text-2xs text-info-foreground">
              Updated
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
          {snapshot?.version != null ? (
            <span className="shrink-0">
              {link.version !== null ? `v${link.version} (pinned)` : `v${snapshot.version}`}
            </span>
          ) : null}
          {syncLabel ? <span className="truncate">{syncLabel}</span> : null}
          <span className="ml-auto shrink-0">
            {SOURCE_LABELS[link.source]} · {formatRelativeTimeLabel(link.linkedAt)}
          </span>
        </span>
      </a>
      <Menu>
        <MenuTrigger
          render={
            <Button variant="ghost" size="icon-micro" aria-label={`Actions for ${title}`}>
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <MenuPopup align="end" side="bottom">
          <MenuItem onClick={() => void writeTextToClipboard(link.url, "link")}>
            <LinkIcon className="size-3.5" />
            Copy link
          </MenuItem>
          {path !== null ? (
            <MenuItem onClick={() => void navigate({ href: path })}>
              <ArrowUpRightIcon className="size-3.5" />
              Open in Drive
            </MenuItem>
          ) : null}
          {onUnlink ? (
            <MenuItem onClick={onUnlink}>
              <UnlinkIcon className="size-3.5" />
              Unlink from thread
            </MenuItem>
          ) : null}
        </MenuPopup>
      </Menu>
    </div>
  );
}

function LinkDocumentDialog({
  environmentId,
  onLink,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly onLink: (url: string) => Promise<{ readonly _tag: string }>;
  readonly onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const parsed = parseDriveUrl(value.trim());
  const linkable = parsed !== null && parsed.type !== "folder";
  // Not a link: search your documents by title instead.
  const query = linkable ? "" : value.trim();
  const documents = useEnvironmentQuery(
    driveDocumentSearch({
      environmentId,
      input: query ? { scope: "recent", query } : { scope: "recent" },
    }),
  );

  const link = async (url: string) => {
    setPending(true);
    const result = await onLink(url);
    setPending(false);
    if (result._tag === "Success") onClose();
  };
  const first = documents.data?.documents[0];
  const submit = () => {
    if (linkable) void link(value.trim());
    else if (first) void link(first.url);
  };

  return (
    <Dialog open onOpenChange={(open) => (pending || open ? undefined : onClose())}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Link a Drive document</DialogTitle>
          <DialogDescription>
            Keep a document at hand in this thread and see when it gets a new version.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <Input
            autoFocus
            placeholder="Paste a Drive link or search your documents"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              submit();
            }}
          />
          {parsed?.type === "folder" ? (
            <p className="text-destructive text-xs">That is a folder. Pick one of its documents.</p>
          ) : null}
          {linkable ? null : (
            <DocumentPicker
              documents={documents.data?.documents ?? null}
              error={documents.error}
              disabled={pending}
              onPick={(document) => void link(document.url)}
            />
          )}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" size="compact" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button size="compact" onClick={submit} disabled={pending || (!linkable && !first)}>
            {pending ? "Linking…" : "Link"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function DocumentPicker({
  documents,
  error,
  disabled,
  onPick,
}: {
  readonly documents: ReadonlyArray<DriveDocumentSummary> | null;
  readonly error: string | null;
  readonly disabled: boolean;
  readonly onPick: (document: DriveDocumentSummary) => void;
}) {
  if (documents === null)
    return error ? (
      <p className="text-muted-foreground text-xs">{error}</p>
    ) : (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  if (documents.length === 0)
    return <p className="text-muted-foreground text-xs">No documents match.</p>;
  return (
    <ScrollArea className="max-h-72">
      <ul className="flex flex-col">
        {documents.map((document) => (
          <li key={document.artifactId}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(document)}
              className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60 disabled:opacity-50"
            >
              <KindIcon kind={document.kind} />
              <span className="min-w-0 flex-1 truncate text-sm">{document.title}</span>
              <span className="shrink-0 text-2xs text-muted-foreground">
                {document.version === null ? "" : `v${document.version} · `}
                {formatRelativeTimeLabel(document.updatedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
