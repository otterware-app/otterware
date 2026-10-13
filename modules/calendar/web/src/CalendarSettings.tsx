import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CALENDAR_SHORTCUTS,
  type CalendarId,
  type GoogleConnectState,
} from "@otterware/calendar-contracts";
import { useCalendarClient, useCalendarDirectory } from "./host.tsx";
import {
  calendarDesktopBridge,
  CALENDAR_NOTIFICATION_DEVICE_KEY,
} from "./CalendarNotifications.tsx";
import "./calendar.css";

export default function CalendarSettings() {
  const client = useCalendarClient();
  const { directory, error: directoryError, canWrite } = useCalendarDirectory();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [flow, setFlow] = useState<GoogleConnectState | null>(null);
  const [callback, setCallback] = useState("");
  const callbackAuthorization = useRef<string | null>(null);
  const [deviceNotifications, setDeviceNotifications] = useState(
    () => localStorage.getItem(CALENDAR_NOTIFICATION_DEVICE_KEY) === "true",
  );
  const cancelFlow = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelFlow.current?.(), []);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Calendar could not save that setting.");
    } finally {
      setBusy(false);
    }
  };
  const connect = (source?: "account" | "local") => {
    cancelFlow.current?.();
    setError(null);
    setFlow(null);
    const cancel = client.connect(
      { ...(source ? { source } : {}), returnTo: window.location.href },
      (state) => {
        setFlow(state);
        const desktop = calendarDesktopBridge();
        if (state._tag === "waiting" && !state.flowId.startsWith("cloud:") && desktop) {
          callbackAuthorization.current = state.authorizationUrl;
          void desktop
            .receiveGoogleCallback(state.authorizationUrl)
            .then((callbackUrl) => {
              if (callbackAuthorization.current === state.authorizationUrl)
                return client.completeConnect(state.flowId, callbackUrl);
            })
            .catch((cause) => {
              if (callbackAuthorization.current === state.authorizationUrl)
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Open the sign-in link or paste its callback address.",
                );
            });
        }
      },
      (message) => {
        setError(message);
        cancelFlow.current?.();
      },
    );
    cancelFlow.current = () => {
      cancel();
      const url = callbackAuthorization.current;
      callbackAuthorization.current = null;
      if (url)
        void calendarDesktopBridge()
          ?.cancelGoogleCallback(url)
          .catch(() => undefined);
    };
  };
  return (
    <div className="calendar-module">
      <main className="calendar-settings">
        <h1>Calendar settings</h1>
        {(error ?? directoryError) && (
          <p role="alert" className="calendar-error">
            {error ?? directoryError}
          </p>
        )}
        <section>
          <h2>Google accounts</h2>
          {directory?.accounts.map((account) => (
            <div className="calendar-settings-row" key={account.accountId}>
              <span>
                {account.email} · {account.status}
              </span>
              <button
                type="button"
                disabled={!canWrite || busy}
                onClick={() => void run(() => client.removeAccount(account.accountId))}
              >
                Disconnect
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={!canWrite || busy || !directory?.google.configured}
            onClick={() => connect()}
          >
            Connect Google account
          </button>
          {flow?._tag === "waiting" && (
            <div>
              <p>
                {flow.flowId.startsWith("cloud:")
                  ? "Google will connect through your Otter Account. Return here after signing in."
                  : "Open Google sign-in. If the browser is on another machine, paste its final loopback address here."}
              </p>
              <a href={flow.authorizationUrl} target="_blank" rel="noreferrer">
                Open Google sign-in
              </a>
              {!flow.flowId.startsWith("cloud:") && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() => client.completeConnect(flow.flowId, callback));
                  }}
                >
                  <label>
                    Callback address
                    <input
                      value={callback}
                      onChange={(event) => setCallback(event.target.value)}
                      required
                    />
                  </label>
                  <button type="submit" disabled={!canWrite || busy}>
                    Finish connection
                  </button>
                </form>
              )}
            </div>
          )}
          {flow?._tag === "succeeded" && <p role="status">Connected {flow.email}.</p>}
          {flow?._tag === "failed" && <p role="alert">{flow.message}</p>}
          {flow && (
            <button
              type="button"
              onClick={() => {
                cancelFlow.current?.();
                cancelFlow.current = null;
                setFlow(null);
              }}
            >
              Close sign-in
            </button>
          )}
        </section>
        <section>
          <h2>Local Google connection</h2>
          <button type="button" disabled={!canWrite || busy} onClick={() => connect("local")}>
            Connect with local PKCE
          </button>
          <p>Use a Google Desktop app OAuth client for accounts connected to this environment.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await client.setClient({ clientId, clientSecret });
                setClientSecret("");
              });
            }}
          >
            <label>
              Client ID
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <label>
              Client secret
              <input
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button type="submit" disabled={!canWrite || busy}>
              Save client
            </button>{" "}
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() => void run(client.clearClient)}
            >
              Clear client
            </button>
          </form>
        </section>
        {directory && (
          <section>
            <h2>Preferences · Account</h2>
            <label>
              Custom view days
              <input
                key={directory.preferences.customDays}
                type="number"
                min={2}
                max={14}
                defaultValue={directory.preferences.customDays}
                disabled={!canWrite || busy}
                onBlur={(event) => {
                  const customDays = Number(event.target.value);
                  if (customDays !== directory.preferences.customDays)
                    void run(() => client.preferences({ customDays }));
                }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={directory.preferences.showWeekends}
                disabled={!canWrite || busy}
                onChange={(event) =>
                  void run(() => client.preferences({ showWeekends: event.target.checked }))
                }
              />
              Show weekends
            </label>
            <label>
              <input
                type="checkbox"
                checked={directory.preferences.showDeclined}
                disabled={!canWrite || busy}
                onChange={(event) =>
                  void run(() => client.preferences({ showDeclined: event.target.checked }))
                }
              />
              Show declined events
            </label>
            <div className="calendar-field-pair">
              {(["start", "end"] as const).map((part) => (
                <label key={part}>
                  Working hours {part}
                  <input
                    key={directory.preferences.workingHours[part]}
                    type="time"
                    disabled={!canWrite || busy}
                    defaultValue={`${String(Math.floor(directory.preferences.workingHours[part] / 60)).padStart(2, "0")}:${String(directory.preferences.workingHours[part] % 60).padStart(2, "0")}`}
                    onBlur={(event) => {
                      const [hour, minute] = event.target.value.split(":").map(Number);
                      if (hour !== undefined && minute !== undefined)
                        void run(() =>
                          client.preferences({
                            workingHours: {
                              ...directory.preferences.workingHours,
                              [part]: hour * 60 + minute,
                            },
                          }),
                        );
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="calendar-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    disabled={!canWrite || busy}
                    checked={directory.preferences.workingHours.days.includes(index)}
                    onChange={(event) =>
                      void run(() =>
                        client.preferences({
                          workingHours: {
                            ...directory.preferences.workingHours,
                            days: event.target.checked
                              ? [...directory.preferences.workingHours.days, index]
                              : directory.preferences.workingHours.days.filter(
                                  (value) => value !== index,
                                ),
                          },
                        }),
                      )
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
            <label>
              Default calendar
              <select
                disabled={!canWrite || busy}
                value={directory.preferences.defaultCalendarId ?? ""}
                onChange={(event) =>
                  void run(() =>
                    client.preferences({
                      defaultCalendarId: event.target.value
                        ? (event.target.value as CalendarId)
                        : null,
                    }),
                  )
                }
              >
                <option value="">First writable calendar</option>
                {directory.calendars
                  .filter(
                    (calendar) =>
                      calendar.accessRole === "owner" || calendar.accessRole === "writer",
                  )
                  .map((calendar) => (
                    <option key={calendar.calendarId} value={calendar.calendarId}>
                      {calendar.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Week starts on
              <select
                disabled={!canWrite || busy}
                value={directory.preferences.weekStartsOn}
                onChange={(event) =>
                  void run(() => client.preferences({ weekStartsOn: Number(event.target.value) }))
                }
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={6}>Saturday</option>
              </select>
            </label>
            <label>
              Time zone
              <input
                key={directory.preferences.timeZone}
                defaultValue={directory.preferences.timeZone ?? ""}
                placeholder="Follow this device"
                disabled={!canWrite || busy}
                onBlur={(event) => {
                  const timeZone = event.target.value.trim() || null;
                  if (timeZone !== directory.preferences.timeZone)
                    void run(() => client.preferences({ timeZone }));
                }}
              />
            </label>
            <label>
              Hour format
              <select
                disabled={!canWrite || busy}
                value={directory.preferences.hourFormat}
                onChange={(event) =>
                  void run(() =>
                    client.preferences({
                      hourFormat: event.target.value as "12" | "24" | "locale",
                    }),
                  )
                }
              >
                <option value="locale">Automatic</option>
                <option value="12">12-hour</option>
                <option value="24">24-hour</option>
              </select>
            </label>
            <label>
              Default event length (minutes)
              <input
                type="number"
                min={5}
                max={1440}
                key={directory.preferences.defaultEventMinutes}
                defaultValue={directory.preferences.defaultEventMinutes}
                disabled={!canWrite || busy}
                onBlur={(event) => {
                  const minutes = Number(event.target.value);
                  if (minutes !== directory.preferences.defaultEventMinutes)
                    void run(() => client.preferences({ defaultEventMinutes: minutes }));
                }}
              />
            </label>
          </section>
        )}
        {directory && (
          <section>
            <h2>Calendar colors · Account</h2>
            {directory.calendars.map((calendar) => (
              <label className="calendar-settings-row" key={calendar.calendarId}>
                <input
                  key={calendar.color}
                  type="color"
                  defaultValue={calendar.color}
                  disabled={!canWrite || busy}
                  aria-label={`Color for ${calendar.name}`}
                  onBlur={(event) => {
                    if (event.target.value !== calendar.color)
                      void run(() =>
                        client.calendar({
                          calendarId: calendar.calendarId,
                          color: event.target.value,
                        }),
                      );
                  }}
                />
                {calendar.name}
              </label>
            ))}
          </section>
        )}
        {directory && (
          <section>
            <h2>Event reminders · Account</h2>
            <p>
              Default popup reminders for new events and local reminders for upcoming events.
              Per-event overrides take priority.
            </p>
            {directory.preferences.notificationRules.map((rule, index) => (
              <div className="calendar-settings-row" key={`${index}/${rule.minutesBefore}`}>
                <label>
                  <input
                    type="checkbox"
                    disabled={!canWrite || busy}
                    checked={rule.enabled}
                    onChange={(event) =>
                      void run(() =>
                        client.preferences({
                          notificationRules: directory.preferences.notificationRules.map(
                            (item, i) =>
                              i === index ? { ...item, enabled: event.target.checked } : item,
                          ),
                        }),
                      )
                    }
                  />
                  Enabled
                </label>
                <label>
                  Minutes before
                  <input
                    type="number"
                    min={0}
                    max={40320}
                    defaultValue={rule.minutesBefore}
                    disabled={!canWrite || busy}
                    onBlur={(event) => {
                      const minutesBefore = Number(event.target.value);
                      if (minutesBefore !== rule.minutesBefore)
                        void run(() =>
                          client.preferences({
                            notificationRules: directory.preferences.notificationRules.map(
                              (item, i) => (i === index ? { ...item, minutesBefore } : item),
                            ),
                          }),
                        );
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() =>
                    void run(() =>
                      client.preferences({
                        notificationRules: directory.preferences.notificationRules.filter(
                          (_, i) => i !== index,
                        ),
                      }),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={!canWrite || busy || directory.preferences.notificationRules.length >= 5}
              onClick={() =>
                void run(() =>
                  client.preferences({
                    notificationRules: [
                      ...directory.preferences.notificationRules,
                      { minutesBefore: 10, enabled: true },
                    ],
                  }),
                )
              }
            >
              Add reminder
            </button>
            <label>
              <input
                type="checkbox"
                checked={deviceNotifications}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  void run(async () => {
                    if (enabled && !calendarDesktopBridge()) {
                      if (typeof Notification === "undefined")
                        throw new Error("This browser does not support notifications.");
                      if ((await Notification.requestPermission()) !== "granted")
                        throw new Error(
                          "Allow notifications in this browser's settings to receive reminders.",
                        );
                    }
                    localStorage.setItem(CALENDAR_NOTIFICATION_DEVICE_KEY, String(enabled));
                    setDeviceNotifications(enabled);
                  });
                }}
              />
              System notifications on this device
            </label>
          </section>
        )}
        {directory && (
          <section>
            <h2>Keyboard shortcuts · Account</h2>
            <p>
              Use a key such as a or a combination such as Mod+Shift+2. Mod means Command or
              Control. Leave a binding blank to disable it.
            </p>
            {Object.entries(directory.preferences.shortcuts).map(([action, binding]) => (
              <label key={action}>
                {action}
                <input
                  key={binding}
                  defaultValue={binding}
                  disabled={!canWrite || busy}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value !== binding)
                      void run(() =>
                        client.preferences({
                          shortcuts: { ...directory.preferences.shortcuts, [action]: value },
                        }),
                      );
                  }}
                />
              </label>
            ))}
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() =>
                void run(() => client.preferences({ shortcuts: DEFAULT_CALENDAR_SHORTCUTS }))
              }
            >
              Reset shortcuts
            </button>
          </section>
        )}
        {directory && (
          <section>
            <h2>Sync window · Environment</h2>
            <p>
              The environment stores its own calendar cache. Weeks you open beyond this window are
              loaded as needed.
            </p>
            <label>
              Past weeks
              <input
                type="number"
                min={1}
                max={104}
                defaultValue={directory.environmentPreferences.syncWindow.pastWeeks}
                disabled={!canWrite || busy}
                onBlur={(event) => {
                  const pastWeeks = Number(event.target.value);
                  if (pastWeeks !== directory.environmentPreferences.syncWindow.pastWeeks)
                    void run(() =>
                      client.environmentPreferences({
                        syncWindow: { ...directory.environmentPreferences.syncWindow, pastWeeks },
                      }),
                    );
                }}
              />
            </label>
            <label>
              Future weeks
              <input
                type="number"
                min={1}
                max={156}
                defaultValue={directory.environmentPreferences.syncWindow.futureWeeks}
                disabled={!canWrite || busy}
                onBlur={(event) => {
                  const futureWeeks = Number(event.target.value);
                  if (futureWeeks !== directory.environmentPreferences.syncWindow.futureWeeks)
                    void run(() =>
                      client.environmentPreferences({
                        syncWindow: { ...directory.environmentPreferences.syncWindow, futureWeeks },
                      }),
                    );
                }}
              />
            </label>
          </section>
        )}
        <section>
          <h2>Demo calendars</h2>
          <p>Try calendar views with local sample events.</p>
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() => void run(client.addDemo)}
          >
            Add demo calendars
          </button>
        </section>
      </main>
    </div>
  );
}
