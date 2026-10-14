import { defineWebModule, type ModuleSpace } from "@otterware/module-kit/web";
import {
  CalendarDaysIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ListIcon,
  SquareIcon,
} from "lucide-react";
import { lazy } from "react";

/** Calendar's spaces are its views, never individual calendars (ADR 0020). */
export const CALENDAR_VIEW_SPACES: ReadonlyArray<ModuleSpace> = [
  { id: "day", label: "Day", icon: SquareIcon, href: "/calendar/day" },
  { id: "week", label: "Week", icon: CalendarRangeIcon, href: "/calendar/week" },
  { id: "month", label: "Month", icon: CalendarIcon, href: "/calendar/month" },
  { id: "agenda", label: "Agenda", icon: ListIcon, href: "/calendar/agenda" },
];

/**
 * Calendar's registration. The host wraps the page with its environment
 * provider; chunk 3 of the rebuild adds the sidebar rows (calendars, Watch
 * only), header actions and the settings pages per docs/adr/0011.
 */
export const CalendarWebModule = defineWebModule({
  id: "calendar",
  label: "Calendar",
  icon: CalendarDaysIcon,
  serverModule: "calendar",
  sideChat: true,
  page: lazy(() => import("./CalendarPage.tsx")),
  useSpaces: () => CALENDAR_VIEW_SPACES,
  settings: [
    {
      id: "calendar",
      label: "Calendar",
      icon: CalendarDaysIcon,
      searchTerms: ["calendar", "google", "accounts", "week", "time zone"],
      component: lazy(() => import("./CalendarSettings.tsx")),
      placement: { grouped: "page", standalone: "page" },
    },
  ],
  commands: [
    {
      id: "calendar.search",
      title: "Calendar: search events",
      searchTerms: ["search", "find", "event"],
      subpath: "search",
    },
    {
      id: "calendar.agenda",
      title: "Calendar: agenda view",
      searchTerms: ["list", "schedule"],
      subpath: "agenda",
    },
    {
      id: "calendar.day",
      title: "Calendar: day view",
      searchTerms: ["day", "calendar"],
      subpath: "day",
    },
    {
      id: "calendar.custom",
      title: "Calendar: custom days",
      searchTerms: ["custom", "calendar"],
      subpath: "custom",
    },
    {
      id: "calendar.today",
      title: "Calendar: today",
      searchTerms: ["today", "calendar"],
      subpath: "today",
    },
    {
      id: "calendar.week",
      title: "Calendar: week view",
      searchTerms: ["week", "calendar"],
      subpath: "week",
    },
    {
      id: "calendar.month",
      title: "Calendar: month view",
      searchTerms: ["month", "calendar"],
      subpath: "month",
    },
    {
      id: "calendar.create",
      title: "Calendar: create event",
      searchTerms: ["event", "meeting", "calendar"],
      subpath: "new",
    },
  ],
  searchTerms: ["calendar", "events", "meetings", "schedule"],
});
