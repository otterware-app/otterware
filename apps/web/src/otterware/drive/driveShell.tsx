import { toastManager } from "~/components/ui/toast";
import { folderUrl } from "./ui/lib/links";

import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  FolderIcon,
  HardDriveIcon,
  ClockIcon,
  UsersIcon,
  ArchiveIcon,
  PlusIcon,
  UploadIcon,
  SearchIcon,
  ArrowDownUpIcon,
  EllipsisIcon,
} from "lucide-react";
import {
  useShellSelection,
  type ModuleSpace,
  type ModuleSidebarSection,
  type ModuleSidebarRow,
  type ModuleHeaderAction,
} from "@otterware/module-kit/web";
import { useDriveStore, runDriveCommand } from "./ui/driveStore";
import { folderLabel, driveForFolder } from "./ui/main/folders";

export function useDriveSpaces(): readonly ModuleSpace[] {
  return useDriveStore((state) => state.folders)
    .filter((folder) => !folder.parentId)
    .map((folder) => ({
      id: folder.id,
      label: folderLabel(folder),
      icon: HardDriveIcon,
      href: `/drive/home?folder=${encodeURIComponent(folder.id)}`,
    }));
}
export function useDriveSidebar(): readonly ModuleSidebarSection[] {
  const { folders, folderId, error } = useDriveStore();
  const navigate = useNavigate();
  const search = useLocation({ select: (location) => location.searchStr });
  const view = new URLSearchParams(search).get("view");
  const current =
    folders.find((folder) => folder.id === folderId) ??
    folders.find((folder) => folder.kind === "personal") ??
    null;
  const drive = driveForFolder(folders, current);
  const go = (href: string) => () => void navigate({ href });
  const row = (folder: (typeof folders)[number], seen: Set<string>): ModuleSidebarRow => ({
    id: folder.id,
    label: folderLabel(folder),
    icon: <FolderIcon />,
    active: folder.id === current?.id && !view,
    href: `/drive/home?folder=${encodeURIComponent(folder.id)}`,
    onSelect: () => {
      useShellSelection
        .getState()
        .selectSpace("drive", driveForFolder(folders, folder)?.id ?? null);
      go(`/drive/home?folder=${encodeURIComponent(folder.id)}`)();
    },
    children: folders
      .filter((child) => child.parentId === folder.id && !seen.has(child.id))
      .map((child) => row(child, new Set([...seen, child.id]))),
    actions: [
      {
        id: "copy-link",
        label: "Copy link",
        onSelect: () => {
          void navigator.clipboard.writeText(folderUrl(folder.id)).then(
            () => toastManager.add({ type: "success", title: "Link copied" }),
            () => toastManager.add({ type: "error", title: "Could not copy the link" }),
          );
        },
      },
      {
        id: "share",
        label: folder.kind === "shared" ? "Shared drive access" : "Share…",
        onSelect: () => {
          if (folder.kind === "shared") go("/settings/drive/access")();
          else
            void import("./ui/main/drive/folder-menu").then(({ shareFolder }) =>
              shareFolder(folder),
            );
        },
      },
      ...(folder.role !== "viewer"
        ? [
            {
              id: "new",
              label: "New folder inside",
              onSelect: () => {
                void import("./ui/main/drive/new-folder-dialog").then(({ requestNewFolder }) =>
                  requestNewFolder(folder),
                );
              },
            },
          ]
        : []),
      ...(folder.role === "owner" && folder.kind !== "personal"
        ? [
            {
              id: "rename",
              label: "Rename…",
              onSelect: () => {
                void import("./ui/main/drive/folder-dialogs").then(({ requestFolderDialog }) =>
                  requestFolderDialog({ action: "rename", folder }),
                );
              },
            },
            {
              id: "delete",
              label: "Delete empty folder…",
              destructive: true,
              onSelect: () => {
                void import("./ui/main/drive/folder-dialogs").then(({ requestFolderDialog }) =>
                  requestFolderDialog({ action: "delete", folder }),
                );
              },
            },
          ]
        : []),
    ],
  });
  return [
    {
      id: "folders",
      title: drive ? folderLabel(drive) : "Folders",
      rows: drive ? [row(drive, new Set([drive.id]))] : [],
      empty: error ?? "Your drives will appear here.",
    },
    {
      id: "views",
      rows: [
        {
          id: "recent",
          label: "Recent",
          icon: <ClockIcon />,
          active: view === "recent",
          href: "/drive/home?view=recent",
          onSelect: go("/drive/home?view=recent"),
        },
        {
          id: "shared",
          label: "Shared with me",
          icon: <UsersIcon />,
          active: view === "shared",
          href: "/drive/home?view=shared",
          onSelect: go("/drive/home?view=shared"),
        },
        {
          id: "archived",
          label: "Archived",
          icon: <ArchiveIcon />,
          active: view === "archived",
          href: "/drive/home?view=archived",
          onSelect: go("/drive/home?view=archived"),
        },
      ],
    },
  ];
}
export function useDriveHeaderActions(): readonly ModuleHeaderAction[] {
  const { folderId, folders, accountId, documentActions, viewerExpanded } = useDriveStore();
  const folder = folders.find((entry) => entry.id === folderId);
  const disabled = !accountId || !folder || folder.role === "viewer";
  return [
    {
      id: "new",
      label: "New",
      icon: PlusIcon,
      emphasis: "primary",
      disabled,
      onSelect: () => runDriveCommand("folder.new"),
    },
    {
      id: "upload",
      label: "Upload",
      icon: UploadIcon,
      emphasis: "primary",
      disabled,
      onSelect: () => runDriveCommand("document.upload"),
    },
    {
      id: "search",
      label: "Search documents",
      icon: SearchIcon,
      disabled: !accountId,
      onSelect: () => runDriveCommand("search.focus"),
    },
    {
      id: "sort",
      label: "Sort documents",
      icon: ArrowDownUpIcon,
      disabled: !accountId || viewerExpanded,
      onSelect: () => runDriveCommand("list.sort"),
    },
    ...documentActions.filter((action) => ["close", "versions", "share"].includes(action.id)),
    ...(documentActions.length
      ? [
          {
            id: "document-actions",
            label: "Document actions",
            icon: EllipsisIcon,
            onSelect: () => runDriveCommand("document.actions"),
          },
        ]
      : []),
  ];
}
