import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogPopup, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { CalendarSelect } from "./CalendarSelect";
import {
  CalendarId,
  type Calendar,
  type CalendarEventDetails,
  type CalendarCreateEventInput,
  type CalendarUpdateEventInput,
  type CalendarChangeScope,
  type CalendarSendUpdates,
  type CalendarEventReminders,
} from "@otterware/calendar-contracts";
import {
  DAY_MS,
  formatDayNumber,
  parseDayNumber,
  isValidTimeZone,
} from "@otterware/calendar-contracts/time";
import {
  buildRecurrenceRule,
  repeatOptionsOf,
  type RepeatOptions,
} from "@otterware/calendar-contracts/recurrence";
import { useState } from "react";
import { ReminderFields } from "./ReminderFields.tsx";
import type { CalendarDraft } from "./grid/types.ts";
import {
  createInput,
  editorChanges,
  formForEvent,
  formRange,
  formTimes,
  isEmail,
  parseTimeText,
  repeatChoiceLabel,
  withStart,
  withEnd,
  type EditorForm,
  type RepeatChoice,
} from "./runtime/eventEditor.logic.ts";

export function EventEditor({
  event,
  duplicate,
  draft,
  timeZone,
  calendars,
  defaultCalendar,
  canWrite,
  busy,
  onClose,
  onSave,
  onDelete,
  onRespond,
}: {
  event: CalendarEventDetails | null;
  duplicate: boolean;
  draft: CalendarDraft | null;
  timeZone: string;
  calendars: ReadonlyArray<Calendar>;
  defaultCalendar: CalendarId | undefined;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (input: CalendarCreateEventInput | CalendarUpdateEventInput) => void;
  onDelete: (scope: CalendarChangeScope, sendUpdates: CalendarSendUpdates) => void;
  onRespond: (response: "accepted" | "declined" | "tentative") => void;
}) {
  const [initial] = useState<EditorForm>(() =>
    event
      ? formForEvent(event, event, timeZone)
      : {
          title: "",
          ...formTimes(draft!, timeZone),
          timeZone,
          repeat: "none",
          calendarId: defaultCalendar ?? "",
          location: "",
          description: "",
          guests: [],
          addConference: false,
          free: false,
          visibility: "default",
        },
  );
  const [form, setForm] = useState<EditorForm>(() => ({
    ...initial,
    ...(draft ? formTimes(draft, initial.timeZone) : {}),
    ...(duplicate
      ? {
          repeat: "none",
          calendarId: calendars.some(
            (item) =>
              item.calendarId === initial.calendarId &&
              (item.accessRole === "owner" || item.accessRole === "writer"),
          )
            ? initial.calendarId
            : (defaultCalendar ?? ""),
        }
      : {}),
  }));
  const [scope, setScope] = useState<CalendarChangeScope>("this");
  const [reminders, setReminders] = useState<CalendarEventReminders | undefined>(
    event?.reminders ?? (event ? { useDefault: true } : undefined),
  );
  const [sendUpdates, setSendUpdates] = useState<CalendarSendUpdates>("all");
  const [guests, setGuests] = useState(form.guests.join(", "));
  const [customRule, setCustomRule] = useState((event?.recurrence ?? []).join("\n"));
  const [startText, setStartText] = useState(timeText(form.startMinutes));
  const [endText, setEndText] = useState(timeText(form.endMinutes));
  const readOnly = !canWrite || (!duplicate && event?.readOnly === true);
  const guestList = guests
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const valid = Boolean(
    form.calendarId &&
    isValidTimeZone(form.timeZone) &&
    parseTimeText(startText) !== null &&
    parseTimeText(endText) !== null &&
    guestList.every(isEmail) &&
    form.endDay >= form.startDay,
  );
  const patch = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const anchor = {
    ...formRange({ ...form, timeZone: isValidTimeZone(form.timeZone) ? form.timeZone : timeZone }),
    timeZone: isValidTimeZone(form.timeZone) ? form.timeZone : timeZone,
  };
  const recurrenceLocked = !duplicate && event?.seriesId !== undefined && scope === "this";
  const providerDefaults = calendars.find(
    (calendar) => calendar.calendarId === form.calendarId,
  )?.defaultReminders;
  const account = calendars.find((item) => item.calendarId === event?.calendarId)?.accountId;
  const targets = calendars.filter(
    (item) =>
      (!event || duplicate || item.accountId === account) &&
      (item.accessRole === "owner" ||
        item.accessRole === "writer" ||
        (!duplicate && item.calendarId === event?.calendarId)),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup>
        <DialogTitle>
          {duplicate ? "Copy event" : event ? "Event details" : "New event"}
        </DialogTitle>
        <form
          className="grid gap-3"
          onSubmit={(submit) => {
            submit.preventDefault();
            if (!valid) return;
            const value = { ...form, guests: guestList };
            const custom =
              form.repeat === "custom"
                ? customRule
                    .split(/\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                : undefined;
            if (event && !duplicate) {
              const { recurrence, ...changed } = editorChanges(
                initial,
                value,
                event.recurrence ?? [],
              );
              // An occurrence cannot replace its master's schedule.
              onSave({
                ...changed,
                ...(reminders &&
                JSON.stringify(reminders) !==
                  JSON.stringify(event.reminders ?? { useDefault: true })
                  ? { reminders }
                  : {}),
                ...(!recurrenceLocked && recurrence ? { recurrence } : {}),
                ...(!recurrenceLocked &&
                custom &&
                custom.join("\n") !== (event.recurrence ?? []).join("\n")
                  ? { recurrence: custom }
                  : {}),
                calendarId: event.calendarId,
                eventId: event.eventId,
                scope,
                sendUpdates,
              });
            } else
              onSave({
                ...createInput(value),
                ...(reminders ? { reminders } : {}),
                ...(custom ? { recurrence: custom } : {}),
                sendUpdates,
              });
          }}
        >
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Title
            <Input
              value={form.title}
              onChange={(e) => patch("title", e.target.value)}
              disabled={readOnly}
              autoFocus
              maxLength={1024}
            />
          </label>
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Calendar
            <CalendarSelect
              value={form.calendarId}
              onChange={(e) => patch("calendarId", e.target.value)}
              disabled={readOnly}
            >
              {targets.map((item) => (
                <option key={item.calendarId} value={item.calendarId}>
                  {item.name}
                </option>
              ))}
            </CalendarSelect>
          </label>
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            <Checkbox
              checked={form.allDay}
              onCheckedChange={(checked) => patch("allDay", checked)}
              disabled={readOnly}
            />
            All day
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
              Starts
              <Input
                type="date"
                value={formatDayNumber(form.startDay)}
                onChange={(e) => {
                  const day = parseDayNumber(e.target.value);
                  if (day !== null)
                    setForm((previous) => withStart(previous, day, previous.startMinutes));
                }}
                disabled={readOnly}
              />
            </label>
            {!form.allDay && (
              <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
                Time
                <Input
                  value={startText}
                  onChange={(e) => {
                    setStartText(e.target.value);
                    const minutes = parseTimeText(e.target.value);
                    if (minutes !== null) {
                      const next = withStart(form, form.startDay, minutes);
                      setForm(next);
                      setEndText(timeText(next.endMinutes));
                    }
                  }}
                  aria-invalid={parseTimeText(startText) === null}
                  disabled={readOnly}
                  placeholder="9:30 am"
                />
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
              Ends{form.allDay && " (last day)"}
              <Input
                type="date"
                value={formatDayNumber(form.endDay)}
                onChange={(e) => {
                  const day = parseDayNumber(e.target.value);
                  if (day !== null)
                    setForm((previous) => withEnd(previous, day, previous.endMinutes));
                }}
                disabled={readOnly}
              />
            </label>
            {!form.allDay && (
              <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
                Time
                <Input
                  value={endText}
                  onChange={(e) => {
                    setEndText(e.target.value);
                    const minutes = parseTimeText(e.target.value);
                    if (minutes !== null)
                      setForm((previous) => withEnd(previous, previous.endDay, minutes));
                  }}
                  aria-invalid={parseTimeText(endText) === null}
                  disabled={readOnly}
                />
              </label>
            )}
          </div>
          {!form.allDay && (
            <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
              Event time zone
              <Input
                value={form.timeZone}
                onChange={(e) => patch("timeZone", e.target.value)}
                disabled={readOnly}
                aria-invalid={!isValidTimeZone(form.timeZone)}
              />
            </label>
          )}
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Location
            <Input
              value={form.location}
              onChange={(e) => patch("location", e.target.value)}
              disabled={readOnly}
              maxLength={1024}
            />
          </label>
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Description
            <Textarea
              value={form.description}
              onChange={(e) => patch("description", e.target.value)}
              disabled={readOnly}
              rows={3}
              maxLength={8192}
            />
          </label>
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Guests
            <Input
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              disabled={readOnly}
              placeholder="Emails separated by commas"
              aria-invalid={!guestList.every(isEmail)}
            />
          </label>
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Repeats
            <CalendarSelect
              value={form.repeat}
              onChange={(e) => patch("repeat", e.target.value as RepeatChoice)}
              disabled={readOnly || recurrenceLocked}
            >
              {(
                [
                  "none",
                  "daily",
                  "weekdays",
                  "weekly",
                  "monthlyDay",
                  "monthlyWeekday",
                  "yearly",
                  "custom",
                ] as const
              ).map((choice) => (
                <option key={choice} value={choice}>
                  {repeatChoiceLabel(choice, anchor)}
                </option>
              ))}
            </CalendarSelect>
          </label>
          {form.repeat === "custom" && !recurrenceLocked && (
            <CustomRepeat
              anchor={anchor}
              rule={customRule}
              onRule={setCustomRule}
              disabled={readOnly}
            />
          )}
          {event?.seriesId && !duplicate && (
            <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
              Apply to
              <CalendarSelect
                value={scope}
                onChange={(e) => setScope(e.target.value as CalendarChangeScope)}
              >
                <option value="this">This event</option>
                <option value="following">This and following</option>
                <option value="all">All events</option>
              </CalendarSelect>
            </label>
          )}
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Availability
            <CalendarSelect
              value={form.free ? "free" : "busy"}
              onChange={(e) => patch("free", e.target.value === "free")}
              disabled={readOnly}
            >
              <option value="busy">Busy</option>
              <option value="free">Free</option>
            </CalendarSelect>
          </label>
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Visibility
            <CalendarSelect
              value={form.visibility}
              onChange={(e) => patch("visibility", e.target.value as EditorForm["visibility"])}
              disabled={readOnly}
            >
              <option value="default">Calendar default</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </CalendarSelect>
          </label>
          {(!event?.conference || duplicate) && (
            <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
              <Checkbox
                checked={form.addConference}
                onCheckedChange={(checked) => patch("addConference", checked)}
                disabled={readOnly}
              />
              Add Google Meet
            </label>
          )}
          {event?.conference && !duplicate && (
            <a href={event.conference.url} target="_blank" rel="noreferrer">
              Join meeting
            </a>
          )}
          {event?.htmlLink && (
            <a href={event.htmlLink} target="_blank" rel="noreferrer">
              Open in Google Calendar
            </a>
          )}
          {event?.attendees.map((guest) => (
            <p key={guest.email}>
              {guest.displayName ?? guest.email}: {guest.responseStatus}
            </p>
          ))}
          {reminders?.useDefault && providerDefaults !== undefined && (
            <p>
              Calendar defaults:{" "}
              {providerDefaults
                .map((rule) => `${rule.method}, ${rule.minutes} minutes before`)
                .join("; ") || "None configured"}
              .
            </p>
          )}
          <ReminderFields
            value={reminders}
            onChange={setReminders}
            disabled={readOnly}
            creating={!event || duplicate}
          />
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Notify guests
            <CalendarSelect
              value={sendUpdates}
              onChange={(e) => setSendUpdates(e.target.value as CalendarSendUpdates)}
              disabled={readOnly}
            >
              <option value="all">All guests</option>
              <option value="externalOnly">Guests outside Google Calendar</option>
              <option value="none">No email updates</option>
            </CalendarSelect>
          </label>
          {event?.canRespond && !event.watchOnly && !duplicate && (
            <div className="flex justify-end gap-2">
              {(["accepted", "tentative", "declined"] as const).map((response) => (
                <Button
                  key={response}
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() => onRespond(response)}
                >
                  {response}
                </Button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" disabled={readOnly || busy || !valid}>
              Save
            </Button>
            {event && !duplicate && (
              <Button
                type="button"
                disabled={readOnly || busy}
                onClick={() => onDelete(scope, sendUpdates)}
              >
                Delete
              </Button>
            )}
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
function timeText(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function CustomRepeat({
  anchor,
  rule,
  onRule,
  disabled,
}: {
  anchor: { start: number; allDay: boolean; timeZone: string };
  rule: string;
  onRule: (rule: string) => void;
  disabled: boolean;
}) {
  const [options, setOptions] = useState<RepeatOptions>(
    () => repeatOptionsOf(rule.split("\n"), anchor) ?? { freq: "WEEKLY" },
  );
  const [ending, setEnding] = useState<"never" | "count" | "until">(
    options.count ? "count" : options.untilDay !== undefined ? "until" : "never",
  );
  return (
    <fieldset disabled={disabled}>
      <legend>Custom schedule</legend>
      <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
        Frequency
        <CalendarSelect
          value={options.freq}
          onChange={(e) =>
            setOptions({ ...options, freq: e.target.value as RepeatOptions["freq"] })
          }
        >
          {["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].map((freq) => (
            <option key={freq}>{freq}</option>
          ))}
        </CalendarSelect>
      </label>
      <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
        Every
        <Input
          type="number"
          min={1}
          max={999}
          value={options.interval ?? 1}
          onChange={(e) => setOptions({ ...options, interval: Number(e.target.value) })}
        />
      </label>
      {options.freq === "WEEKLY" && (
        <div className="flex flex-wrap gap-3">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
            <label key={day}>
              <Checkbox
                checked={options.weekdays?.includes(index) ?? false}
                onCheckedChange={(checked) =>
                  setOptions({
                    ...options,
                    weekdays: checked
                      ? [...(options.weekdays ?? []), index]
                      : (options.weekdays ?? []).filter((value) => value !== index),
                  })
                }
              />
              {day}
            </label>
          ))}
        </div>
      )}
      {options.freq === "MONTHLY" && (
        <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
          <Checkbox
            checked={options.monthlyByWeekday ?? false}
            onCheckedChange={(checked) => setOptions({ ...options, monthlyByWeekday: checked })}
          />
          By weekday of month
        </label>
      )}
      <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
        Ends
        <CalendarSelect value={ending} onChange={(e) => setEnding(e.target.value as typeof ending)}>
          <option value="never">Never</option>
          <option value="count">After occurrences</option>
          <option value="until">On date</option>
        </CalendarSelect>
      </label>
      {ending === "count" && (
        <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
          Occurrences
          <Input
            type="number"
            min={1}
            max={10000}
            value={options.count ?? 10}
            onChange={(e) => setOptions({ ...options, count: Number(e.target.value) })}
          />
        </label>
      )}
      {ending === "until" && (
        <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
          Last date
          <Input
            type="date"
            value={formatDayNumber(options.untilDay ?? Math.floor(anchor.start / DAY_MS) + 30)}
            onChange={(e) => {
              const day = parseDayNumber(e.target.value);
              if (day !== null) setOptions({ ...options, untilDay: day });
            }}
          />
        </label>
      )}
      <Button
        type="button"
        disabled={!Number.isInteger(options.interval ?? 1) || (options.interval ?? 1) < 1}
        onClick={() => {
          const { count: _count, untilDay: _until, ...rest } = options;
          const next = {
            ...rest,
            ...(ending === "count"
              ? { count: options.count ?? 10 }
              : ending === "until"
                ? { untilDay: options.untilDay ?? Math.floor(anchor.start / DAY_MS) + 30 }
                : {}),
          };
          onRule(
            [
              buildRecurrenceRule(next, anchor),
              ...rule.split("\n").filter((line) => line && !line.toUpperCase().startsWith("RRULE")),
            ].join("\n"),
          );
        }}
      >
        Use custom schedule
      </Button>
      <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
        Recurrence rules
        <Textarea value={rule} onChange={(e) => onRule(e.target.value)} rows={3} />
      </label>
    </fieldset>
  );
}
