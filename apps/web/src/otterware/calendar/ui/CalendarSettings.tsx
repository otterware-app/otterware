import type { ComponentProps } from "react";
import {
  SettingsRow,
  SettingsSection as HostSettingsSection,
} from "~/components/settings/settingsLayout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { CalendarSelect } from "./CalendarSelect";
import { useEffect, useRef, useState } from "react";
import { type CalendarId, type GoogleConnectState } from "@otterware/calendar-contracts";
import { useCalendarClient, useCalendarDirectory } from "./host.tsx";
import {
  calendarDesktopBridge,
  CALENDAR_NOTIFICATION_DEVICE_KEY,
} from "./CalendarNotifications.tsx";

export default function CalendarSettings({
  page = "calendar",
}: {
  page?: "calendar" | "calendars" | "connections" | "general";
}) {
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
  const preferences = directory?.preferences;
  const save = (patch: Parameters<typeof client.preferences>[0]) =>
    void run(() => client.preferences(patch));
  const disabled = !canWrite || busy;
  return (
    <div className="space-y-6">
      {(error ?? directoryError) && <p role="alert">{error ?? directoryError}</p>}
      {page === "connections" && (
        <>
          <section className="space-y-3">
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
                    <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
                      Callback address
                      <Input
                        value={callback}
                        onChange={(event) => setCallback(event.target.value)}
                        required
                      />
                    </label>
                    <Button type="submit" disabled={!canWrite || busy}>
                      Finish connection
                    </Button>
                  </form>
                )}
              </div>
            )}
            {flow?._tag === "succeeded" && <p role="status">Connected {flow.email}.</p>}
            {flow?._tag === "failed" && <p role="alert">{flow.message}</p>}
            {flow && (
              <Button
                type="button"
                onClick={() => {
                  cancelFlow.current?.();
                  cancelFlow.current = null;
                  setFlow(null);
                }}
              >
                Close sign-in
              </Button>
            )}
          </section>
          <section className="space-y-3">
            <h2>Local Google connection</h2>
            <Button type="button" disabled={!canWrite || busy} onClick={() => connect("local")}>
              Connect with local PKCE
            </Button>
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
              <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
                Client ID
                <Input
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
                Client secret
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <Button type="submit" disabled={!canWrite || busy}>
                Save client
              </Button>{" "}
              <Button
                type="button"
                disabled={!canWrite || busy}
                onClick={() => void run(client.clearClient)}
              >
                Clear client
              </Button>
            </form>
          </section>
          <section className="space-y-3">
            <h2>Demo calendars</h2>
            <p>Try calendar views with local sample events.</p>
            <Button
              type="button"
              disabled={!canWrite || busy}
              onClick={() => void run(client.addDemo)}
            >
              Add demo calendars
            </Button>
          </section>
        </>
      )}
      {page === "general" && preferences && (
        <SettingsSection title="Time" description="Account">
          <SettingsRow
            id="calendar-hour-format"
            title="Time format"
            control={
              <CalendarSelect
                aria-label="Time format"
                value={preferences.hourFormat}
                disabled={disabled}
                onChange={(event) =>
                  save({ hourFormat: event.target.value as "locale" | "12" | "24" })
                }
              >
                <option value="locale">Automatic</option>
                <option value="12">12-hour</option>
                <option value="24">24-hour</option>
              </CalendarSelect>
            }
          />
        </SettingsSection>
      )}
      {page === "calendar" && preferences && (
        <>
          <SettingsSection title="Calendar" description="Account · Synced across your devices">
            <SettingsRow
              id="calendar-week-start"
              title="Week starts on"
              control={
                <CalendarSelect
                  aria-label="Week starts on"
                  value={preferences.weekStartsOn}
                  disabled={disabled}
                  onChange={(event) => save({ weekStartsOn: Number(event.target.value) })}
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                  <option value={6}>Saturday</option>
                </CalendarSelect>
              }
            />
            <SettingsRow
              id="calendar-time-zone"
              title="Time zone"
              description="Leave empty to follow this device."
              control={
                <Input
                  aria-label="Time zone"
                  key={preferences.timeZone}
                  defaultValue={preferences.timeZone ?? ""}
                  disabled={disabled}
                  onBlur={(event) => save({ timeZone: event.target.value.trim() || null })}
                />
              }
            />
            <SettingsRow
              id="calendar-working-hours"
              title="Working hours"
              control={
                <div className="flex gap-2">
                  {(["start", "end"] as const).map((part) => (
                    <Input
                      key={`${part}/${preferences.workingHours[part]}`}
                      aria-label={`Working hours ${part}`}
                      type="time"
                      disabled={disabled}
                      defaultValue={`${String(Math.floor(preferences.workingHours[part] / 60)).padStart(2, "0")}:${String(preferences.workingHours[part] % 60).padStart(2, "0")}`}
                      onBlur={(event) => {
                        const [h, m] = event.target.value.split(":").map(Number);
                        if (h !== undefined && m !== undefined)
                          save({
                            workingHours: { ...preferences.workingHours, [part]: h * 60 + m },
                          });
                      }}
                    />
                  ))}
                </div>
              }
            >
              <div className="flex flex-wrap gap-3">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
                  <label key={day} className="flex items-center gap-2">
                    <Checkbox
                      disabled={disabled}
                      checked={preferences.workingHours.days.includes(index)}
                      onCheckedChange={(checked) =>
                        save({
                          workingHours: {
                            ...preferences.workingHours,
                            days: checked
                              ? [...preferences.workingHours.days, index]
                              : preferences.workingHours.days.filter((value) => value !== index),
                          },
                        })
                      }
                    />
                    {day}
                  </label>
                ))}
              </div>
            </SettingsRow>
            <SettingsRow
              id="calendar-default-length"
              title="Default event length (minutes)"
              control={
                <Input
                  aria-label="Default event length"
                  key={preferences.defaultEventMinutes}
                  type="number"
                  min={5}
                  max={1440}
                  defaultValue={preferences.defaultEventMinutes}
                  disabled={disabled}
                  onBlur={(event) => save({ defaultEventMinutes: Number(event.target.value) })}
                />
              }
            />
            <SettingsRow
              id="calendar-custom-days"
              title="Custom-view days"
              control={
                <Input
                  aria-label="Custom-view days"
                  key={preferences.customDays}
                  type="number"
                  min={2}
                  max={14}
                  defaultValue={preferences.customDays}
                  disabled={disabled}
                  onBlur={(event) => save({ customDays: Number(event.target.value) })}
                />
              }
            />
            <SettingsRow
              id="calendar-weekends"
              title="Show weekends"
              control={
                <Checkbox
                  aria-label="Show weekends"
                  disabled={disabled}
                  checked={preferences.showWeekends}
                  onCheckedChange={(checked) => save({ showWeekends: checked })}
                />
              }
            />
            <SettingsRow
              id="calendar-declined"
              title="Show declined events"
              control={
                <Checkbox
                  aria-label="Show declined events"
                  disabled={disabled}
                  checked={preferences.showDeclined}
                  onCheckedChange={(checked) => save({ showDeclined: checked })}
                />
              }
            />
            <SettingsRow
              id="calendar-default-calendar"
              title="New events go to"
              control={
                <CalendarSelect
                  aria-label="New events go to"
                  disabled={disabled}
                  value={preferences.defaultCalendarId ?? ""}
                  onChange={(event) =>
                    save({
                      defaultCalendarId: event.target.value
                        ? (event.target.value as CalendarId)
                        : null,
                    })
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
                </CalendarSelect>
              }
            />
          </SettingsSection>
          <section className="space-y-3">
            <h2>Event reminders · Account</h2>
            <p>
              Default popup reminders for new events and local reminders for upcoming events.
              Per-event overrides take priority.
            </p>
            {directory.preferences.notificationRules.map((rule, index) => (
              <div className="my-2 flex items-center gap-2" key={`${index}/${rule.minutesBefore}`}>
                <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
                  <Checkbox
                    disabled={!canWrite || busy}
                    checked={rule.enabled}
                    onCheckedChange={(checked) =>
                      void run(() =>
                        client.preferences({
                          notificationRules: directory.preferences.notificationRules.map(
                            (item, i) => (i === index ? { ...item, enabled: checked } : item),
                          ),
                        }),
                      )
                    }
                  />
                  Enabled
                </label>
                <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
                  Minutes before
                  <Input
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
                <Button
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
                </Button>
              </div>
            ))}
            <Button
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
            </Button>
            <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
              <Checkbox
                checked={deviceNotifications}
                onCheckedChange={(checked) => {
                  const enabled = checked;
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
        </>
      )}
      {page === "calendars" && directory && (
        <>
          {directory.accounts.map((account) => (
            <SettingsSection
              key={account.accountId}
              title={account.email}
              description={`Account · ${account.status}${account.error ? ` · ${account.error}` : ""}`}
            >
              {directory.calendars
                .filter((calendar) => calendar.accountId === account.accountId)
                .map((calendar) => (
                  <SettingsRow
                    key={calendar.calendarId}
                    title={calendar.name}
                    description={
                      calendar.watchOnly
                        ? "Watch only · Excluded from attention and free-time search"
                        : "Account"
                    }
                    control={
                      <div className="flex items-center gap-3">
                        <Input
                          type="color"
                          aria-label={`Color for ${calendar.name}`}
                          key={calendar.color}
                          defaultValue={calendar.color}
                          disabled={disabled}
                          onBlur={(event) =>
                            void run(() =>
                              client.calendar({
                                calendarId: calendar.calendarId,
                                color: event.target.value,
                              }),
                            )
                          }
                        />
                        <label className="flex items-center gap-2">
                          <Checkbox
                            disabled={disabled}
                            checked={calendar.visible}
                            onCheckedChange={(visible) =>
                              void run(() =>
                                client.calendar({ calendarId: calendar.calendarId, visible }),
                              )
                            }
                          />
                          Visible
                        </label>
                        <label className="flex items-center gap-2">
                          <Checkbox
                            disabled={disabled}
                            checked={calendar.watchOnly === true}
                            onCheckedChange={(watchOnly) =>
                              void run(() =>
                                client.calendar({ calendarId: calendar.calendarId, watchOnly }),
                              )
                            }
                          />
                          Watch only
                        </label>
                      </div>
                    }
                  />
                ))}
              <SettingsRow
                title="Remove account from Calendar"
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      if (window.confirm(`Remove ${account.email} from Calendar?`))
                        void run(() => client.removeAccount(account.accountId));
                    }}
                  >
                    Remove
                  </Button>
                }
              />
            </SettingsSection>
          ))}
          <SettingsSection
            title="Sync window"
            description="Environment · Weeks outside this cache load as needed."
          >
            {(["pastWeeks", "futureWeeks"] as const).map((part) => (
              <SettingsRow
                key={part}
                title={part === "pastWeeks" ? "Past weeks" : "Future weeks"}
                control={
                  <Input
                    aria-label={part}
                    type="number"
                    min={1}
                    max={part === "pastWeeks" ? 104 : 156}
                    defaultValue={directory.environmentPreferences.syncWindow[part]}
                    disabled={disabled}
                    onBlur={(event) =>
                      void run(() =>
                        client.environmentPreferences({
                          syncWindow: {
                            ...directory.environmentPreferences.syncWindow,
                            [part]: Number(event.target.value),
                          },
                        }),
                      )
                    }
                  />
                }
              />
            ))}
            <SettingsRow
              title="Sync now"
              control={
                <Button disabled={disabled} size="sm" onClick={() => void run(client.sync)}>
                  Sync
                </Button>
              }
            />
          </SettingsSection>
        </>
      )}
    </div>
  );
}

function SettingsSection({
  description,
  ...props
}: ComponentProps<typeof HostSettingsSection> & { description?: string }) {
  return (
    <HostSettingsSection
      {...props}
      titleAction={
        description ? (
          <span className="text-xs text-muted-foreground">{description}</span>
        ) : undefined
      }
    />
  );
}
