import { ProviderConnections } from "./account/ProviderConnections";
/**
 * Module settings pages whose placement merges them into the host page being
 * shown (ADR 0011), below the host page's own sections. A module page draws
 * its own titled sections, as on its own page, so nothing wraps it here.
 * `SettingsPageContainer` renders this once per page through its seam.
 */
import { useLocation } from "@tanstack/react-router";
import { Suspense } from "react";

import { SettingsSearchTarget, SettingsSection } from "../components/settings/settingsLayout";
import { mergedModuleSettingsPages } from "./settingsRegistry";

export function ModuleSettingsMerges() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <>
      {pathname === "/settings/connections" ? (
        <SettingsSection title="Otter Account connections">
          <ProviderConnections />
        </SettingsSection>
      ) : null}
      {mergedModuleSettingsPages(pathname).map((entry) => {
        const Page = entry.page.component;
        return (
          <SettingsSearchTarget
            key={entry.sectionId}
            id={entry.sectionId}
            className="flex flex-col gap-8 outline-none"
          >
            <Suspense fallback={null}>
              <Page />
            </Suspense>
          </SettingsSearchTarget>
        );
      })}
    </>
  );
}
