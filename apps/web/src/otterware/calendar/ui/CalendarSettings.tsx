import { Fragment, type ComponentProps } from "react";
import { PlusIcon, RefreshCwIcon, XIcon } from "lucide-react";
import {
  SettingsRow,
  SettingsSection as HostSettingsSection,
} from "~/components/settings/settingsLayout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { CalendarSelect } from "./CalendarSelect";
import { useState } from "react";
import { type CalendarId } from "@otterware/calendar-contracts";
import { useCalendarClient, useCalendarDirectory } from "./host.tsx";
import {
  calendarDesktopBridge,
  CALENDAR_NOTIFICATION_DEVICE_KEY,
} from "./CalendarNotifications.tsx";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EVENT_LENGTH_CHOICES = [15, 30, 45, 60, 90, 120];
const CUSTOM_DAY_CHOICES = [2, 3, 4, 5, 6, 7, 10, 14];
const DEVICE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The choices, plus a saved value that isn't one of them. */
const withCurrent = (choices: ReadonlyArray<number>, current: number) =>
  choices.includes(current) ? choices : [...choices, current].toSorted((a, b) => a - b);

/** The week's days in the order the week starts on. */
const workingDayOrder = (weekStartsOn: number) =>
  Array.from({ length: 7 }, (_, index) => (weekStartsOn + index) % 7);

const minutesToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function formatMinutes(minutes: number): string {
  if (minutes < 60 || minutes % 60 !== 0) return `${minutes} min`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

let timeZones: ReadonlyArray<string> | null = null;
/** Every IANA zone this runtime knows, plus a saved one it doesn't. */
function timeZoneChoices(saved: string | null): ReadonlyArray<string> {
  timeZones ??= Intl.supportedValuesOf("timeZone");
  return saved && !timeZones.includes(saved) ? [saved, ...timeZones] : timeZones;
}

export default function CalendarSettings({
  page = "general",
}: {
  page?: "general" | "calendars" | "time";
}) {
  const client = useCalendarClient();
  const { directory, error: directoryError, canWrite } = useCalendarDirectory();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deviceNotifications, setDeviceNotifications] = useState(
    () => localStorage.getItem(CALENDAR_NOTIFICATION_DEVICE_KEY) === "true",
  );
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
  const preferences = directory?.preferences;
  const save = (patch: Parameters<typeof client.preferences>[0]) =>
    void run(() => client.preferences(patch));
  const disabled = !canWrite || busy;
  const alert = (error ?? directoryError) && (
    <p role="alert" className="px-4 py-2 text-sm text-destructive">
      {error ?? directoryError}
    </p>
  );
  return (
    <>
      {alert}
      {page === "time" && preferences && (
        <HostSettingsSection title="Time">
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
        </HostSettingsSection>
      )}
      {page === "general" && preferences && (
        <>
          <HostSettingsSection title="Week">
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
              id="calendar-weekends"
              title="Show weekends"
              description="Include Saturday and Sunday in the week view."
              control={
                <Switch
                  aria-label="Show weekends"
                  disabled={disabled}
                  checked={preferences.showWeekends}
                  onCheckedChange={(checked) => save({ showWeekends: checked })}
                />
              }
            />
            <SettingsRow
              id="calendar-custom-days"
              title="Custom view"
              description="How many days the custom view shows."
              control={
                <CalendarSelect
                  aria-label="Custom view"
                  value={preferences.customDays}
                  disabled={disabled}
                  onChange={(event) => save({ customDays: Number(event.target.value) })}
                >
                  {withCurrent(CUSTOM_DAY_CHOICES, preferences.customDays).map((days) => (
                    <option key={days} value={days}>
                      {`${days} days`}
                    </option>
                  ))}
                </CalendarSelect>
              }
            />
          </HostSettingsSection>
          <HostSettingsSection id="calendar-working-hours" title="Working hours">
            <SettingsRow
              title="Days"
              control={
                <ToggleGroup
                  aria-label="Working days"
                  multiple
                  disabled={disabled}
                  value={preferences.workingHours.days.map(String)}
                  onValueChange={(next) =>
                    save({
                      workingHours: {
                        ...preferences.workingHours,
                        days: next.map(Number).toSorted((a, b) => a - b),
                      },
                    })
                  }
                >
                  {workingDayOrder(preferences.weekStartsOn).map((day) => (
                    <Toggle key={day} value={String(day)} aria-label={WEEKDAYS[day]}>
                      {WEEKDAYS[day]?.slice(0, 2)}
                    </Toggle>
                  ))}
                </ToggleGroup>
              }
            />
            <SettingsRow
              title="Hours"
              control={
                <div className="flex items-center gap-2">
                  {(["start", "end"] as const).map((part, index) => (
                    <Fragment key={part}>
                      {index === 1 ? <span className="text-muted-foreground">–</span> : null}
                      <Input
                        key={`${part}/${preferences.workingHours[part]}`}
                        aria-label={part === "start" ? "Working hours start" : "Working hours end"}
                        type="time"
                        size="sm"
                        className="w-32"
                        disabled={disabled}
                        defaultValue={minutesToTime(preferences.workingHours[part])}
                        onBlur={(event) => {
                          const [h, m] = event.target.value.split(":").map(Number);
                          if (h !== undefined && m !== undefined)
                            save({
                              workingHours: { ...preferences.workingHours, [part]: h * 60 + m },
                            });
                        }}
                      />
                    </Fragment>
                  ))}
                </div>
              }
            />
          </HostSettingsSection>
          <HostSettingsSection title="Events">
            <SettingsRow
              id="calendar-default-length"
              title="Default length"
              description="How long a new event lasts."
              control={
                <CalendarSelect
                  aria-label="Default event length"
                  value={preferences.defaultEventMinutes}
                  disabled={disabled}
                  onChange={(event) => save({ defaultEventMinutes: Number(event.target.value) })}
                >
                  {withCurrent(EVENT_LENGTH_CHOICES, preferences.defaultEventMinutes).map(
                    (minutes) => (
                      <option key={minutes} value={minutes}>
                        {formatMinutes(minutes)}
                      </option>
                    ),
                  )}
                </CalendarSelect>
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
            <SettingsRow
              id="calendar-declined"
              title="Show declined events"
              control={
                <Switch
                  aria-label="Show declined events"
                  disabled={disabled}
                  checked={preferences.showDeclined}
                  onCheckedChange={(checked) => save({ showDeclined: checked })}
                />
              }
            />
            <SettingsRow
              id="calendar-time-zone"
              title="Time zone"
              description="Times in Calendar show in this zone."
              control={
                <CalendarSelect
                  aria-label="Time zone"
                  value={preferences.timeZone ?? ""}
                  disabled={disabled}
                  onChange={(event) => save({ timeZone: event.target.value || null })}
                >
                  <option value="">{`This device (${DEVICE_TIME_ZONE})`}</option>
                  {timeZoneChoices(preferences.timeZone).map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replaceAll("_", " ")}
                    </option>
                  ))}
                </CalendarSelect>
              }
            />
          </HostSettingsSection>
          <HostSettingsSection id="calendar-reminders" title="Reminders">
            {directory.preferences.notificationRules.map((rule, index) => (
              <SettingsRow
                key={`${index}/${rule.minutesBefore}`}
                title={`${formatMinutes(rule.minutesBefore)} before`}
                description="A popup on new events."
                control={
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Minutes before"
                      type="number"
                      size="sm"
                      className="w-20"
                      min={0}
                      max={40320}
                      defaultValue={rule.minutesBefore}
                      disabled={disabled}
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
                    <span className="text-xs text-muted-foreground">min</span>
                    <Switch
                      aria-label="Reminder on"
                      disabled={disabled}
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
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove reminder"
                      disabled={disabled}
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
                      <XIcon />
                    </Button>
                  </div>
                }
              />
            ))}
            <SettingsRow
              title="Add a reminder"
              description="Default popup reminders for new events, and local reminders for upcoming ones. A reminder set on an event wins."
              control={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || directory.preferences.notificationRules.length >= 5}
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
                  <PlusIcon />
                  Add reminder
                </Button>
              }
            />
            <SettingsRow
              title="System notifications"
              description="Show upcoming reminders as notifications."
              status="This device"
              control={
                <Switch
                  aria-label="System notifications on this device"
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
              }
            />
          </HostSettingsSection>
        </>
      )}
      {page === "calendars" && directory && (
        <>
          {directory.accounts.map((account) => (
            <SettingsSection
              key={account.accountId}
              title={account.email}
              // A healthy account needs no label; a problem names itself.
              description={
                account.status === "ok" && !account.error
                  ? undefined
                  : `${account.status}${account.error ? ` · ${account.error}` : ""}`
              }
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
                        : undefined
                    }
                    control={
                      <div className="flex items-center gap-4">
                        <input
                          type="color"
                          aria-label={`Color for ${calendar.name}`}
                          key={calendar.color}
                          defaultValue={calendar.color}
                          disabled={disabled}
                          className="size-6 cursor-pointer rounded-full border border-border bg-transparent p-0 disabled:cursor-default [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                          onBlur={(event) =>
                            void run(() =>
                              client.calendar({
                                calendarId: calendar.calendarId,
                                color: event.target.value,
                              }),
                            )
                          }
                        />
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          Watch only
                          <Switch
                            size="sm"
                            disabled={disabled}
                            checked={calendar.watchOnly === true}
                            onCheckedChange={(watchOnly) =>
                              void run(() =>
                                client.calendar({ calendarId: calendar.calendarId, watchOnly }),
                              )
                            }
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          Show
                          <Switch
                            size="sm"
                            disabled={disabled}
                            checked={calendar.visible}
                            onCheckedChange={(visible) =>
                              void run(() =>
                                client.calendar({ calendarId: calendar.calendarId, visible }),
                              )
                            }
                          />
                        </label>
                      </div>
                    }
                  />
                ))}
              <SettingsRow
                title="Remove from Calendar"
                description="Its events disappear from Calendar on this environment."
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
          <SettingsSection title="Sync" description="Environment">
            {(["pastWeeks", "futureWeeks"] as const).map((part) => (
              <SettingsRow
                key={part}
                title={part === "pastWeeks" ? "Past weeks" : "Future weeks"}
                description={
                  part === "pastWeeks"
                    ? "How far back events are kept ready. Older weeks load when you open them."
                    : "How far ahead events are kept ready. Later weeks load when you open them."
                }
                control={
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={part === "pastWeeks" ? "Past weeks" : "Future weeks"}
                      type="number"
                      size="sm"
                      className="w-20"
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
                    <span className="text-xs text-muted-foreground">weeks</span>
                  </div>
                }
              />
            ))}
            <SettingsRow
              title="Sync now"
              description="Fetch changes from every calendar now."
              control={
                <Button
                  disabled={disabled}
                  size="sm"
                  variant="outline"
                  onClick={() => void run(client.sync)}
                >
                  <RefreshCwIcon />
                  Sync now
                </Button>
              }
            />
          </SettingsSection>
        </>
      )}
    </>
  );
}

function SettingsSection({
  description,
  ...props
}: ComponentProps<typeof HostSettingsSection> & { description?: string | undefined }) {
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
