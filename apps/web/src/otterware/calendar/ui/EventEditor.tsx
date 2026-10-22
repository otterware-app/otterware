import { Checkbox } from "~/components/ui/checkbox";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Switch } from "~/components/ui/switch";
import {
  AlignLeftIcon,
  ArrowRightIcon,
  BellIcon,
  ClockIcon,
  ExternalLinkIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RepeatIcon,
  TrashIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { formatTime, formatTimeRange, formatLongDate, type HourFormat } from "./runtime/format";
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
  describeRecurrence,
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
  hourFormat = "locale",
  surface,
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
  hourFormat?: HourFormat;
  surface?: RefObject<HTMLElement | null>;
  calendars: ReadonlyArray<Calendar>;
  defaultCalendar: CalendarId | undefined;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (input: CalendarCreateEventInput | CalendarUpdateEventInput) => void;
  onDelete: (scope: CalendarChangeScope, sendUpdates: CalendarSendUpdates) => void;
  onRespond: (response: "accepted" | "declined" | "tentative") => void;
}) {
  const [editMode, setEditMode] = useState(!event || duplicate || draft !== null);
  const [more, setMore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(Boolean(event?.description));
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
  const [startText, setStartText] = useState(timeText(form.startMinutes, hourFormat));
  const [endText, setEndText] = useState(timeText(form.endMinutes, hourFormat));
  const readOnly = !canWrite || (!duplicate && event?.readOnly === true);
  const guestList = guests
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const valid = Boolean(
    form.calendarId &&
    isValidTimeZone(form.timeZone) &&
    (form.allDay || (parseTimeText(startText) !== null && parseTimeText(endText) !== null)) &&
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
  const editing = editMode && !readOnly;
  const selectedCalendar = calendars.find((calendar) => calendar.calendarId === form.calendarId);
  const responseLabels = {
    accepted: "Going",
    tentative: "Maybe",
    declined: "Not going",
    needsAction: "Awaiting reply",
  };
  // This card belongs to the calendar surface, not the selected event: CSS keeps it stable
  // as fields expand, without anchor measurement or position/size animation.
  return (
    <DialogPrimitive.Root
      modal={false}
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPrimitive.Portal keepMounted container={surface}>
        <div
          className={
            surface
              ? "pointer-events-none absolute inset-0 z-[130]"
              : "pointer-events-none fixed inset-0 z-[130]"
          }
        >
          <DialogPrimitive.Backdrop className="pointer-events-auto absolute inset-0 hidden pointer-coarse:block" />
          <DialogPrimitive.Popup className="dropdown-glass pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col w-[470px] max-w-[calc(100%-24px)] max-h-[calc(100%-48px)] overflow-y-auto rounded-xl text-popover-foreground shadow-xl outline-none transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none">
            <DialogPrimitive.Title className="sr-only">
              {duplicate ? "Copy event" : event ? "Event details" : "New event"}
            </DialogPrimitive.Title>
            <form
              data-calendar-editor=""
              className="min-h-0 overflow-y-auto"
              onSubmit={(submit) => {
                submit.preventDefault();
                if (!valid || readOnly || busy || !editMode) return;
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
              <div className="flex items-start gap-2 px-4 pt-4 pb-3">
                <AlignLeftIcon className="mt-2 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="text-lg font-semibold">
                      <Input
                        unstyled
                        aria-label="Event title"
                        placeholder="New event"
                        value={form.title}
                        onChange={(e) => patch("title", e.target.value)}
                        autoFocus
                        maxLength={1024}
                      />
                    </div>
                  ) : (
                    <h2 className="py-1 text-lg font-semibold leading-snug wrap-anywhere">
                      {form.title || "Untitled event"}
                    </h2>
                  )}
                  {editing ? (
                    descriptionOpen ? (
                      <Textarea
                        unstyled
                        size="sm"
                        aria-label="Description"
                        placeholder="Add description"
                        value={form.description}
                        onChange={(e) => patch("description", e.target.value)}
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDescriptionOpen(true)}
                      >
                        Add description
                      </Button>
                    )
                  ) : (
                    <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground wrap-anywhere">
                      {event?.description || "No description"}
                    </p>
                  )}
                </div>
                {!editing && !readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit event"
                    onClick={() => setEditMode(true)}
                  >
                    <PencilIcon />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close event"
                  disabled={busy}
                  onClick={onClose}
                >
                  <XIcon />
                </Button>
              </div>
              <EventRow icon={UsersIcon}>
                {editing && (
                  <Input
                    unstyled
                    aria-label="Guests"
                    placeholder="Add guests (email addresses)"
                    value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                    aria-invalid={!guestList.every(isEmail)}
                  />
                )}
                {!editing && !event?.attendees.length && (
                  <p className="py-1 text-sm text-muted-foreground">No guests</p>
                )}
                {event && !duplicate && event.attendees.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer py-1 text-muted-foreground">
                      {
                        event.attendees.filter((guest) => guest.responseStatus === "accepted")
                          .length
                      }{" "}
                      going · {event.attendees.length} guests
                    </summary>
                    <ul className="max-h-36 space-y-2 overflow-y-auto py-2">
                      {event.attendees.map((guest) => (
                        <li key={guest.email} className="flex items-center gap-2">
                          <span
                            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                            aria-hidden="true"
                          >
                            {(guest.displayName || guest.email).slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {guest.displayName || guest.email}
                            {guest.organizer ? " (organizer)" : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {responseLabels[guest.responseStatus]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </EventRow>
              <EventRow icon={MapPinIcon}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <Input
                        unstyled
                        aria-label="Location"
                        placeholder="Add location, room or call"
                        value={form.location}
                        onChange={(e) => patch("location", e.target.value)}
                      />
                    ) : (
                      <p className="py-1 text-sm wrap-anywhere">{form.location || "No location"}</p>
                    )}
                  </div>
                  {event?.conference && !duplicate && /^https?:\/\//i.test(event.conference.url) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      render={<a href={event.conference.url} target="_blank" rel="noreferrer" />}
                    >
                      <VideoIcon />
                      Join meeting
                    </Button>
                  ) : editing ? (
                    <Button
                      type="button"
                      variant={form.addConference ? "secondary" : "ghost"}
                      size="sm"
                      aria-pressed={form.addConference}
                      onClick={() => patch("addConference", !form.addConference)}
                    >
                      <VideoIcon />
                      Google Meet
                    </Button>
                  ) : null}
                </div>
              </EventRow>
              <EventRow icon={ClockIcon}>
                {editing ? (
                  <>
                    <div className="flex items-center gap-2">
                      {!form.allDay ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <div className="w-24">
                            <Input
                              unstyled
                              size="sm"
                              aria-label="Start time"
                              value={startText}
                              aria-invalid={parseTimeText(startText) === null}
                              onChange={(e) => {
                                setStartText(e.target.value);
                                const minutes = parseTimeText(e.target.value);
                                if (minutes !== null) {
                                  const next = withStart(form, form.startDay, minutes);
                                  setForm(next);
                                  setEndText(timeText(next.endMinutes, hourFormat));
                                }
                              }}
                            />
                          </div>
                          <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
                          <div className="w-24">
                            <Input
                              unstyled
                              size="sm"
                              aria-label="End time"
                              value={endText}
                              aria-invalid={parseTimeText(endText) === null}
                              onChange={(e) => {
                                setEndText(e.target.value);
                                const minutes = parseTimeText(e.target.value);
                                if (minutes !== null)
                                  setForm((previous) =>
                                    withEnd(previous, previous.endDay, minutes),
                                  );
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="flex-1 text-sm">All-day event</span>
                      )}
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Switch
                          size="sm"
                          checked={form.allDay}
                          onCheckedChange={(checked) => patch("allDay", checked)}
                        />
                        All day
                      </label>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <Input
                          unstyled
                          size="sm"
                          type="date"
                          aria-label="Start date"
                          value={formatDayNumber(form.startDay)}
                          onChange={(e) => {
                            const day = parseDayNumber(e.target.value);
                            if (day !== null)
                              setForm((previous) =>
                                withStart(previous, day, previous.startMinutes),
                              );
                          }}
                        />
                      </div>
                      <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <Input
                          unstyled
                          size="sm"
                          type="date"
                          aria-label={form.allDay ? "Last day" : "End date"}
                          value={formatDayNumber(form.endDay)}
                          onChange={(e) => {
                            const day = parseDayNumber(e.target.value);
                            if (day !== null)
                              setForm((previous) => withEnd(previous, day, previous.endMinutes));
                          }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="py-1 text-sm font-medium">
                      {event?.allDay
                        ? "All day"
                        : event
                          ? formatTimeRange(event.start, event.end, form.timeZone, hourFormat)
                          : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatLongDate(form.startDay)}
                      {form.endDay !== form.startDay
                        ? ` – ${formatLongDate(form.endDay)}`
                        : ""} ·{" "}
                      {form.timeZone}
                    </p>
                  </>
                )}
                {editing && (
                  <div className="mt-1 flex justify-end">
                    <CalendarSelect
                      compact
                      aria-label="Repeats"
                      value={form.repeat}
                      onChange={(e) => patch("repeat", e.target.value as RepeatChoice)}
                      disabled={recurrenceLocked}
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
                  </div>
                )}
                {!editing && event?.recurrence?.length ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <RepeatIcon className="size-3" />
                    {describeRecurrence(event.recurrence, anchor)}
                  </p>
                ) : null}
              </EventRow>
              {editing && event?.seriesId && !duplicate && (
                <EventRow icon={RepeatIcon}>
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Apply changes to
                    <CalendarSelect
                      aria-label="Apply changes to"
                      value={scope}
                      onChange={(e) => setScope(e.target.value as CalendarChangeScope)}
                    >
                      <option value="this">This event</option>
                      <option value="following">This and following</option>
                      <option value="all">All events</option>
                    </CalendarSelect>
                  </label>
                </EventRow>
              )}
              {editing && form.repeat === "custom" && !recurrenceLocked && (
                <div className="border-t border-border px-4 py-3">
                  <CustomRepeat
                    anchor={anchor}
                    rule={customRule}
                    onRule={setCustomRule}
                    disabled={busy}
                  />
                </div>
              )}
              {more && (
                <div
                  id="calendar-event-options"
                  className="grid gap-3 border-t border-border px-4 py-3"
                >
                  {editing ? (
                    <>
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        Event time zone
                        <Input
                          aria-label="Event time zone"
                          value={form.timeZone}
                          onChange={(e) => patch("timeZone", e.target.value)}
                          aria-invalid={!isValidTimeZone(form.timeZone)}
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        Visibility
                        <CalendarSelect
                          aria-label="Visibility"
                          value={form.visibility}
                          onChange={(e) =>
                            patch("visibility", e.target.value as EditorForm["visibility"])
                          }
                        >
                          <option value="default">Calendar default</option>
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                        </CalendarSelect>
                      </label>
                      <ReminderFields
                        value={reminders}
                        onChange={setReminders}
                        disabled={busy}
                        creating={!event || duplicate}
                      />
                      {reminders?.useDefault && providerDefaults !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          Calendar defaults:{" "}
                          {providerDefaults
                            .map((rule) => `${rule.method}, ${rule.minutes} minutes before`)
                            .join("; ") || "None configured"}
                          .
                        </p>
                      )}
                      {guestList.length > 0 && (
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          Notify guests
                          <CalendarSelect
                            aria-label="Notify guests"
                            value={sendUpdates}
                            onChange={(e) => setSendUpdates(e.target.value as CalendarSendUpdates)}
                          >
                            <option value="all">All guests</option>
                            <option value="externalOnly">Guests outside Google Calendar</option>
                            <option value="none">No email updates</option>
                          </CalendarSelect>
                        </label>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm">
                        {selectedCalendar?.name} · {event?.visibility ?? "Calendar default"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {event?.reminders?.useDefault !== false
                          ? "Calendar reminder defaults"
                          : event.reminders.overrides
                              ?.map((rule) => `${rule.method}, ${rule.minutes} minutes before`)
                              .join("; ") || "No reminders"}
                      </p>
                      {event?.htmlLink && /^https?:\/\//i.test(event.htmlLink) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          render={<a href={event.htmlLink} target="_blank" rel="noreferrer" />}
                        >
                          <ExternalLinkIcon />
                          Open in Google Calendar
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
              {event?.canRespond && !event.watchOnly && !duplicate && (
                <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                  <span className="text-sm text-muted-foreground">Going?</span>
                  <div className="flex gap-1">
                    {(["accepted", "tentative", "declined"] as const).map((response) => (
                      <Button
                        key={response}
                        type="button"
                        variant={event.response === response ? "secondary" : "ghost"}
                        size="sm"
                        disabled={!canWrite || busy}
                        onClick={() => onRespond(response)}
                      >
                        {responseLabels[response]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {confirmDelete && (
                <div
                  className="grid gap-3 border-t border-border px-4 py-3"
                  role="group"
                  aria-label="Confirm event deletion"
                >
                  <p className="text-sm font-medium">Delete this event?</p>
                  {event?.seriesId && (
                    <CalendarSelect
                      aria-label="Delete occurrences"
                      value={scope}
                      onChange={(e) => setScope(e.target.value as CalendarChangeScope)}
                    >
                      <option value="this">This event</option>
                      <option value="following">This and following</option>
                      <option value="all">All events</option>
                    </CalendarSelect>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => onDelete(scope, sendUpdates)}
                    >
                      Delete event
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1 border-t border-border px-3 py-2">
                <span
                  className="mx-1 size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedCalendar?.color }}
                  aria-hidden="true"
                />
                {editing ? (
                  <div className="max-w-44 min-w-0">
                    <CalendarSelect
                      compact
                      aria-label="Calendar"
                      value={form.calendarId}
                      onChange={(e) => patch("calendarId", e.target.value)}
                    >
                      {targets.map((item) => (
                        <option key={item.calendarId} value={item.calendarId}>
                          {item.name}
                        </option>
                      ))}
                    </CalendarSelect>
                  </div>
                ) : (
                  <span className="max-w-44 truncate text-xs text-muted-foreground">
                    {selectedCalendar?.name}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Reminders and visibility"
                  aria-expanded={more}
                  aria-controls="calendar-event-options"
                  onClick={() => setMore(!more)}
                >
                  <BellIcon />
                </Button>
                <div className="min-w-0">
                  {editing ? (
                    <CalendarSelect
                      compact
                      aria-label="Availability"
                      value={form.free ? "free" : "busy"}
                      onChange={(e) => patch("free", e.target.value === "free")}
                    >
                      <option value="busy">Busy</option>
                      <option value="free">Free</option>
                    </CalendarSelect>
                  ) : (
                    <span className="px-1 text-xs text-muted-foreground">
                      {form.free ? "Free" : "Busy"}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More event options"
                  aria-expanded={more}
                  aria-controls="calendar-event-options"
                  onClick={() => setMore(!more)}
                >
                  <MoreHorizontalIcon />
                </Button>
                <div className="ms-auto flex items-center gap-1">
                  {event && !duplicate && !readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete event"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <TrashIcon />
                    </Button>
                  )}
                  {editing && (
                    <Button type="submit" size="sm" disabled={busy || !valid}>
                      {busy ? "Saving…" : event && !duplicate ? "Save changes" : "Create event"}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </DialogPrimitive.Popup>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function EventRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-t border-border px-4 py-3">
      <Icon className="mt-1.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function timeText(minutes: number, hourFormat: HourFormat) {
  return formatTime(minutes * 60_000, "UTC", hourFormat);
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
