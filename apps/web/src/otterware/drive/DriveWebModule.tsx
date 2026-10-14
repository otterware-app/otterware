/**
 * Drive in the Otterware shell. Drive's window (`@otterware/drive-web`) calls
 * Otter Cloud directly with the Otter Account's token; this adapter hands it
 * the account, the route below `/drive`, and the environment's
 * `drive.markViewed` so Home stops listing documents the user has opened.
 */
import { createDriveWebModule } from "@otterware/composition/web";
import type { DriveHost } from "@otterware/composition/web/drive";
import type { ModulePageProps } from "@otterware/module-kit/web";
import { EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import { request } from "@t3tools/client-runtime/rpc";
import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import { AtomRegistry } from "effect/reactivity";
import { lazy, useCallback, useMemo, useState } from "react";

import { useAuth } from "../../accounts/AccountProvider";
import { isElectron } from "../../env";
import { ensureLocalApi } from "../../localApi";
import { connectionAtomRuntime } from "../../connection/runtime";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { ModulePageLayout } from "../ModulePageLayout";

type DriveWeb = typeof import("@otterware/composition/web/drive");

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
  { active, subpath }: { readonly active: boolean; readonly subpath: string },
): DriveHost {
  const auth = useAuth();
  const navigate = useNavigate();
  const { history } = useRouter();
  const environmentId = usePrimaryEnvironmentId();
  const searchStr = useLocation({ select: (location) => location.searchStr });
  // A hidden page keeps its own query while another page owns the URL.
  const [location, setLocation] = useState(searchStr);
  if (active && location !== searchStr) setLocation(searchStr);
  // `getToken` reads the account session's current token; it is stable for the app's lifetime.
  const [client] = useState(() => drive.createDriveCloudClient(auth.getToken));
  const onDocumentViewed = useCallback(
    (artifactId: string, version: number) => {
      // Best effort: without Drive on this environment there is nothing to clear.
      if (environmentId) void markViewed(environmentId, artifactId, version).catch(() => {});
    },
    [environmentId],
  );
  // Held through the router's history, so Back and Forward ask too. Leaving
  // Drive is never held: its page stays mounted, unsaved edits included.
  const blockNavigation = useCallback<DriveHost["blockNavigation"]>(
    ({ shouldBlock, beforeUnload }) =>
      history.block({
        blockerFn: ({ nextLocation }) => {
          const path = nextLocation.pathname;
          if (path !== "/drive" && !path.startsWith("/drive/")) return false;
          return shouldBlock({
            pathname: path.slice("/drive".length) || "/",
            search: nextLocation.search,
          });
        },
        enableBeforeUnload: beforeUnload,
      }),
    [history],
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
      client,
      account: user
        ? { id: user.id, name: user.name ?? user.email, email: user.email, image: user.image }
        : null,
      accountPending: !auth.isLoaded,
      signIn: () => void auth.signIn(),
      signOut: null,
      location: { pathname: `/${subpath}`, search: location },
      navigate: (to, options) =>
        void navigate({ href: `/drive${to}`, replace: options?.replace ?? false }),
      href: (to) => `/drive${to}`,
      openInNewTab,
      blockNavigation,
      embedded: true,
      active,
      onDocumentViewed,
    }),
    [
      client,
      user,
      auth,
      subpath,
      location,
      navigate,
      openInNewTab,
      blockNavigation,
      active,
      onDocumentViewed,
    ],
  );
}

function makePage(drive: DriveWeb) {
  const { DriveApp } = drive;
  return function DrivePage(props: ModulePageProps) {
    const host = useShellDriveHost(drive, props);
    return (
      <ModulePageLayout moduleId="drive">
        <DriveApp host={host} />
      </ModulePageLayout>
    );
  };
}

function makeSettings(drive: DriveWeb) {
  const { DriveSettings } = drive;
  return function DriveSettingsSection() {
    const host = useShellDriveHost(drive, { active: true, subpath: "settings" });
    return <DriveSettings host={host} />;
  };
}

export const DriveWebModule = createDriveWebModule(
  lazy(async () => ({ default: makePage(await import("@otterware/composition/web/drive")) })),
  lazy(async () => ({
    default: makeSettings(await import("@otterware/composition/web/drive")),
  })),
  lazy(() => import("./ThreadDriveDocuments")),
);
