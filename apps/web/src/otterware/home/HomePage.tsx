import { useModulePageContext, type ModulePageProps } from "@otterware/module-kit/web";
import { useEffect } from "react";

import { HomeAgentsPage, HomeDashboardPage, HomeNeedsYouPage, HomeViewPage } from "./HomePages";
import { HomeProjectItemsPage, HomeProjectPage } from "./HomeProjectPage";
import { useHomeOverview } from "./homePresentation";
import { HomeDialogHost, useCurrentProject } from "./homeShell";

/** Home's content; the host draws the sidebar and header from `homeShell.tsx`. */
export default function HomePage({ subpath, active }: ModulePageProps) {
  const [section, id, nested, app] = subpath.split("/");
  const projectId = section === "projects" && id ? id : null;
  useModulePageContext({ module: "home", title: "Home", refs: [] }, active);
  const setCurrentProject = useCurrentProject((state) => state.setProjectId);
  useEffect(() => {
    if (!active) return;
    setCurrentProject(projectId);
    return () => setCurrentProject(null);
  }, [active, projectId, setCurrentProject]);
  const { environmentId, overview } = useHomeOverview();
  return (
    <>
      {section === "needs-you" ? (
        <HomeNeedsYouPage />
      ) : section === "agents" ? (
        <HomeAgentsPage />
      ) : projectId !== null && nested === "items" && app ? (
        <HomeProjectItemsPage projectId={projectId} app={app} />
      ) : projectId !== null ? (
        <HomeProjectPage projectId={projectId} />
      ) : section === "views" && id ? (
        <HomeViewPage viewId={id} />
      ) : (
        <HomeDashboardPage />
      )}
      {environmentId !== null ? (
        <HomeDialogHost
          environmentId={environmentId}
          projects={(overview?.projects ?? []).map((entry) => entry.project)}
        />
      ) : null}
    </>
  );
}
