import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";

import { SettingsPageContainer, SettingsSearchTarget } from "../components/settings/settingsLayout";
import { moduleSettingsPage } from "../otterware/settingsRegistry";

/**
 * A module's own settings page (`WebModuleSettingsPage` placed as a page), at
 * `/settings/<module>/<page>`. The page renders its own sections; the header's
 * breadcrumb names it, so no title is drawn here.
 */
function ModuleSettingsRoutePage() {
  const { moduleId, pageId } = Route.useParams();
  const entry = moduleSettingsPage(moduleId, pageId);
  if (entry === null) return null;
  const Page = entry.page.component;
  return (
    <SettingsPageContainer>
      <SettingsSearchTarget id={entry.sectionId} className="flex flex-col gap-8 outline-none">
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </SettingsSearchTarget>
    </SettingsPageContainer>
  );
}

export const Route = createFileRoute("/settings/$moduleId/$pageId")({
  beforeLoad: ({ params }) => {
    if (moduleSettingsPage(params.moduleId, params.pageId) === null) throw notFound();
  },
  component: ModuleSettingsRoutePage,
});
