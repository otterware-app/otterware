import { isThreadDrag, readThreadDrag } from "./content/main/gmail/thread-drag";
import { searchTitle } from "./content/main/gmail/search-tabs";
import { useNavigate } from "@tanstack/react-router";
import {
  ClockIcon,
  InboxIcon,
  StarIcon,
  SendIcon,
  FilePenIcon,
  TagIcon,
  FolderIcon,
  FilterIcon,
  PenSquareIcon,
  LayersIcon,
  ArchiveIcon,
  TrashIcon,
  ShieldAlertIcon,
} from "lucide-react";
import type {
  ModuleSpace,
  ModuleSidebarContext,
  ModuleSidebarRow,
  ModuleSidebarSection,
  ModuleHeaderAction,
  WebModuleCommand,
} from "@otterware/module-kit/web";
import { useMailStore, mailAction } from "./mailStore";
import { parseMailLocation, mailLocationPath } from "./content/host/location";
import { COMBINED_ACCOUNT_ID } from "./content/main/gmail/custom-views";
import { PROJECTS_SPACE, firstLabelOf } from "./content/main/gmail/spaces";
import { buildLabelTree, type LabelTreeNode } from "./content/main/gmail/label-tree";
import { requestNewProject } from "./content/main/gmail/project-menus";

const LABEL_MIME = "application/x-ottermail-label";
const hrefFor = (mailbox: string, label = firstLabelOf(mailbox)) =>
  `/mail${mailLocationPath({ mailbox, label, messageId: null, account: null, focusId: null })}`;
export function useMailSpaces(): ReadonlyArray<ModuleSpace> {
  const data = useMailStore((s) => s.current);
  if (!data) return [];
  return [
    ...(data.combined
      ? [
          {
            id: COMBINED_ACCOUNT_ID,
            label: "All mailboxes",
            icon: LayersIcon,
            href: hrefFor(COMBINED_ACCOUNT_ID),
          },
        ]
      : []),
    ...data.accounts.map((account) => ({
      id: account.id,
      label: account.name?.trim() || account.email,
      icon: InboxIcon,
      avatar: {
        initials: (account.name?.trim() || account.email).slice(0, 1).toUpperCase(),
        ...(account.color ? { color: account.color } : {}),
        ...(account.picture ? { image: account.picture } : {}),
      },
      href: hrefFor(account.id),
      ...(data.dots ? { badge: data.unread[account.id] ?? 0 } : {}),
    })),
    ...data.views
      .filter((view) => view.kind === "custom")
      .map((view) => ({ id: view.id, label: view.name, icon: FilterIcon, href: hrefFor(view.id) })),
  ];
}
export function useMailSidebar({
  spaceId,
  subpath,
  projectId,
}: ModuleSidebarContext): ReadonlyArray<ModuleSidebarSection> {
  const data = useMailStore((s) => s.current);
  const navigate = useNavigate();
  const searches = useMailStore((s) => s.searches);
  const activeSearchId = useMailStore((s) => s.activeSearchId);
  if (!data) return [];
  const loc = parseMailLocation(`/${subpath}`);
  const mailbox =
    loc?.mailbox ?? spaceId ?? (data.combined ? COMBINED_ACCOUNT_ID : data.accounts[0]?.id);
  if (!mailbox)
    return [
      {
        id: "mail",
        rows: [
          {
            id: "connect",
            label: "Link a Google account",
            active: false,
            href: "/mail",
            onSelect: () => {
              void navigate({ to: "/mail" });
            },
          },
        ],
      },
    ];
  const folderMailbox =
    data.accounts.some((account) => account.id === mailbox) || mailbox === COMBINED_ACCOUNT_ID
      ? mailbox
      : data.combined
        ? COMBINED_ACCOUNT_ID
        : (data.accounts[0]?.id ?? mailbox);
  const scoped = (href: string) =>
    projectId ? `/home/projects/${encodeURIComponent(projectId)}${href}` : href;
  const row = (
    id: string,
    label: string,
    icon: ModuleSidebarRow["icon"],
    target = folderMailbox,
  ): ModuleSidebarRow => {
    const href = scoped(hrefFor(target, id));
    return {
      id: `${target}:${id}`,
      label,
      icon,
      href,
      active: loc?.mailbox === target && loc.label === id,
      onSelect: () => {
        void navigate({ to: href });
      },
    };
  };
  const combined = folderMailbox === COMBINED_ACCOUNT_ID;
  const folder = (normal: string, builtin: string) => (combined ? `__${builtin}__` : normal);
  const labelAccounts = data.accounts.filter(
    (account) =>
      !data.accounts.some((candidate) => candidate.id === mailbox) || account.id === mailbox,
  );
  const treeRows = (nodes: LabelTreeNode[], accountId: string): ModuleSidebarRow[] =>
    nodes.map((node) => ({
      ...row(
        node.label?.id ?? node.key,
        node.segment,
        <TagIcon className="size-4" style={{ color: node.label?.color?.backgroundColor }} />,
        accountId,
      ),
      children: treeRows(node.children, accountId),
      ...(node.label && data.host.canWrite?.() !== false
        ? {
            drag: {
              draggable: true,
              onDragStart: (event) => {
                event.dataTransfer.setData(
                  LABEL_MIME,
                  JSON.stringify({ accountId, labelId: node.label!.id }),
                );
                event.dataTransfer.effectAllowed = "move";
              },
              onDragOver: (event) => {
                if (
                  isThreadDrag(event.dataTransfer) ||
                  event.dataTransfer.types.includes(LABEL_MIME)
                ) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = event.altKey ? "copy" : "move";
                }
              },
              onDrop: (event) => {
                const threads = readThreadDrag(event.dataTransfer);
                const label = event.dataTransfer.getData(LABEL_MIME);
                if (!threads && !label) return;
                event.preventDefault();
                mailAction(
                  "label.drop",
                  JSON.stringify({
                    accountId,
                    labelId: node.label!.id,
                    threads,
                    source: label,
                    keep: event.altKey,
                  }),
                );
              },
            } satisfies NonNullable<ModuleSidebarRow["drag"]>,
          }
        : {}),
      ...(node.label
        ? {
            actions: [
              {
                id: "edit",
                label: "Edit label",
                onSelect: () => mailAction("label.edit", `${accountId}\n${node.label!.id}`),
              },
            ],
          }
        : {}),
    }));
  return [
    {
      id: "mail",
      rows: [
        row(folder("INBOX", "inbox"), "Inbox", <InboxIcon className="size-4" />),
        row(folder("STARRED", "starred"), "Starred", <StarIcon className="size-4" />),
        row(folder("SENT", "sent"), "Sent", <SendIcon className="size-4" />),
        row(folder("DRAFT", "drafts"), "Drafts", <FilePenIcon className="size-4" />),
        row(folder("ALL_MAIL", "allmail"), "All mail", <ArchiveIcon className="size-4" />),
        row(folder("SPAM", "junk"), "Junk", <ShieldAlertIcon className="size-4" />),
        row(folder("TRASH", "trash"), "Trash", <TrashIcon className="size-4" />),
        {
          id: "schedules",
          label: "Scheduled and snoozed",
          icon: <ClockIcon className="size-4" />,
          active: false,
          onSelect: () => mailAction("schedules"),
        },
      ],
    },
    {
      id: "labels",
      title: "Labels",
      empty: "No labels",
      action: { label: "New label", onSelect: () => mailAction("label.new", mailbox) },
      rows: labelAccounts.flatMap((account) => {
        const rows = treeRows(
          buildLabelTree((data.labels[account.id] ?? []).filter((label) => label.type === "user")),
          account.id,
        );
        return labelAccounts.length === 1
          ? rows
          : [
              {
                id: `labels:${account.id}`,
                label: account.name || account.email,
                active: false,
                onSelect: () => {},
                children: rows,
              },
            ];
      }),
    },
    {
      id: "searches",
      title: "Searches",
      rows: searches.map((tab) => ({
        id: tab.id,
        label: searchTitle(tab),
        active: activeSearchId === tab.id,
        onSelect: () => mailAction("search.select", tab.id),
        actions: [
          {
            id: "close",
            label: "Close search",
            onSelect: () => mailAction("search.close", tab.id),
          },
        ],
      })),
    },
    {
      id: "views",
      title: "Views",
      action: { label: "New view", onSelect: () => mailAction("view.edit") },
      rows: data.views
        .filter((view) => view.kind === "custom")
        .map((view) => ({
          ...row(firstLabelOf(view.id), view.name, <FilterIcon className="size-4" />, view.id),
          actions: [
            { id: "edit", label: "Edit view", onSelect: () => mailAction("view.edit", view.id) },
          ],
        })),
    },
    {
      id: "projects",
      title: "Projects",
      action: { label: "New project", onSelect: () => requestNewProject() },
      rows: [
        row("all", "All projects", <FolderIcon className="size-4" />, PROJECTS_SPACE),
        ...data.projects.map((project) =>
          row(project.id, project.name, <FolderIcon className="size-4" />, PROJECTS_SPACE),
        ),
      ],
    },
  ];
}
export function useMailHeaderActions(): ReadonlyArray<ModuleHeaderAction> {
  const data = useMailStore((s) => s.current);
  return [
    { id: "filter", label: "Filter", icon: FilterIcon, onSelect: () => mailAction("filter") },
    {
      id: "compose",
      label: "Compose",
      icon: PenSquareIcon,
      emphasis: "primary",
      disabled: !data?.accounts.length || data.host.canWrite?.() === false,
      onSelect: () => mailAction("compose"),
    },
  ];
}

/** Palette navigation uses the same destinations as the rail and sidebar. */
export function mailPaletteCommands(): ReadonlyArray<WebModuleCommand> {
  const data = useMailStore.getState().current;
  if (!data) return [];
  const destinations = [
    ...(data.combined
      ? [{ id: COMBINED_ACCOUNT_ID, title: "All mailboxes", path: hrefFor(COMBINED_ACCOUNT_ID) }]
      : []),
    ...data.accounts.map((account) => ({
      id: account.id,
      title: account.name || account.email,
      path: hrefFor(account.id),
    })),
    ...data.views
      .filter((view) => view.kind === "custom")
      .map((view) => ({ id: view.id, title: view.name, path: hrefFor(view.id) })),
    ...data.projects.map((project) => ({
      id: project.id,
      title: project.name,
      path: hrefFor(PROJECTS_SPACE, project.id),
    })),
    ...data.accounts.flatMap((account) =>
      (data.labels[account.id] ?? [])
        .filter((label) => label.type === "user")
        .map((label) => ({
          id: `${account.id}/${label.id}`,
          title: `${account.name || account.email}: ${label.name}`,
          path: hrefFor(account.id, label.id),
        })),
    ),
  ];
  return destinations.map((entry) => ({
    id: `mail.open.${encodeURIComponent(entry.id)}`,
    title: `Mail: ${entry.title}`,
    searchTerms: ["mail", entry.title],
    run: () => data.host.navigate(entry.path),
  }));
}
