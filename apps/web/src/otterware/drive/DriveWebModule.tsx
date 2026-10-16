import { HardDriveIcon } from "lucide-react";
import { useDriveSpaces, useDriveSidebar, useDriveHeaderActions } from "./driveShell";
import { useDriveStore, runDriveCommand } from "./ui/driveStore";
/**
 * Drive in the Otterware shell. Drive's window (`@otterware/drive-web`) calls
 * Otter Cloud directly with the Otter Account's token; this adapter hands it
 * the account, the route below `/drive`, and the environment's
 * `drive.markViewed` so Home stops listing documents the user has opened.
 */
import { createDriveWebModule } from "@otterware/composition/web";
import type { DriveHost } from "./ui";
import {
  modulePath,
  projectScopedModulePath,
  type ModulePageProps,
} from "@otterware/module-kit/web";
import { EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import { request } from "@t3tools/client-runtime/rpc";
import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import { AtomRegistry } from "effect/reactivity";
import { lazy, useCallback, useMemo, useState } from "react";

import { useAuth } from "../../accounts/AccountProvider";
import { isElectron } from "../../env";
import { ensureLocalApi } from "../../localApi";
import { connectionAtomRuntime } from "../../connection/runtime";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { usePrimaryEnvironmentId } from "../../state/environments";

type DriveWeb = typeof import("./ui");

function markViewed(environmentId: EnvironmentId, artifactId: string, version: number) {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* AtomRegistry.mount(appAtomRegistry, connectionAtomRuntime);
        const context = yield* AtomRegistry.getResult(appAtomRegistry, connectionAtomRuntime);
        const registry = yield* EnvironmentRegistry.EnvironmentRegistry.pipe(
          Effect.provide(context),
        );
        return yield* registry
          .run(environmentId, request("drive.markViewed", { artifactId, version }))
          .pipe(Effect.provide(context));
      }),
    ),
  );
}

/** The account, Cloud client and route Drive runs against in the shell. */
function useShellDriveHost(
  drive: Pick<DriveWeb, "createDriveCloudClient" | "publicDriveUrl">,
  {
    active,
    subpath,
    projectId,
  }: { readonly active: boolean; readonly subpath: string; readonly projectId?: string | null },
): DriveHost {
  const auth = useAuth();
  const basePath = projectId ? projectScopedModulePath(projectId, "drive") : modulePath("drive");
  const environmentId = usePrimaryEnvironmentId();
  const searchStr = useLocation({ select: (location) => location.searchStr });
  // A hidden page keeps its own query while another page owns the URL.
  const [location, setLocation] = useState(searchStr);
  if (active && location !== searchStr) setLocation(searchStr);
  // `getToken` reads the account session's current token; it is stable for the app's lifetime.
  const [fallbackClient] = useState(() => drive.createDriveCloudClient(auth.getToken));
  const client = useDriveStore((state) => state.transport) ?? fallbackClient;
  const onDocumentViewed = useCallback(
    (artifactId: string, version: number) => {
      // Best effort: without Drive on this environment there is nothing to clear.
      if (environmentId) void markViewed(environmentId, artifactId, version).catch(() => {});
    },
    [environmentId],
  );
  // The desktop app's own origin opens nowhere else, so its tabs open Drive's site.
  const openInNewTab = useCallback(
    (to: string) => {
      if (isElectron)
        void ensureLocalApi()
          .shell.openExternal(drive.publicDriveUrl(to))
          .catch(() => undefined);
      else window.open(`${window.location.origin}/drive${to}`, "_blank", "noopener");
    },
    [drive],
  );
  const user = auth.user;
  return useMemo(
    (): DriveHost => ({
      transport: client,
      account: user
        ? { id: user.id, name: user.name ?? user.email, email: user.email, image: user.image }
        : null,
      accountPending: !auth.isLoaded,
      location: { pathname: `/${subpath}`, search: location },
      href: (to) => `${basePath}${to}`,
      openInNewTab,
      active,
      onDocumentViewed,
    }),
    [client, user, auth, subpath, location, basePath, openInNewTab, active, onDocumentViewed],
  );
}

function makePage(drive: DriveWeb) {
  const { DriveApp } = drive;
  return function DrivePage(props: ModulePageProps) {
    const host = useShellDriveHost(drive, props);
    return <DriveApp host={host} />;
  };
}

function makeSettings(drive: DriveWeb, page: string) {
  const { DriveSettings } = drive;
  return function DriveSettingsSection() {
    const host = useShellDriveHost(drive, { active: true, subpath: "settings" });
    return <DriveSettings host={host} page={page} />;
  };
}

export const DriveWebModule = createDriveWebModule({
  useSpaces: useDriveSpaces,
  useSidebar: useDriveSidebar,
  useHeaderActions: useDriveHeaderActions,
  stores: [{ id: "drive.data", runtime: lazy(() => import("./DriveBackgroundRuntime")) }],
  page: lazy(async () => ({ default: makePage(await import("./ui")) })),
  settings: (
    [
      {
        id: "drives",
        label: "Drives",
        placement: "page",
        rows: ["Shared drives", "New drive", "Move folder", "Delete empty folder", "Drive link"],
      },
      {
        id: "access",
        label: "Sharing",
        placement: "page",
        rows: ["People with access", "Invite"],
      },
      { id: "appearance", label: "Drive display", placement: "appearance", rows: ["List density"] },
      {
        id: "command-line",
        label: "Drive command line",
        placement: "account",
        rows: ["Command line"],
      },
    ] as const
  ).map((page) => ({
    id: page.id,
    label: page.label,
    icon: HardDriveIcon,
    searchTerms: page.rows,
    placement: { grouped: page.placement, standalone: page.placement },
    rows: page.rows.map((title) => ({
      id: `drive-${title.toLowerCase().replaceAll(" ", "-")}`,
      title,
    })),
    component: lazy(async () => ({ default: makeSettings(await import("./ui"), page.id) })),
  })),
  commands: [
    {
      id: "drive.shared",
      title: "Drive: Shared with me",
      searchTerms: ["shared"],
      subpath: "home?view=shared",
    },
    {
      id: "drive.recent",
      title: "Drive: recent documents",
      searchTerms: ["recent"],
      subpath: "home?view=recent",
    },
    {
      id: "drive.archived",
      title: "Drive: archived documents",
      searchTerms: ["archived"],
      subpath: "home?view=archived",
    },
    ...[
      ["folder.new", "New folder", "mod+shift+n"],
      ["document.upload", "Upload", "u"],
      ["search.focus", "Search documents", "/"],
      ["list.next", "Next document", "j"],
      ["list.previous", "Previous document", "k"],
      ["list.nextArrow", "Next document (arrow)", "arrowdown"],
      ["list.previousArrow", "Previous document (arrow)", "arrowup"],
      ["document.close", "Close document", "escape"],
      ...Array.from({ length: 9 }, (_, index) => [
        `folder.jump.${index + 1}`,
        `Open drive ${index + 1}`,
        `alt+${index + 1}`,
      ]),
    ].map(([id, title, key]) => ({
      id: `drive.${id}` as const,
      title: `Drive: ${title}`,
      searchTerms: [title!],
      defaultKey: key!,
      when: "!editableFocus",
      run: () => runDriveCommand(id!.replace(/Arrow$/, "")),
    })),
  ],
  threadAccessory: lazy(() => import("./ThreadDriveDocuments")),
});
