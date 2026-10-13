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
 * rendered by `AppSidebarLayout`, shows the page beside the router's content.
 */
import type { WebModule } from "@otterware/module-kit/web";
import { useLocation } from "@tanstack/react-router";
import { Activity, Suspense, useState, type ReactNode } from "react";

import { moduleRegistry } from "./registry";

function ModulePageFrame({
  module,
  subpath,
  active,
}: {
  readonly module: WebModule;
  readonly subpath: string;
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
        <Suspense fallback={null}>
          <Page subpath={subpath} active={active} />
        </Suspense>
      </Activity>
    </div>
  );
}

export function ModulePagesHost({ children }: { readonly children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const current = moduleRegistry.forPath(pathname);
  // The last sub-path per visited module, so a hidden page keeps its place.
  const [subpaths, setSubpaths] = useState<Readonly<Record<string, string>>>({});
  if (current !== null && subpaths[current.module.id] !== current.subpath) {
    setSubpaths({ ...subpaths, [current.module.id]: current.subpath });
  }
  return (
    <>
      {children}
      {Object.entries(subpaths).map(([id, subpath]) => {
        const module = moduleRegistry.byId(id);
        if (module === null) return null;
        return (
          <ModulePageFrame
            key={id}
            module={module}
            subpath={subpath}
            active={current?.module.id === id}
          />
        );
      })}
    </>
  );
}
