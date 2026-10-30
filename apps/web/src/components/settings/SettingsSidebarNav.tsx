import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import {
  ArchiveIcon,
  FlaskConicalIcon,
  BotIcon,
  createLucideIcon,
  CalendarClockIcon,
  BracesIcon,
  FileDiffIcon,
  FolderTreeIcon,
  GitBranchIcon,
  GlobeIcon,
  InfoIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  PanelsTopLeftIcon,
  KeyboardIcon,
  LayersIcon,
  KeyRoundIcon,
  PaletteIcon,
  PuzzleIcon,
  SearchIcon,
  ServerIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SmartphoneIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarInput,
} from "../ui/sidebar";
import { scrollToSettingsTarget } from "./settingsLayout";
import {
  searchSettings,
  SETTINGS_NAV_GROUPS,
  SETTINGS_SECTION_LABELS,
  type SettingsPath,
  type SettingsSearchItem,
} from "./settingsSearch";
import { useAvailableSettingsSearchItems } from "./useAvailableSettingsSearchItems";
import { validateSettingsScopeSearch } from "./settingsScope";
import { workspaceAreaProps } from "../../lib/workspaceFocus";

const SnapShotIcon = createLucideIcon("snap-shot", [
  [
    "path",
    {
      d: "M8 3H6a3 3 0 0 0-3 3v2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2",
      key: "capture-frame",
    },
  ],
  ["rect", { width: "10", height: "8", x: "7", y: "8", rx: "2", key: "window" }],
  ["circle", { cx: "12", cy: "12", r: "1.5", key: "lens" }],
]);

const T3ConnectSidebarSignIn = lazy(() =>
  import("../accounts/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarSignIn,
  })),
);
const T3ConnectSidebarAvatar = lazy(() =>
  import("../accounts/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarAvatar,
  })),
);

// Otterware seam: module pages, their icons, grouping and profile visibility
// follow the registry (docs/internals/modules.md).
import {
  OTTERWARE_SETTINGS_NAV_LABELS,
  OTTERWARE_SETTINGS_SECTION_ICONS,
  isProfileSettingsPathVisible,
  settingsNavLayout,
} from "../../otterware/settingsRegistry";
import { useOnModuleIds } from "../../otterware/moduleState";
import { setKeybindingsChip, useKeybindingsChip } from "../../otterware/shellKeybindings";

const SETTINGS_SECTION_ICONS: Readonly<
  Record<SettingsPath, ComponentType<{ className?: string }>>
> = {
  ...OTTERWARE_SETTINGS_SECTION_ICONS,
  "/settings/general": Settings2Icon,
  "/settings/diagnostics": WrenchIcon,
  "/settings/appearance": PaletteIcon,
  "/settings/chat": MessageSquareTextIcon,
  "/settings/diffs": FileDiffIcon,
  "/settings/projects": PanelsTopLeftIcon,
  "/settings/project-groups": LayersIcon,
  "/settings/keybindings": KeyboardIcon,
  "/settings/snap-shot": SnapShotIcon,
  "/settings/providers": BotIcon,
  "/settings/threads": MessagesSquareIcon,
  "/settings/browser": GlobeIcon,
  "/settings/extensions": PuzzleIcon,
  "/settings/devices": SmartphoneIcon,
  "/settings/scheduled-tasks": CalendarClockIcon,
  "/settings/source-control": GitBranchIcon,
  "/settings/code-intelligence": BracesIcon,
  "/settings/worktrees": FolderTreeIcon,
  "/settings/connections": ServerIcon,
  "/settings/access": ShieldCheckIcon,
  "/settings/secrets": KeyRoundIcon,
  "/settings/maintenance": WrenchIcon,
  "/settings/labs": FlaskConicalIcon,
  "/settings/about": InfoIcon,
  "/settings/archived": ArchiveIcon,
};

// Detail pages without a nav entry highlight the page that links to them.
const SETTINGS_DETAIL_PAGE_PARENTS: Readonly<Record<string, SettingsPath>> = {
  "/settings/diagnostics": "/settings/maintenance",
  "/settings/open-source-licenses": "/settings/about",
};

interface SettingsNavItem {
  label: string;
  to: SettingsPath;
  icon: ComponentType<{ className?: string }>;
  /** A module group's Keybindings link: opens the page with the module's chip selected. */
  keybindingsApp?: string;
}

const UPSTREAM_SETTINGS_ORDER = SETTINGS_NAV_GROUPS.flatMap((group) => group.paths);

const navItem = (to: SettingsPath): SettingsNavItem => ({
  to,
  label: OTTERWARE_SETTINGS_NAV_LABELS[to] ?? SETTINGS_SECTION_LABELS[to],
  icon: SETTINGS_SECTION_ICONS[to],
});

/** The sidebar's sections: one flat list, or App, Code and a group per module that is on. */
function useSettingsNavGroups() {
  const onModuleIds = useOnModuleIds();
  return (() =>
    settingsNavLayout({ upstreamOrder: UPSTREAM_SETTINGS_ORDER, onModuleIds }).map((group) => ({
      id: group.id,
      label: group.label,
      keybindingsApp: group.keybindingsApp,
      items: [
        ...(group.paths as ReadonlyArray<SettingsPath>)
          .filter((to) => isProfileSettingsPathVisible(to))
          .map(navItem),
        ...(group.keybindingsApp === undefined
          ? []
          : [{ ...navItem("/settings/keybindings"), keybindingsApp: group.keybindingsApp }]),
      ],
    })))();
}

function SettingsSectionIcon({ to }: { to: SettingsPath }) {
  const Icon = SETTINGS_SECTION_ICONS[to];
  return <Icon className="size-4 shrink-0 text-(--sidebar-icon-color)" />;
}

export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navArea = workspaceAreaProps("settings-nav", 0, "Settings sections");
  const navigate = useNavigate();
  const currentHash = useLocation({ select: (location) => location.hash });
  const currentSearch = useLocation({ select: (location) => location.search });
  const scopeSearch = (() => validateSettingsScopeSearch(currentSearch))();
  const navGroups = useSettingsNavGroups();
  const keybindingsChip = useKeybindingsChip();
  const isNavItemVisible = (item: SettingsNavItem) =>
    // Browser extensions run in the desktop app's browser only.
    item.to !== "/settings/extensions" || window.desktopBridge?.previewExtensions;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  // Below md the nav is an icon rail; searching expands it over the page.
  const [compactSearchOpen, setCompactSearchOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const searchableItems = useAvailableSettingsSearchItems(scopeSearch);
  const results = (() => searchSettings(query, searchableItems))();
  const isSearching = query.trim().length > 0;
  const hasResults = results.length > 0;

  const lastResultIndex = Math.max(results.length - 1, 0);
  if (activeResultIndex > lastResultIndex) setActiveResultIndex(lastResultIndex);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- scrolls the active search result's DOM node into view
  useEffect(() => {
    const result = results[activeResultIndex];
    if (!result) return;
    document
      .getElementById(`settings-search-result-${result.id}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeResultIndex, results]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window keydown listener for the find and slash search shortcuts
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const isFindShortcut =
        event.key.toLowerCase() === "f" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey;
      const isSlashShortcut =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!isFindShortcut && !isSlashShortcut) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        ((isSlashShortcut &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)) ||
          // Preserve dialog and popup focus traps, and let shortcut recorders
          // capture the keypress without moving focus into the sidebar search.
          target.closest(
            '[role="dialog"]:not([data-app-modal]), [aria-modal="true"]:not([data-app-modal]), [data-slot$="popup"]:not([data-app-modal]), [data-keybinding-capture]',
          ) !== null)
      ) {
        return;
      }

      event.preventDefault();
      setCompactSearchOpen(true);
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- focuses the search input DOM node after the compact search opens
  useEffect(() => {
    if (compactSearchOpen) searchInputRef.current?.focus();
  }, [compactSearchOpen]);

  const handleSectionClick = (item: SettingsNavItem) => {
    if (item.to === "/settings/keybindings") setKeybindingsChip(item.keybindingsApp ?? "all");
    void navigate({
      href: item.to,
      hash: "",
      replace: true,
      hashScrollIntoView: false,
    });
  };
  const clearSearch = () => {
    setQuery("");
    setActiveResultIndex(0);
  };
  const handleSearchResultClick = (item: SettingsSearchItem) => {
    clearSearch();
    setCompactSearchOpen(false);
    const targetId = item.targetId ?? item.id;
    if (pathname === item.to && currentHash.replace(/^#/, "") === targetId) {
      scrollToSettingsTarget(targetId);
      return;
    }
    void navigate({
      href: item.to,
      hash: targetId,
      replace: true,
      hashScrollIntoView: false,
      state: { settingsTargetHighlight: true },
    });
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && isSearching) {
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((index) => (index + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex((index) => (index - 1 + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeResultIndex];
      if (result) handleSearchResultClick(result);
    }
  };
  return (
    <nav
      {...navArea}
      role="navigation"
      className={cn(
        "flex w-60 shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground max-md:w-14",
        compactSearchOpen &&
          "max-md:absolute max-md:inset-y-0 max-md:start-0 max-md:z-10 max-md:w-full",
      )}
    >
      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup>
          <div className="flex flex-col gap-2">
            <div
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
                !compactSearchOpen && "max-md:hidden",
              )}
            >
              <SearchIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
              <SidebarInput
                ref={searchInputRef}
                nativeInput
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveResultIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => setCompactSearchOpen(true)}
                onBlur={() => {
                  if (!isSearching) setCompactSearchOpen(false);
                }}
                placeholder="Search"
                aria-label="Search settings"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSearching && hasResults}
                aria-controls={isSearching && hasResults ? "settings-search-results" : undefined}
                aria-activedescendant={
                  isSearching && results[activeResultIndex]
                    ? `settings-search-result-${results[activeResultIndex].id}`
                    : undefined
                }
                className="min-w-0 flex-1"
              />
              {isSearching ? (
                <Button
                  type="button"
                  size="icon-micro"
                  variant="ghost-muted"
                  className="shrink-0"
                  aria-label="Clear settings search"
                  onClick={() => {
                    clearSearch();
                    searchInputRef.current?.focus();
                  }}
                >
                  <XIcon className="size-3" />
                </Button>
              ) : (
                <Kbd>/</Kbd>
              )}
            </div>
            {isSearching && results.length === 0 ? (
              <p
                role="status"
                className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground"
              >
                No settings found
              </p>
            ) : null}
            {isSearching ? (
              <SidebarMenu
                id={hasResults ? "settings-search-results" : undefined}
                role={hasResults ? "listbox" : undefined}
                aria-label={hasResults ? "Settings search results" : undefined}
              >
                {results.map((item, index) => (
                  <SidebarMenuItem key={item.id} role="presentation">
                    <SidebarMenuButton
                      id={`settings-search-result-${item.id}`}
                      role="option"
                      aria-selected={index === activeResultIndex}
                      tabIndex={-1}
                      size="sm"
                      isActive={index === activeResultIndex}
                      className="h-auto min-h-10 items-start"
                      onMouseMove={() => setActiveResultIndex(index)}
                      onClick={() => handleSearchResultClick(item)}
                    >
                      <SettingsSectionIcon to={item.to} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-sidebar-foreground">
                          {item.title}
                        </span>
                        <span className="block truncate text-2xs text-sidebar-muted-foreground/75">
                          {SETTINGS_SECTION_LABELS[item.to]}
                        </span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : (
              <>
                {compactSearchOpen ? null : (
                  <SidebarMenu className="md:hidden">
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        aria-label="Search settings"
                        onClick={() => setCompactSearchOpen(true)}
                      >
                        <SearchIcon />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                )}
                {navGroups.map((group) => (
                  <SidebarMenu key={group.id} aria-label={group.label ?? undefined}>
                    {group.label ? (
                      <li className="px-2 pt-3 pb-1 text-2xs font-medium tracking-wide text-sidebar-muted-foreground/70 uppercase">
                        {group.label}
                      </li>
                    ) : null}
                    {group.items.filter(isNavItemVisible).map((item) => {
                      const Icon = item.icon;
                      const activePath = SETTINGS_DETAIL_PAGE_PARENTS[pathname] ?? pathname;
                      // A module group's Keybindings link lights up only with its chip.
                      const chipMatches =
                        item.to !== "/settings/keybindings" ||
                        (item.keybindingsApp ?? "all") === keybindingsChip ||
                        (item.keybindingsApp === undefined &&
                          !navGroups.some((entry) => entry.keybindingsApp === keybindingsChip));
                      const isActive =
                        (activePath === item.to || activePath.startsWith(`${item.to}/`)) &&
                        chipMatches;
                      return (
                        <SidebarMenuItem key={`${item.to}:${item.keybindingsApp ?? ""}`}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => handleSectionClick(item)}
                          >
                            <Icon />
                            <span
                              className={cn("truncate", !compactSearchOpen && "max-md:sr-only")}
                            >
                              {item.label}
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                ))}
              </>
            )}
          </div>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="max-md:hidden">
        <Suspense fallback={null}>
          <T3ConnectSidebarSignIn />
        </Suspense>
        <Suspense fallback={null}>
          <T3ConnectSidebarAvatar />
        </Suspense>
      </SidebarFooter>
    </nav>
  );
}
