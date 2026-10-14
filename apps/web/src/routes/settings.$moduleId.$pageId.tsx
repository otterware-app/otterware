import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";

import { SettingsPageContainer, SettingsSection } from "../components/settings/settingsLayout";
import { moduleSettingsPage } from "../otterware/settingsRegistry";

/** A module's own settings page (`WebModuleSettingsPage` placed as a page), at `/settings/<module>/<page>`. */
function ModuleSettingsRoutePage() {
  const { moduleId, pageId } = Route.useParams();
  const entry = moduleSettingsPage(moduleId, pageId);
  if (entry === null) return null;
  const Page = entry.page.component;
  return (
    <SettingsPageContainer>
      <SettingsSection id={entry.sectionId} title={entry.page.label}>
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export const Route = createFileRoute("/settings/$moduleId/$pageId")({
  beforeLoad: ({ params }) => {
    if (moduleSettingsPage(params.moduleId, params.pageId) === null) throw notFound();
  },
  component: ModuleSettingsRoutePage,
});
