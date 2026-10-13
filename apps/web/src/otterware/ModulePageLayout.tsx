/**
 * The frame of a module page: a header with the module's label (or a title
 * of the page's own), the module's own navigation on the left when it has
 * one, and the content. While the primary environment does not run the
 * module (off or failed in Settings › Modules, not in that server's profile,
 * or a plain Otter Code server) the content gives way to a calm state. The
 * Code thread sidebar hides on module pages (`AppSidebarLayout`); the rail
 * stays.
 */
import { CloudOffIcon, PowerOffIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Activity, lazy, Suspense, useState } from "react";
import { MessagesSquareIcon } from "lucide-react";
const ModuleSideChat = lazy(() =>
  import("./sideChat/ModuleSideChat").then((m) => ({ default: m.ModuleSideChat })),
);

import { Button } from "../components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { isElectron } from "../env";
import { MODULES_SETTINGS_PATH } from "./settingsRegistry";
import { type ServerModuleAvailability, useServerModuleAvailability } from "./moduleState";
import { moduleRegistry } from "./registry";
import { Link } from "@tanstack/react-router";

function ModuleUnavailable({
  label,
  availability,
}: {
  readonly label: string;
  readonly availability: Exclude<ServerModuleAvailability, "loading" | "on">;
}) {
  const settingsLink = (
    <EmptyContent>
      <Button variant="outline" size="sm" render={<Link to={MODULES_SETTINGS_PATH} />}>
        Open Settings › Modules
      </Button>
    </EmptyContent>
  );
  switch (availability) {
    case "off":
      return (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PowerOffIcon />
            </EmptyMedia>
            <EmptyTitle>{label} is turned off</EmptyTitle>
            <EmptyDescription>
              {label} is off on this environment. Turn it on to use its pages and agent tools.
            </EmptyDescription>
          </EmptyHeader>
          {settingsLink}
        </Empty>
      );
    case "failed":
      return (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{label} could not start</EmptyTitle>
            <EmptyDescription>
              The module failed to start on this environment. Settings › Modules shows why; turning
              it on again retries.
            </EmptyDescription>
          </EmptyHeader>
          {settingsLink}
        </Empty>
      );
    case "not-installed":
    case "no-modules":
      return (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CloudOffIcon />
            </EmptyMedia>
            <EmptyTitle>{label} isn’t available here</EmptyTitle>
            <EmptyDescription>
              {availability === "no-modules"
                ? `Module state could not be read. Reconnect or use an environment that supports ${label}.`
                : `This environment’s build doesn’t include ${label}.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
  }
}

export function ModulePageLayout({
  moduleId,
  title,
  sidebar,
  headerActions,
  children,
}: {
  readonly moduleId: string;
  /** Replaces the module label in the page header. */
  readonly title?: ReactNode;
  /** The module's own navigation (folders, calendars, ...), left of the content. */
  readonly sidebar?: ReactNode;
  readonly headerActions?: ReactNode;
  readonly children: ReactNode;
}) {
  const module = moduleRegistry.byId(moduleId);
  const label = module?.label ?? moduleId;
  const availability = useServerModuleAvailability(module?.serverModule ?? null);
  const available = availability === "on";
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1" data-module-layout={moduleId}>
        {sidebar ? (
          <Activity mode={available ? "visible" : "hidden"}>
            <nav
              aria-label={label}
              className="flex w-60 shrink-0 flex-col border-r border-border bg-background"
            >
              <div className="h-(--workspace-topbar-height) shrink-0" />
              <div className="min-h-0 flex-1 overflow-y-auto">{sidebar}</div>
            </nav>
          </Activity>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
          <WorkspacePageHeader electron={isElectron}>
            <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title ?? label}</h1>
            {available ? headerActions : null}
            {available && module?.sideChat ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Toggle assistant"
                onClick={() => setChatOpen((value) => !value)}
              >
                <MessagesSquareIcon />
              </Button>
            ) : null}
          </WorkspacePageHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Activity mode={available || availability === "loading" ? "visible" : "hidden"}>
              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            </Activity>
            {!available && availability !== "loading" ? (
              <ModuleUnavailable label={label} availability={availability} />
            ) : null}
          </div>
        </div>
        {available && chatOpen && module?.sideChat ? (
          <aside
            className="flex min-h-0 w-96 max-w-[50vw] shrink-0 border-l border-border"
            aria-label="Assistant"
          >
            <Suspense fallback={null}>
              <ModuleSideChat
                moduleId={moduleId}
                onHide={() => setChatOpen(false)}
                hideShortcutLabel="Close assistant"
              />
            </Suspense>
          </aside>
        ) : null}
      </div>
    </SidebarInset>
  );
}
