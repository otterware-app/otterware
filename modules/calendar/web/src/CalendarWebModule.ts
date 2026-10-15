import { defineWebModule, type ModuleSpace, type WebModule } from "@otterware/module-kit/web";
import {
  CalendarDaysIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ListIcon,
  SquareIcon,
} from "lucide-react";

/** Calendar's spaces are its views, never individual calendars (ADR 0020). */
export const CALENDAR_VIEW_SPACES: ReadonlyArray<ModuleSpace> = [
  { id: "day", label: "Day", icon: SquareIcon, href: "/calendar/day" },
  { id: "week", label: "Week", icon: CalendarRangeIcon, href: "/calendar/week" },
  { id: "month", label: "Month", icon: CalendarIcon, href: "/calendar/month" },
  { id: "custom", label: "Custom days", icon: CalendarRangeIcon, href: "/calendar/custom" },
  { id: "agenda", label: "Agenda", icon: ListIcon, href: "/calendar/agenda" },
];

export const createCalendarWebModule = (
  shell: Pick<
    WebModule,
    "page" | "useSpaces" | "useSidebar" | "useHeaderActions" | "stores" | "settings" | "commands"
  >,
) =>
  defineWebModule({
    id: "calendar",
    label: "Calendar",
    icon: CalendarDaysIcon,
    serverModule: "calendar",
    sideChat: true,
    ...shell,
    searchTerms: ["calendar", "events", "meetings", "schedule"],
  });
