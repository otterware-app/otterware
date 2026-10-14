/**
 * Keeps module pages mounted across routes. A module's page is created the
 * first time its path is visited and stays mounted, hidden, while the user is
 * elsewhere, so an open mail thread or a Drive folder survives a trip to a
 * Code thread. Nothing here is keyed by environment or session: pages read
 * the environment through hooks and follow it themselves. (The old branch
 * keyed this host by environment, which remounted every page on each
 * reconnect; that is the bug to avoid.)
 *
 * The route files under `routes/<module>*.tsx` render nothing; this host,
 * rendered by `AppSidebarLayout`, shows the page in the host frame beside the
 * router's content. Module stores mount here too, once, independent of visits.
 */
import type { ModuleLocation, WebModule } from "@otterware/module-kit/web";
import { useLocation } from "@tanstack/react-router";
import { Activity, lazy, Suspense, useState, type ReactNode } from "react";

import { ModulePageLayout } from "./ModulePageLayout";
import { ModuleStoresHost } from "./ModuleStoresHost";
import { moduleRegistry } from "./registry";

// Loaded only once a page opens inside a cross-app project, so standalone
// profiles never bundle Home.
const HomeProjectTitle = lazy(() =>
  import("./home/homeShell").then((m) => ({ default: m.HomeProjectTitle })),
);

interface RetainedPage {
  readonly subpath: string;
  readonly projectId: string | null;
}

function ModulePageFrame({
  module,
  retained,
  active,
}: {
  readonly module: WebModule;
  readonly retained: RetainedPage;
  readonly active: boolean;
}) {
  const Page = module.page;
  return (
    <div
      hidden={!active}
      className={active ? "flex min-h-0 min-w-0 flex-1" : "hidden"}
      data-module-page={module.id}
    >
      <Activity mode={active ? "visible" : "hidden"}>
        <ModulePageLayout
          module={module}
          projectTitle={
            retained.projectId === null ? null : (
              <Suspense fallback={null}>
                <HomeProjectTitle projectId={retained.projectId} />
              </Suspense>
            )
          }
        >
          <Suspense fallback={null}>
            <Page subpath={retained.subpath} active={active} projectId={retained.projectId} />
          </Suspense>
        </ModulePageLayout>
      </Activity>
    </div>
  );
}

const sameRetained = (left: RetainedPage | undefined, right: ModuleLocation) =>
  left !== undefined && left.subpath === right.subpath && left.projectId === right.projectId;

export function ModulePagesHost({ children }: { readonly children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const current = moduleRegistry.forPath(pathname);
  // The last location per visited module, so a hidden page keeps its place.
  const [retained, setRetained] = useState<Readonly<Record<string, RetainedPage>>>({});
  if (current !== null && !sameRetained(retained[current.module.id], current)) {
    setRetained({
      ...retained,
      [current.module.id]: { subpath: current.subpath, projectId: current.projectId },
    });
  }
  return (
    <>
      <ModuleStoresHost />
      {children}
      {Object.entries(retained).map(([id, page]) => {
        const module = moduleRegistry.byId(id);
        if (module === null) return null;
        return (
          <ModulePageFrame
            key={id}
            module={module}
            retained={page}
            active={current?.module.id === id}
          />
        );
      })}
    </>
  );
}
