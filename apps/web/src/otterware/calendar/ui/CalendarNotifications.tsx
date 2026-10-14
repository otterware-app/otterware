import { toastManager } from "~/components/ui/toast";
import { useEffect, type ReactNode } from "react";
import type { CalendarReminderNotification } from "@otterware/calendar-contracts";
import {
  calendarReminderBody,
  type CalendarDesktopBridge,
} from "@otterware/calendar-contracts/desktop";
import { useCalendarClient } from "./host.tsx";

export const CALENDAR_NOTIFICATION_DEVICE_KEY = "otterware:calendar:notifications-enabled";
const seen = new Map<string, number>();
export function calendarDesktopBridge(): CalendarDesktopBridge | undefined {
  return (window as Window & { calendarBridge?: CalendarDesktopBridge }).calendarBridge;
}
export function CalendarNotifications({ children }: { children: ReactNode }) {
  const client = useCalendarClient();
  const setError = (message: string) => {
    toastManager.add({ type: "error", title: "Calendar reminders", description: message });
  };
  useEffect(
    () =>
      client.watchNotifications(
        (reminder) => {
          const key = `${client.environmentId}/${reminder.key}`;
          if (seen.has(key)) return;
          seen.set(key, reminder.deliveredAt);
          if (seen.size > 256) seen.delete(seen.keys().next().value!);
          toastManager.add({
            title: reminder.title || "Calendar event",
            description: calendarReminderBody(reminder),
            actionProps: {
              children: "Open event",
              onClick: () => window.location.assign(eventPath(reminder)),
            },
          });
          if (localStorage.getItem(CALENDAR_NOTIFICATION_DEVICE_KEY) !== "true") return;
          const desktop = calendarDesktopBridge();
          if (desktop)
            void desktop
              .showReminder({ environmentId: client.environmentId ?? "", reminder })
              .catch((cause) => setError(String(cause)));
          else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const notification = new Notification(reminder.title || "Calendar event", {
              body: calendarReminderBody(reminder),
              tag: key,
            });
            notification.addEventListener("click", () => {
              window.focus();
              window.location.assign(eventPath(reminder));
              notification.close();
            });
          }
        },
        (message) => setError(message),
      ),
    [client],
  );
  useEffect(
    () =>
      calendarDesktopBridge()?.onOpenReminder((input) => {
        if (input.environmentId === client.environmentId)
          window.location.assign(eventPath(input.reminder));
        else
          setError("This reminder belongs to another environment. Connect it to open the event.");
      }),
    [client],
  );
  return children;
}

function eventPath(reminder: CalendarReminderNotification) {
  return `/calendar?${new URLSearchParams({ calendar: reminder.calendarId, event: reminder.eventId })}`;
}
