import { Outlet } from "@tanstack/react-router";
import * as React from "react";
import { startSyncedPreferences } from "./synced-preferences";
import { applyAppTheme, startAppTheme } from "./theme/apply-theme";
import { applyInterfaceSettings, startInterfaceSettings } from "./theme/interface-settings";

import { ThemeEditorHost } from "./settings/theme/ThemeEditorHost";

// Color theme (Settings → Appearance) for the current appearance, applied
// before first paint. It also owns the `dark` class on <html>.

// Contrast, glass and the font size, also before first paint.

export function RootView({ children }: { children?: React.ReactNode } = {}) {
  React.useLayoutEffect(() => {
    applyAppTheme();
    applyInterfaceSettings();
  }, []);
  // Re-theme live on appearance switches and theme picks from any window.
  React.useEffect(() => startAppTheme(), []);

  React.useEffect(() => startInterfaceSettings(), []);
  React.useEffect(() => startSyncedPreferences(), []);

  return (
    <div className="h-full relative">
      {children ?? <Outlet />}
      <ThemeEditorHost />
    </div>
  );
}
