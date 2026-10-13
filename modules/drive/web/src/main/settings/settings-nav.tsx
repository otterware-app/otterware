import type { ComponentType } from "react";
import {
  ArrowLeftIcon,
  CircleUserRoundIcon,
  PaletteIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";
import { useDriveHost } from "../../host";
import { SidebarHeading, SidebarRow } from "../sidebar-ui";

const SETTINGS_PANES = ["folder", "members", "appearance", "account"] as const;
export type SettingsPane = (typeof SETTINGS_PANES)[number];

const SETTINGS_PANE_META: Record<
  SettingsPane,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  folder: { label: "Drives and folders", icon: Settings2Icon },
  members: { label: "Shared drive access", icon: UsersIcon },
  appearance: { label: "Appearance", icon: PaletteIcon },
  account: { label: "Account", icon: CircleUserRoundIcon },
};

/** Inside the Otterware shell, its Settings own the account and appearance. */
export function useSettingsPanes(): readonly SettingsPane[] {
  const { embedded } = useDriveHost();
  return embedded ? ["folder", "members"] : SETTINGS_PANES;
}

/**
 * The sidebar while Settings is open (Otter Mail's): the sections, then Back
 * to the documents.
 */
export function SettingsNav({
  pane,
  onSelect,
  onBack,
}: {
  pane: string;
  onSelect: (pane: SettingsPane) => void;
  onBack: () => void;
}) {
  const panes = useSettingsPanes();
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div aria-hidden className="h-(--drive-workspace-topbar-height) shrink-0" />
      <SidebarHeading>Settings</SidebarHeading>
      <nav
        aria-label="Settings"
        className="drive-scroll-fade-y flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-(--drive-sidebar-content-inset) pb-8"
      >
        {panes.map((id) => {
          const { label, icon: Icon } = SETTINGS_PANE_META[id];
          return (
            <SidebarRow
              key={id}
              icon={<Icon />}
              title={label}
              selected={id === pane}
              onClick={() => onSelect(id)}
            />
          );
        })}
      </nav>
      <div className="flex shrink-0 flex-col gap-0.5 px-(--drive-sidebar-content-inset) pt-1 pb-(--drive-sidebar-content-inset)">
        <SidebarRow icon={<ArrowLeftIcon />} title="Back" onClick={onBack} />
      </div>
    </div>
  );
}
