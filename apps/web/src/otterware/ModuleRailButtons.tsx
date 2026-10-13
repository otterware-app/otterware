/**
 * The rail's module buttons, from the registry. `SpaceRail` renders them in
 * two places and hands over its own button component, so this file never
 * imports the rail (no import cycle) and the buttons look like the rest.
 */
import { modulePath, type RailPosition } from "@otterware/module-kit/web";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";

import { useSidebar } from "../components/ui/sidebar";
import { moduleRegistry } from "./registry";

export interface ModuleRailButtonProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

export function ModuleRailButtons({
  position,
  button: Button,
  divider = null,
}: {
  readonly position: RailPosition;
  readonly button: ComponentType<ModuleRailButtonProps>;
  /** Drawn before the buttons when there are any. */
  readonly divider?: ReactNode;
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const activeModuleId = useLocation({
    select: (location) => moduleRegistry.forPath(location.pathname)?.module.id ?? null,
  });
  const modules = moduleRegistry.rail(position);
  if (modules.length === 0) return null;

  return (
    <>
      {divider}
      {modules.map((module) => {
        const Icon = module.icon;
        return (
          <Button
            key={module.id}
            label={module.label}
            selected={activeModuleId === module.id}
            onClick={() => {
              if (isMobile) setOpenMobile(false);
              void navigate({ href: modulePath(module.id) });
            }}
          >
            <Icon className="size-4.5" />
          </Button>
        );
      })}
    </>
  );
}
