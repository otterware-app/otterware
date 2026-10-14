import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";

import { SettingsPageContainer } from "../components/settings/settingsLayout";
import { moduleRegistry } from "../otterware/registry";

/** A module's settings section (`WebModule.settings`), at `/settings/<module id>`. */
function ModuleSettingsRoutePage() {
  const { moduleId } = Route.useParams();
  const section = moduleRegistry.byId(moduleId)?.settings;
  if (!section) return null;
  const Section = section.component;
  return (
    <SettingsPageContainer>
      <Suspense fallback={null}>
        <Section />
      </Suspense>
    </SettingsPageContainer>
  );
}

export const Route = createFileRoute("/settings/$moduleId")({
  beforeLoad: ({ params }) => {
    if (moduleRegistry.byId(params.moduleId)?.settings == null) throw notFound();
  },
  component: ModuleSettingsRoutePage,
});
