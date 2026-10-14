import {
  CALENDAR_DESKTOP_CHANNELS,
  type CalendarDesktopBridge,
  type CalendarDesktopReminder,
} from "@otterware/calendar-contracts/desktop";
import { contextBridge, ipcRenderer } from "electron";

/** The module bridge stays separate from upstream Code's DesktopBridge. */
export function exposeCalendarBridge() {
  const bridge: CalendarDesktopBridge = {
    receiveGoogleCallback: (url) =>
      ipcRenderer.invoke(CALENDAR_DESKTOP_CHANNELS.receiveGoogleCallback, url),
    cancelGoogleCallback: (url) =>
      ipcRenderer.invoke(CALENDAR_DESKTOP_CHANNELS.cancelGoogleCallback, url),
    showReminder: (input) => ipcRenderer.invoke(CALENDAR_DESKTOP_CHANNELS.showReminder, input),
    onOpenReminder: (listener) => {
      const handler = (_event: unknown, input: CalendarDesktopReminder) => listener(input);
      ipcRenderer.on(CALENDAR_DESKTOP_CHANNELS.openReminder, handler);
      return () => ipcRenderer.removeListener(CALENDAR_DESKTOP_CHANNELS.openReminder, handler);
    },
  };
  contextBridge.exposeInMainWorld("calendarBridge", bridge);
}
