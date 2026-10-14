/**
 * The rail's Otterware pieces (ADR 0020), rendered by `SpaceRail` with its own
 * button so they look like the rest and this file never imports the rail:
 * Home, the app switcher, the active module's spaces, and pins. The combined
 * profile shows all of them; a standalone profile only its module's spaces.
 */
import {
  HOME_MODULE_ID,
  modulePath,
  useShellSelection,
  type ModuleSpace,
  type WebModule,
} from "@otterware/module-kit/web";
import { useNavigate } from "@tanstack/react-router";
import { CodeXmlIcon } from "lucide-react";
import type { ComponentType, MouseEvent, ReactNode } from "react";

import { useSidebar } from "../components/ui/sidebar";
import { ProjectMonogram } from "../components/ProjectMonogram";
import { ensureLocalApi } from "../localApi";
import { deriveProjectIdentity } from "../projectIdentity";
import { moduleRegistry } from "./registry";
import { applyPinMenuAction, pinMenuItem, railPinId, useRailPins, type RailPin } from "./railPins";
import { homeModule, SWITCHER_APPS, useShellApp, useShellAppStore, type ShellApp } from "./shell";

export interface RailButtonProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onClick: () => void;
  readonly onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly children: ReactNode;
}

type RailButtonComponent = ComponentType<RailButtonProps>;

function useLeaveSheet() {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => {
    if (isMobile) setOpenMobile(false);
  };
}

/** Right-click on a space or pin: the one entry that pins or unpins it. */
function usePinContextMenu() {
  const pins = useRailPins((state) => state.pins);
  return (pin: RailPin) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const pinned = pins.some((entry) => entry.id === pin.id);
    void ensureLocalApi()
      .contextMenu.show([pinMenuItem(pinned)], { x: event.clientX, y: event.clientY })
      .then((action) => applyPinMenuAction(action, pin));
  };
}

const NO_SPACES: ReadonlyArray<ModuleSpace> = [];
const useNoSpaces = () => NO_SPACES;

function RailBadge({ count }: { readonly count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-3xs leading-4 font-medium text-primary-foreground tabular-nums"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Home on top of the combined rail. */
export function HomeRailButton({ button: Button }: { readonly button: RailButtonComponent }) {
  const navigate = useNavigate();
  const leaveSheet = useLeaveSheet();
  const activeApp = useShellApp();
  if (homeModule === null) return null;
  const Icon = homeModule.icon;
  return (
    <Button
      label={homeModule.label}
      selected={activeApp === HOME_MODULE_ID}
      onClick={() => {
        leaveSheet();
        void navigate({ href: modulePath(HOME_MODULE_ID) });
      }}
    >
      <Icon className="size-5" />
    </Button>
  );
}

export function useSwitchApp() {
  const navigate = useNavigate();
  const leaveSheet = useLeaveSheet();
  return (app: ShellApp) => {
    leaveSheet();
    const href = app === "code" ? useShellAppStore.getState().codeHref : modulePath(app);
    void navigate({ href });
  };
}

/** The modules that are on, Code first: the combined profile's second rail group. */
export function AppSwitcher({ button: Button }: { readonly button: RailButtonComponent }) {
  const activeApp = useShellApp();
  const switchApp = useSwitchApp();
  return SWITCHER_APPS.map((app) => {
    const module = app === "code" ? null : moduleRegistry.byId(app);
    const Icon = module?.icon ?? CodeXmlIcon;
    return (
      <Button
        key={app}
        label={module?.label ?? "Code"}
        selected={activeApp === app}
        onClick={() => switchApp(app)}
      >
        <Icon className="size-5" />
      </Button>
    );
  });
}

function SpaceButton({
  module,
  space,
  button: Button,
}: {
  readonly module: WebModule;
  readonly space: ModuleSpace;
  readonly button: RailButtonComponent;
}) {
  const navigate = useNavigate();
  const leaveSheet = useLeaveSheet();
  const selectSpace = useShellSelection((state) => state.selectSpace);
  const activeSpaceId = useShellSelection((state) => state.activeSpaceByModule[module.id] ?? null);
  const onContextMenu = usePinContextMenu();
  const Icon = space.icon;
  const href = space.href ?? modulePath(module.id);
  return (
    <Button
      label={space.label}
      selected={activeSpaceId === space.id}
      onClick={() => {
        leaveSheet();
        selectSpace(module.id, space.id);
        void navigate({ href });
      }}
      onContextMenu={onContextMenu({
        id: railPinId(module.id, "space", space.id),
        module: module.id,
        kind: "space",
        label: space.label,
        href,
        spaceId: space.id,
      })}
    >
      <Icon className="size-5" />
      {space.badge === undefined ? null : <RailBadge count={space.badge} />}
    </Button>
  );
}

/** The active module's spaces; nothing when the module declares none. */
export function ModuleSpaceButtons({
  module,
  button,
}: {
  readonly module: WebModule;
  readonly button: RailButtonComponent;
}) {
  const useSpaces = module.useSpaces ?? useNoSpaces;
  const spaces = useSpaces();
  return spaces.map((space) => (
    <SpaceButton key={space.id} module={module} space={space} button={button} />
  ));
}

/** Pinned spaces and rows, below the active module's spaces. */
export function RailPinButtons({
  button: Button,
  divider,
}: {
  readonly button: RailButtonComponent;
  readonly divider: ReactNode;
}) {
  const navigate = useNavigate();
  const leaveSheet = useLeaveSheet();
  const pins = useRailPins((state) => state.pins);
  const selectSpace = useShellSelection((state) => state.selectSpace);
  const onContextMenu = usePinContextMenu();
  if (pins.length === 0) return null;
  return (
    <>
      {divider}
      {pins.map((pin) => {
        const module = moduleRegistry.byId(pin.module);
        const Icon = module?.icon;
        const identity = deriveProjectIdentity(pin.label);
        return (
          <Button
            key={pin.id}
            label={pin.label}
            onClick={() => {
              leaveSheet();
              if (pin.spaceId !== undefined) selectSpace(pin.module, pin.spaceId);
              void navigate({ href: pin.href });
            }}
            onContextMenu={onContextMenu(pin)}
          >
            {pin.kind === "space" && Icon ? (
              <Icon className="size-5" />
            ) : (
              <ProjectMonogram text={identity.monogram} color={identity.color} className="size-6" />
            )}
          </Button>
        );
      })}
    </>
  );
}
