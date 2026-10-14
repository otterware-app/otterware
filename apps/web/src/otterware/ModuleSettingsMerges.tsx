/**
 * Module settings pages whose placement merges them into the host page being
 * shown (ADR 0011): each renders as one section, titled with the page's label,
 * below the host page's own rows. `SettingsPageContainer` renders this once
 * per page through its seam; module pages themselves add nothing here.
 */
import { useLocation } from "@tanstack/react-router";
import { Suspense } from "react";

import { SettingsSection } from "../components/settings/settingsLayout";
import { mergedModuleSettingsPages } from "./settingsRegistry";

export function ModuleSettingsMerges() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return mergedModuleSettingsPages(pathname).map((entry) => {
    const Page = entry.page.component;
    return (
      <SettingsSection key={entry.sectionId} id={entry.sectionId} title={entry.page.label}>
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </SettingsSection>
    );
  });
}
