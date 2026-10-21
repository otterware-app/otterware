import { createCalendarWebModule } from "@otterware/composition/web";
import {
  CalendarDaysIcon,
  CalendarRangeIcon,
  CalendarIcon,
  SquareIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UndoIcon,
  RedoIcon,
} from "lucide-react";
import { lazy } from "react";
import { useLocation } from "@tanstack/react-router";
import type {
  ModuleHeaderAction,
  ModuleSidebarSection,
  WebModuleCommand,
  WebModuleSettingsPage,
} from "@otterware/module-kit/web";
import { useCalendarStore, runCalendarCommand } from "./ui/calendarStore";
import { toastManager } from "../../components/ui/toast";

const settingsPages = [
  {
    id: "general",
    label: "General",
    placement: "page",
    rows: [
      "Week starts on",
      "Show weekends",
      "Custom view",
      "Working hours",
      "Default length",
      "New events go to",
      "Show declined events",
      "Time zone",
      "Reminders",
    ],
  },
  {
    id: "calendars",
    label: "Calendars",
    placement: "page",
    rows: ["Accounts", "Color", "Visibility", "Watch only", "Sync window"],
  },
  { id: "time", label: "Time", placement: "general", rows: ["Time format"] },
] as const;

const commands: WebModuleCommand[] = [
  ["today", "Today", "t"],
  ["day", "Day view", "d"],
  ["week", "Week view", "w"],
  ["month", "Month view", "m"],
  ["custom", "Custom days", "x"],
  ["agenda", "Agenda view", "a"],
  ["next", "Next period", "j"],
  ["previous", "Previous period", "k"],
  ["create", "Create event", "c"],
  ["search", "Search events", "/"],
  ["goToDate", "Go to date", "g"],
  ["undo", "Undo", "mod+z"],
  ["redo", "Redo", "mod+shift+z"],
  ["close", "Close event", "escape"],
].map(([id, title, key]) => ({
  id: `calendar.${id}`,
  title: `Calendar: ${title}`,
  searchTerms: [title!],
  defaultKey: key!,
  when: "!editableFocus",
  run: () => runCalendarCommand(id!),
}));

function useSpaces() {
  const customDays = useCalendarStore((state) =>
    state.environment
      ? (state.caches[state.environment]?.directory?.preferences.customDays ?? 4)
      : 4,
  );
  return [
    { id: "day", label: "Day", icon: SquareIcon, href: "/calendar/day" },
    { id: "week", label: "Week", icon: CalendarRangeIcon, href: "/calendar/week" },
    { id: "month", label: "Month", icon: CalendarIcon, href: "/calendar/month" },
    { id: "agenda", label: "Agenda", icon: ListIcon, href: "/calendar/agenda" },
    {
      id: "custom",
      label: `${customDays} days`,
      icon: CalendarRangeIcon,
      href: "/calendar/custom",
    },
  ];
}
function useSidebar(): readonly ModuleSidebarSection[] {
  const state = useCalendarStore();
  const directory = state.environment ? state.caches[state.environment]?.directory : null;
  const change = (input: Parameters<NonNullable<typeof state.transport>["calendar"]>[0]) => {
    if (!state.canWrite) return;
    void state.transport?.calendar(input).catch((error: unknown) =>
      toastManager.add({
        type: "error",
        title: "Calendar could not save",
        description: String(error),
      }),
    );
  };
  return (
    directory?.accounts.map((account) => ({
      id: account.accountId,
      title: account.email,
      rows: directory.calendars
        .filter((calendar) => calendar.accountId === account.accountId)
        .map((calendar) => ({
          id: calendar.calendarId,
          label: calendar.name,
          active: calendar.visible,
          icon: (
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: calendar.color, opacity: calendar.visible ? 1 : 0.3 }}
            />
          ),
          detail: calendar.watchOnly ? "Watch only" : calendar.visible ? "" : "Hidden",
          href: `/calendar?calendar=${encodeURIComponent(calendar.calendarId)}`,
          onSelect: () => change({ calendarId: calendar.calendarId, visible: !calendar.visible }),
          actions: state.canWrite
            ? [
                {
                  id: "visibility",
                  label: calendar.visible ? "Hide" : "Show",
                  onSelect: () =>
                    change({ calendarId: calendar.calendarId, visible: !calendar.visible }),
                },
                {
                  id: "watch-only",
                  label: calendar.watchOnly ? "Stop watching only" : "Watch only",
                  onSelect: () =>
                    change({ calendarId: calendar.calendarId, watchOnly: !calendar.watchOnly }),
                },
              ]
            : [],
        })),
    })) ?? [
      {
        id: "calendars",
        title: "Calendars",
        rows: [],
        empty: state.error ?? "Link a Google account to see its calendars.",
      },
    ]
  );
}
function useHeaderActions(): readonly ModuleHeaderAction[] {
  const canWrite = useCalendarStore((state) => state.canWrite);
  return [
    {
      id: "today",
      label: "Today",
      icon: CalendarDaysIcon,
      onSelect: () => runCalendarCommand("today"),
    },
    {
      id: "previous",
      label: "Previous",
      icon: ChevronLeftIcon,
      onSelect: () => runCalendarCommand("previous"),
    },
    {
      id: "next",
      label: "Next",
      icon: ChevronRightIcon,
      onSelect: () => runCalendarCommand("next"),
    },
    {
      id: "goToDate",
      label: "Go to date",
      icon: CalendarRangeIcon,
      onSelect: () => runCalendarCommand("goToDate"),
    },
    {
      id: "search",
      label: "Search",
      icon: SearchIcon,
      onSelect: () => runCalendarCommand("search"),
    },
    {
      id: "undo",
      label: "Undo",
      icon: UndoIcon,
      disabled: !canWrite,
      onSelect: () => runCalendarCommand("undo"),
    },
    {
      id: "redo",
      label: "Redo",
      icon: RedoIcon,
      disabled: !canWrite,
      onSelect: () => runCalendarCommand("redo"),
    },
    {
      id: "create",
      label: "New event",
      icon: PlusIcon,
      emphasis: "primary",
      disabled: !canWrite,
      onSelect: () => runCalendarCommand("create"),
    },
  ];
}
export const CalendarWebModule = createCalendarWebModule({
  useSpaces,
  useSidebar,
  useHeaderActions,
  commands,
  stores: [{ id: "calendar.data", runtime: lazy(() => import("./CalendarBackgroundRuntime")) }],
  page: lazy(async () => {
    const [{ default: CalendarPage }, { CalendarEnvironmentProvider }] = await Promise.all([
      import("./ui/CalendarPage"),
      import("./rpc"),
    ]);
    return {
      default: (props) => {
        const search = useLocation({ select: (location) => location.searchStr });
        return (
          <CalendarEnvironmentProvider>
            <CalendarPage {...props} search={search} />
          </CalendarEnvironmentProvider>
        );
      },
    };
  }),
  settings: settingsPages.map((page): WebModuleSettingsPage => ({
    id: page.id,
    label: page.label,
    icon: CalendarDaysIcon,
    searchTerms: page.rows,
    placement: { grouped: page.placement, standalone: page.placement },
    rows: (page.id === "calendars" ? [] : page.rows).map((title) => ({
      id:
        (
          {
            "Week starts on": "calendar-week-start",
            "Show weekends": "calendar-weekends",
            "Custom view": "calendar-custom-days",
            "Default length": "calendar-default-length",
            "New events go to": "calendar-default-calendar",
            "Show declined events": "calendar-declined",
            "Time format": "calendar-hour-format",
          } as Record<string, string>
        )[title] ?? `calendar-${title.toLowerCase().replaceAll(" ", "-")}`,
      title,
    })),
    component: lazy(async () => {
      const [{ default: CalendarSettings }, { CalendarEnvironmentProvider }] = await Promise.all([
        import("./ui/CalendarSettings"),
        import("./rpc"),
      ]);
      return {
        default: () => (
          <CalendarEnvironmentProvider>
            <CalendarSettings page={page.id} />
          </CalendarEnvironmentProvider>
        ),
      };
    }),
  })),
});
