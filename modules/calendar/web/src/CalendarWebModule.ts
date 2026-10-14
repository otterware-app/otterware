import { defineWebModule } from "@otterware/module-kit/web";
import { CalendarDaysIcon } from "lucide-react";
import { lazy } from "react";

export const CalendarWebModule = defineWebModule({
  id: "calendar",
  label: "Calendar",
  icon: CalendarDaysIcon,
  rail: { position: "start", order: 20 },
  serverModule: "calendar",
  sideChat: true,
  page: lazy(() => import("./CalendarPage.tsx")),
  settings: {
    label: "Calendar",
    icon: CalendarDaysIcon,
    searchTerms: ["calendar", "google", "accounts", "week", "time zone"],
    component: lazy(() => import("./CalendarSettings.tsx")),
  },
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
