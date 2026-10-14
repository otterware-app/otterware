import { useModulePageContext, type ModulePageProps } from "@otterware/module-kit/web";
import { ModulePageLayout } from "../ModulePageLayout";
import { HomeSidebar } from "./HomeSidebar";
import {
  HomeDashboardPage,
  HomeNeedsYouPage,
  HomeAgentsPage,
  HomeProjectPage,
  HomeViewPage,
} from "./HomePages";

export default function HomePage({ subpath, active }: ModulePageProps) {
  const [section, id] = subpath.split("/");
  useModulePageContext({ module: "home", title: "Home", refs: [] }, active);
  return (
    <ModulePageLayout moduleId="home" sidebar={<HomeSidebar />}>
      {section === "needs-you" ? (
        <HomeNeedsYouPage />
      ) : section === "agents" ? (
        <HomeAgentsPage />
      ) : section === "projects" && id ? (
        <HomeProjectPage projectId={id} />
      ) : section === "views" && id ? (
        <HomeViewPage viewId={id} />
      ) : (
        <HomeDashboardPage />
      )}
    </ModulePageLayout>
  );
}
