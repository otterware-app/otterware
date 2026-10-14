/**
 * The frame the host draws around a module's page (ADR 0020): the page header
 * with the space or project title, the module's header actions and the
 * Otterware Assistant toggle; the content; and the Assistant beside it. While
 * the environment does not run the module (off or failed in Settings ›
 * Modules, not in that server's profile, or a plain Otter Code server) the
 * content gives way to a calm state. Pages are content only; one that needs
 * to adjust the frame (a title of its own, this browser's chat) calls
 * `useModulePageFrame().setOverrides`.
 */
import {
  useActiveSpaceId,
  useAssistantOpen,
  useShellSelection,
  type ModuleHeaderAction,
  type ModuleSpace,
  type WebModule,
} from "@otterware/module-kit/web";
import { Link } from "@tanstack/react-router";
import { CloudOffIcon, MessagesSquareIcon, PowerOffIcon, TriangleAlertIcon } from "lucide-react";
import {
  Activity,
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { isElectron } from "../env";
import { type ServerModuleAvailability, useServerModuleAvailability } from "./moduleState";
import { MODULES_SETTINGS_PATH } from "./settingsRegistry";

const ModuleSideChat = lazy(() =>
  import("./sideChat/ModuleSideChat").then((m) => ({ default: m.ModuleSideChat })),
);

export const ASSISTANT_LABEL = "Otterware Assistant";

export interface ModulePageFrameOverrides {
  /** Replaces the space or module label in the header. */
  readonly title?: ReactNode;
  /** Replaces what the server reports, e.g. this browser's module state. */
  readonly availability?: ServerModuleAvailability;
  /** Replaces the Assistant thread beside the page. */
  readonly assistantContent?: ReactNode;
}

interface ModulePageFrame {
  readonly setOverrides: (overrides: ModulePageFrameOverrides | null) => void;
}

const FrameContext = createContext<ModulePageFrame | null>(null);

/** For pages: adjust the frame while mounted; pass null to reset. */
export function useModulePageFrame(): ModulePageFrame {
  const frame = useContext(FrameContext);
  if (frame === null) throw new Error("useModulePageFrame must be used inside a module page.");
  return frame;
}

/** Applies `overrides` while the calling page is active; memoize the object in the page. */
export function useModulePageFrameOverrides(
  overrides: ModulePageFrameOverrides | null,
  active = true,
): void {
  const { setOverrides } = useModulePageFrame();
  useEffect(() => {
    if (!active) return;
    setOverrides(overrides);
    return () => setOverrides(null);
  }, [active, overrides, setOverrides]);
}

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

/** The module's header actions, from its hook, as icon buttons. */
function HeaderActions({ module }: { readonly module: WebModule }) {
  const useHeaderActions = module.useHeaderActions ?? useNoActions;
  const actions = useHeaderActions();
  return actions.map((action) => {
    const Icon = action.icon;
    if (action.emphasis === "primary") {
      return (
        <Button
          key={action.id}
          variant="outline"
          size="xs"
          disabled={action.disabled}
          onClick={action.onSelect}
        >
          <Icon />
          {action.label}
        </Button>
      );
    }
    return (
      <Tooltip key={action.id}>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={action.label}
              disabled={action.disabled}
              onClick={action.onSelect}
            />
          }
        >
          <Icon />
        </TooltipTrigger>
        <TooltipPopup side="bottom">{action.label}</TooltipPopup>
      </Tooltip>
    );
  });
}

const NO_SPACES: ReadonlyArray<ModuleSpace> = [];
const useNoSpaces = () => NO_SPACES;
const NO_ACTIONS: ReadonlyArray<ModuleHeaderAction> = [];
const useNoActions = () => NO_ACTIONS;

function DefaultTitle({
  module,
  projectTitle,
}: {
  readonly module: WebModule;
  readonly projectTitle: ReactNode;
}) {
  const spaceId = useActiveSpaceId(module.id);
  const useSpaces = module.useSpaces ?? useNoSpaces;
  const spaces = useSpaces();
  return projectTitle ?? spaces.find((space) => space.id === spaceId)?.label ?? module.label;
}

export function ModulePageLayout({
  module,
  projectTitle = null,
  children,
}: {
  readonly module: WebModule;
  /** Inside a cross-app project: the project's name heads the page. */
  readonly projectTitle?: ReactNode;
  readonly children: ReactNode;
}) {
  const serverAvailability = useServerModuleAvailability(module.serverModule);
  const [overrides, setOverrides] = useState<ModulePageFrameOverrides | null>(null);
  const frame = useMemo<ModulePageFrame>(() => ({ setOverrides }), []);
  const availability = overrides?.availability ?? serverAvailability;
  const available = availability === "on";
  const chatOpen = useAssistantOpen(module.id);
  const setAssistantOpen = useShellSelection((state) => state.setAssistantOpen);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1" data-module-layout={module.id}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
          <WorkspacePageHeader electron={isElectron}>
            <h1 className="min-w-0 flex-1 truncate text-sm font-medium">
              {overrides?.title ?? <DefaultTitle module={module} projectTitle={projectTitle} />}
            </h1>
            {available ? <HeaderActions module={module} /> : null}
            {available && module.sideChat ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Toggle ${ASSISTANT_LABEL}`}
                      aria-pressed={chatOpen}
                      onClick={() => setAssistantOpen(module.id, !chatOpen)}
                    />
                  }
                >
                  <MessagesSquareIcon />
                </TooltipTrigger>
                <TooltipPopup side="bottom">{ASSISTANT_LABEL}</TooltipPopup>
              </Tooltip>
            ) : null}
          </WorkspacePageHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Activity mode={available || availability === "loading" ? "visible" : "hidden"}>
              <div className="flex min-h-0 flex-1 flex-col">
                <FrameContext value={frame}>{children}</FrameContext>
              </div>
            </Activity>
            {!available && availability !== "loading" ? (
              <ModuleUnavailable label={module.label} availability={availability} />
            ) : null}
          </div>
        </div>
        {available && chatOpen && module.sideChat ? (
          <aside
            className="flex min-h-0 w-96 max-w-[50vw] shrink-0 border-l border-border"
            aria-label={ASSISTANT_LABEL}
          >
            <Suspense fallback={null}>
              {overrides?.assistantContent ?? (
                <ModuleSideChat
                  moduleId={module.id}
                  onHide={() => setAssistantOpen(module.id, false)}
                  hideShortcutLabel={`Close ${ASSISTANT_LABEL}`}
                />
              )}
            </Suspense>
          </aside>
        ) : null}
      </div>
    </SidebarInset>
  );
}
