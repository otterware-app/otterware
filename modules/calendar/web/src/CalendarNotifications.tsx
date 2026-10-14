import "./calendar.css";
import { useEffect, useState, type ReactNode } from "react";
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
  const [reminders, setReminders] = useState<CalendarReminderNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      client.watchNotifications(
        (reminder) => {
          const key = `${client.environmentId}/${reminder.key}`;
          if (seen.has(key)) return;
          seen.set(key, reminder.deliveredAt);
          if (seen.size > 256) seen.delete(seen.keys().next().value!);
          setReminders((previous) => [reminder, ...previous].slice(0, 5));
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
  return (
    <>
      {children}
      <aside
        className="calendar-reminder-center"
        aria-label="Calendar reminders"
        aria-live="polite"
      >
        {reminders.map((reminder) => (
          <div key={reminder.key}>
            <a href={eventPath(reminder)}>
              <strong>{reminder.title || "Calendar event"}</strong>
              <span>{calendarReminderBody(reminder)}</span>
            </a>
            <button
              type="button"
              aria-label={`Dismiss reminder for ${reminder.title}`}
              onClick={() =>
                setReminders((previous) => previous.filter((item) => item.key !== reminder.key))
              }
            >
              ×
            </button>
          </div>
        ))}
        {error && <p role="status">{error}</p>}
      </aside>
    </>
  );
}
function eventPath(reminder: CalendarReminderNotification) {
  return `/calendar?${new URLSearchParams({ calendar: reminder.calendarId, event: reminder.eventId })}`;
}
