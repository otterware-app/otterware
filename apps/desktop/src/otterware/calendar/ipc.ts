import { CalendarError, CalendarReminderNotification } from "@otterware/calendar-contracts";
import {
  CALENDAR_DESKTOP_CHANNELS,
  calendarReminderBody,
} from "@otterware/calendar-contracts/desktop";
import {
  receiveGoogleAuthCallback,
  cancelGoogleAuthCallback,
  cancelAllGoogleAuthCallbacks,
} from "@otterware/calendar-node/desktop";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Notification } from "electron";
import * as DesktopIpc from "../../ipc/DesktopIpc.ts";
import * as ElectronShell from "../../electron/ElectronShell.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";

const notifications = new Map<string, Notification>();
const Request = Schema.String.check(Schema.isMaxLength(16384));
const callbackError = (cause: unknown) =>
  new CalendarError({
    code: "unavailable",
    detail:
      cause instanceof Error ? cause.message : "Could not receive Google sign-in on this computer.",
  });
const receive = DesktopIpc.makeIpcMethod({
  channel: CALENDAR_DESKTOP_CHANNELS.receiveGoogleCallback,
  payload: Request,
  result: Schema.String,
  handler: Effect.fn("calendar.desktop.receiveGoogleCallback")(function* (authorizationUrl) {
    const shell = yield* ElectronShell.ElectronShell;
    const context = yield* Effect.context<ElectronShell.ElectronShell>();
    const run = Effect.runPromiseWith(context);
    const callback = yield* Effect.tryPromise({
      try: (signal) =>
        receiveGoogleAuthCallback(authorizationUrl, (url) => run(shell.openExternal(url)), signal),
      catch: callbackError,
    });
    const windows = yield* ElectronWindow.ElectronWindow;
    const window = yield* windows.currentMainOrFirst;
    if (Option.isSome(window)) yield* windows.reveal(window.value);
    return callback;
  }),
});
const cancel = DesktopIpc.makeIpcMethod({
  channel: CALENDAR_DESKTOP_CHANNELS.cancelGoogleCallback,
  payload: Request,
  result: Schema.Void,
  handler: (url) => Effect.try({ try: () => cancelGoogleAuthCallback(url), catch: callbackError }),
});
const showReminder = DesktopIpc.makeIpcMethod({
  channel: CALENDAR_DESKTOP_CHANNELS.showReminder,
  payload: Schema.Struct({ environmentId: Schema.String, reminder: CalendarReminderNotification }),
  result: Schema.Boolean,
  handler: Effect.fn("calendar.desktop.showReminder")(function* (input) {
    if (!Notification.isSupported()) return false;
    const windows = yield* ElectronWindow.ElectronWindow;
    const context = yield* Effect.context<ElectronWindow.ElectronWindow>();
    const run = Effect.runPromiseWith(context);
    const notification = new Notification({
      title: input.reminder.title || "Calendar event",
      body: calendarReminderBody(input.reminder),
    });
    notification.on("click", () => {
      void run(
        Effect.gen(function* () {
          const window = yield* windows.currentMainOrFirst;
          if (Option.isSome(window)) {
            yield* windows.reveal(window.value);
            window.value.webContents.send(CALENDAR_DESKTOP_CHANNELS.openReminder, input);
          }
        }),
      );
    });
    const key = `${input.environmentId}/${input.reminder.key}`;
    notifications.get(key)?.close();
    notifications.set(key, notification);
    notification.once("close", () => {
      if (notifications.get(key) === notification) notifications.delete(key);
    });
    if (notifications.size > 64) notifications.values().next().value?.close();
    notification.show();
    return true;
  }),
});

/** Called from the desktop registry seam; listeners and callbacks follow its scope. */
export const installCalendarDesktop = Effect.gen(function* () {
  const ipc = yield* DesktopIpc.DesktopIpc;
  yield* ipc.handle(receive);
  yield* ipc.handle(cancel);
  yield* ipc.handle(showReminder);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      cancelAllGoogleAuthCallbacks();
      for (const notification of notifications.values()) notification.close();
      notifications.clear();
    }),
  );
});
