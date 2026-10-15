/**
 * The host sidebar on a module's pages (ADR 0020): the module's rows for the
 * active space, drawn with the thread sidebar's own pieces. Rows come from the
 * module's `useSidebar` hook as data; right-clicking one offers its actions
 * and "Pin to rail". Inside a cross-app project, Home owns the sidebar.
 */
import {
  type ModuleLocation,
  type ModuleSidebarRow,
  type ModuleSidebarSection,
  type ModuleSpace,
  type WebModule,
  useActiveSpaceId,
} from "@otterware/module-kit/web";
import type { ContextMenuItem } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";
import { useState, type MouseEvent } from "react";

import { Button } from "../components/ui/button";
import { CollapsibleSectionHeader } from "../components/ui/collapsible-section-header";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "../components/ui/sidebar";
import {
  SidebarChromeFooter,
  SidebarChromeHeader,
  SidebarSpaceTitle,
} from "../components/sidebar/SidebarChrome";
import { isElectron } from "../env";
import { ensureLocalApi } from "../localApi";
import { applyPinMenuAction, pinMenuItem, railPinId, useRailPins } from "./railPins";
import { shellKind } from "./shell";

const NO_SECTIONS: ReadonlyArray<ModuleSidebarSection> = [];
const useNoSections = () => NO_SECTIONS;
const NO_SPACES: ReadonlyArray<ModuleSpace> = [];
const useNoSpaces = () => NO_SPACES;

/** Right-click: the row's own actions, then pin or unpin when the row has a destination. */
function useRowContextMenu(module: WebModule) {
  const pins = useRailPins((state) => state.pins);
  return (row: ModuleSidebarRow) => {
    const actions = row.actions ?? [];
    const pinId = railPinId(module.id, "row", row.id);
    const canPin = shellKind === "combined" && row.href !== undefined;
    if (actions.length === 0 && !canPin) return undefined;
    return (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      const items: Array<ContextMenuItem<string>> = actions.map((action) => ({
        id: `action:${action.id}`,
        label: action.label,
        ...(action.destructive ? { destructive: true } : {}),
      }));
      if (canPin) {
        const pinned = pins.some((pin) => pin.id === pinId);
        items.push({ ...pinMenuItem(pinned), separatorBefore: items.length > 0 });
      }
      void ensureLocalApi()
        .contextMenu.show(items, { x: event.clientX, y: event.clientY })
        .then((choice) => {
          if (choice === null) return;
          if (choice.startsWith("action:")) {
            actions.find((action) => `action:${action.id}` === choice)?.onSelect();
          } else if (row.href !== undefined) {
            applyPinMenuAction(choice, {
              id: pinId,
              module: module.id,
              kind: "row",
              label: row.label,
              href: row.href,
            });
          }
        });
    };
  };
}

function RowTrailing({ row }: { readonly row: ModuleSidebarRow }) {
  if (!row.detail) return null;
  return (
    <span className="ms-auto shrink-0 font-normal text-2xs text-muted-foreground tabular-nums">
      {row.detail}
    </span>
  );
}

function Rows({
  module,
  rows,
}: {
  readonly module: WebModule;
  readonly rows: ReadonlyArray<ModuleSidebarRow>;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const contextMenu = useRowContextMenu(module);
  const select = (row: ModuleSidebarRow) => {
    if (isMobile) setOpenMobile(false);
    row.onSelect();
  };
  return (
    <SidebarMenu>
      {rows.map((row) => (
        <SidebarMenuItem key={row.id}>
          <SidebarMenuButton
            {...row.drag}
            isActive={row.active}
            onClick={() => select(row)}
            onContextMenu={contextMenu(row)}
          >
            {row.icon}
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <RowTrailing row={row} />
          </SidebarMenuButton>
          {row.children?.length ? (
            <ChildRows module={module} rows={row.children} select={select} />
          ) : null}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function ChildRows({
  module,
  rows,
  select,
}: {
  module: WebModule;
  rows: ReadonlyArray<ModuleSidebarRow>;
  select: (row: ModuleSidebarRow) => void;
}) {
  const contextMenu = useRowContextMenu(module);
  return (
    <SidebarMenuSub>
      {rows.map((row) => (
        <SidebarMenuSubItem key={row.id}>
          <SidebarMenuSubButton
            {...row.drag}
            size="sm"
            isActive={row.active}
            onClick={() => select(row)}
            onContextMenu={contextMenu(row)}
          >
            {row.icon}
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <RowTrailing row={row} />
          </SidebarMenuSubButton>
          {row.children?.length ? (
            <ChildRows module={module} rows={row.children} select={select} />
          ) : null}
        </SidebarMenuSubItem>
      ))}
    </SidebarMenuSub>
  );
}

function Section({
  module,
  section,
}: {
  readonly module: WebModule;
  readonly section: ModuleSidebarSection;
}) {
  const [open, setOpen] = useState(true);
  if (section.title === undefined) {
    return (
      <SidebarGroup>
        <Rows module={module} rows={section.rows} />
      </SidebarGroup>
    );
  }
  return (
    <SidebarGroup>
      <div className="flex items-center gap-0.5">
        <div className="min-w-0 flex-1">
          <CollapsibleSectionHeader expanded={open} onClick={() => setOpen((value) => !value)}>
            {section.title}
          </CollapsibleSectionHeader>
        </div>
        {section.action ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={section.action.label}
            onClick={section.action.onSelect}
          >
            <PlusIcon />
          </Button>
        ) : null}
      </div>
      {!open ? null : section.rows.length === 0 && section.empty ? (
        <p className="px-2 py-1 text-muted-foreground text-xs">{section.empty}</p>
      ) : (
        <Rows module={module} rows={section.rows} />
      )}
    </SidebarGroup>
  );
}

function ModuleSections({
  module,
  location,
}: {
  readonly module: WebModule;
  readonly location: ModuleLocation;
}) {
  const spaceId = useActiveSpaceId(module.id);
  const useSidebar = module.useSidebar ?? useNoSections;
  const useSpaces = module.useSpaces ?? useNoSpaces;
  const sections = useSidebar({
    spaceId,
    subpath: location.subpath,
    projectId: location.projectId,
  });
  const spaces = useSpaces();
  const title = spaces.find((space) => space.id === spaceId)?.label ?? module.label;
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron}>
        <SidebarSpaceTitle>{title}</SidebarSpaceTitle>
      </SidebarChromeHeader>
      <SidebarContent className="min-h-full">
        {sections.map((section) => (
          <Section key={section.id} module={module} section={section} />
        ))}
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}

/** The sidebar for `location`, owned by `owner` (Home inside a cross-app project). */
export function ModuleSidebar({
  owner,
  location,
}: {
  readonly owner: WebModule;
  readonly location: ModuleLocation;
}) {
  return <ModuleSections key={owner.id} module={owner} location={location} />;
}
