import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Switch } from "~/components/ui/switch";
import {
  AlignLeftIcon,
  LockKeyholeIcon,
  LockOpenIcon,
  BellOffIcon,
  ArrowRightIcon,
  BellIcon,
  ClockIcon,
  ExternalLinkIcon,
  MapPinIcon,
  MoreHorizontalIcon,
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
import { CalendarSelect } from "./CalendarSelect";
import {
  EventActionDialog,
  EventTimeZone,
  RecurringSaveDialog,
  ScopeChoices,
} from "./EventDialogs";
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
import { isValidTimeZone } from "@otterware/calendar-contracts/time";
import { describeRecurrence } from "@otterware/calendar-contracts/recurrence";
import { RepeatDialog } from "./RepeatDialog";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "~/components/ui/menu";
import { useState } from "react";
import { EventReminders } from "./EventReminders";
import { Popover } from "@base-ui/react/popover";
import {
  DescriptionEditor,
  EventDescription,
  EventDateField,
  EventFieldPopup,
  EventGuests,
  EventInput,
  EventTimeField,
  descriptionSummary,
} from "./EventFields";
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
} from "./runtime/eventEditor.logic.ts";

export function EventEditor({
  event,
  duplicate,
  draft,
  timeZone,
  hourFormat = "locale",
  weekStartsOn = 1,
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
  weekStartsOn?: number;
  surface?: RefObject<HTMLElement | null> | undefined;
  calendars: ReadonlyArray<Calendar>;
  defaultCalendar: CalendarId | undefined;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (input: CalendarCreateEventInput | CalendarUpdateEventInput) => void;
  onDelete: (scope: CalendarChangeScope, sendUpdates: CalendarSendUpdates) => void;
  onRespond: (response: "accepted" | "declined" | "tentative") => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
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
  const moveDraft = Boolean(event?.seriesId && draft && !duplicate);
  const [pendingUpdate, setPendingUpdate] = useState<CalendarUpdateEventInput | null>(() =>
    event?.seriesId && draft && !duplicate && canWrite && !event.readOnly
      ? {
          ...editorChanges(initial, form, event.recurrence ?? []),
          calendarId: event.calendarId,
          eventId: event.eventId,
          scope: "this",
          sendUpdates: "all",
        }
      : null,
  );
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [timeZoneOpen, setTimeZoneOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [scope, setScope] = useState<CalendarChangeScope>("this");
  const [reminders, setReminders] = useState<CalendarEventReminders | undefined>(
    event?.reminders ?? (event ? { useDefault: true } : undefined),
  );
  const [sendUpdates, setSendUpdates] = useState<CalendarSendUpdates>("all");
  const [guests, setGuests] = useState("");
  const [customRule, setCustomRule] = useState((event?.recurrence ?? []).join("\n"));
  const [startText, setStartText] = useState(timeText(form.startMinutes, hourFormat));
  const [endText, setEndText] = useState(timeText(form.endMinutes, hourFormat));
  const readOnly = !canWrite || (!duplicate && event?.readOnly === true);
  const guestList = [
    ...new Set([
      ...form.guests,
      ...guests
        .split(/[,;\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ]),
  ];
  const valid = Boolean(
    form.calendarId &&
    form.description.length <= 8192 &&
    guestList.length <= 200 &&
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
  const dirty =
    !event ||
    duplicate ||
    JSON.stringify({ ...form, guests: guestList }) !== JSON.stringify(initial) ||
    (!form.allDay &&
      (parseTimeText(startText) !== form.startMinutes ||
        parseTimeText(endText) !== form.endMinutes)) ||
    JSON.stringify(reminders) !== JSON.stringify(event.reminders ?? { useDefault: true }) ||
    (form.repeat === "custom" && customRule !== (event.recurrence ?? []).join("\n"));
  const scheduleChanged =
    form.repeat !== initial.repeat ||
    (form.repeat === "custom" && customRule !== (event?.recurrence ?? []).join("\n"));
  const editing = !readOnly;
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
          <DialogPrimitive.Backdrop
            render={
              <div className="pointer-events-auto absolute inset-0 hidden pointer-coarse:block" />
            }
          />
          <DialogPrimitive.Popup
            render={
              <div className="dropdown-glass pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col w-[470px] max-w-[calc(100%-24px)] max-h-[calc(100%-48px)] overflow-y-auto rounded-xl text-popover-foreground shadow-xl outline-none transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none" />
            }
          >
            <DialogPrimitive.Title render={<h2 className="sr-only" />}>
              {duplicate ? "Copy event" : event ? "Event details" : "New event"}
            </DialogPrimitive.Title>
            <form
              data-calendar-editor=""
              className="@container min-h-0 overflow-y-auto"
              onSubmit={(submit) => {
                submit.preventDefault();
                if (!valid || readOnly || busy || !dirty) return;
                const value = form.allDay
                  ? { ...form, guests: guestList }
                  : {
                      ...withEnd(
                        withStart(form, form.startDay, parseTimeText(startText)!),
                        form.endDay,
                        parseTimeText(endText)!,
                      ),
                      guests: guestList,
                    };
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
                  const update: CalendarUpdateEventInput = {
                    ...changed,
                    ...(reminders &&
                    JSON.stringify(reminders) !==
                      JSON.stringify(event.reminders ?? { useDefault: true })
                      ? { reminders }
                      : {}),
                    ...(recurrence ? { recurrence } : {}),
                    ...(custom && custom.join("\n") !== (event.recurrence ?? []).join("\n")
                      ? { recurrence: custom }
                      : {}),
                    calendarId: event.calendarId,
                    eventId: event.eventId,
                    scope: "this",
                    sendUpdates,
                  };
                  if (event.seriesId !== undefined) {
                    setScope(scheduleChanged ? "following" : "this");
                    setPendingUpdate(update);
                  } else onSave(update);
                } else
                  onSave({
                    ...createInput(value),
                    ...(reminders ? { reminders } : {}),
                    ...(custom ? { recurrence: custom } : {}),
                    sendUpdates,
                  });
              }}
            >
              {descriptionOpen ? (
                <DescriptionEditor
                  value={form.description}
                  title={form.title}
                  onChange={(value) => patch("description", value)}
                  onBack={() => setDescriptionOpen(false)}
                />
              ) : (
                <>
                  <div>
                    <div className="flex items-start gap-2 px-3 pt-2.5 pb-3">
                      <AlignLeftIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <div className="[&_input]:text-base [&_input]:font-medium">
                            <EventInput
                              aria-label="Event title"
                              placeholder="New event"
                              value={form.title}
                              onChange={(e) => patch("title", e.target.value)}
                              autoFocus
                              maxLength={1024}
                            />
                          </div>
                        ) : (
                          <h2 className="py-0.5 text-base font-medium leading-6 wrap-anywhere">
                            {form.title || "Untitled event"}
                          </h2>
                        )}
                        {editing ? (
                          <button
                            type="button"
                            className="block max-w-full cursor-pointer truncate rounded text-left text-sm leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                            aria-label={form.description ? "Edit description" : "Add description"}
                            onClick={() => setDescriptionOpen(true)}
                          >
                            {form.description
                              ? descriptionSummary(form.description)
                              : "Add description"}
                          </button>
                        ) : form.description ? (
                          <EventDescription value={form.description} />
                        ) : (
                          <p className="text-sm leading-5 text-muted-foreground">No description</p>
                        )}
                      </div>
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
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <EventGuests
                              guests={form.guests}
                              text={guests}
                              onText={setGuests}
                              onChange={(value) => patch("guests", value)}
                            />
                          </div>
                          <Button type="submit" size="xs" disabled={busy || !valid || !dirty}>
                            {busy
                              ? "Saving…"
                              : event && !duplicate
                                ? "Save changes"
                                : guestList.length
                                  ? "Send event"
                                  : "Create event"}
                          </Button>
                        </div>
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
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="min-w-0 flex-1 @max-[360px]:basis-full">
                          {editing ? (
                            <EventInput
                              aria-label="Location"
                              placeholder={
                                form.allDay ? "Add location or room" : "Add location, room or call"
                              }
                              value={form.location}
                              maxLength={1024}
                              onChange={(e) => patch("location", e.target.value)}
                            />
                          ) : (
                            <p className="py-1 text-sm wrap-anywhere">
                              {form.location || "No location"}
                            </p>
                          )}
                        </div>
                        {event?.conference &&
                        !duplicate &&
                        /^https?:\/\//i.test(event.conference.url) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            render={
                              <a href={event.conference.url} target="_blank" rel="noreferrer" />
                            }
                          >
                            <VideoIcon />
                            Join meeting
                          </Button>
                        ) : editing && !form.allDay ? (
                          <Button
                            type="button"
                            variant={form.addConference ? "secondary" : "ghost"}
                            size="xs"
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
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {!form.allDay ? (
                              <div className="flex min-w-44 flex-1 items-center gap-2">
                                <div className="min-w-0 flex-1">
                                  <EventTimeField
                                    label="Start time"
                                    text={startText}
                                    hourFormat={hourFormat}
                                    onChange={setStartText}
                                    onCommit={(minutes) => {
                                      setForm((previous) =>
                                        withStart(previous, previous.startDay, minutes),
                                      );
                                      const next = withStart(form, form.startDay, minutes);
                                      setEndText(timeText(next.endMinutes, hourFormat));
                                    }}
                                  />
                                </div>
                                <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                  <EventTimeField
                                    label="End time"
                                    text={endText}
                                    hourFormat={hourFormat}
                                    onChange={setEndText}
                                    onCommit={(minutes) =>
                                      setForm((previous) =>
                                        withEnd(previous, previous.endDay, minutes),
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="flex-1 text-sm">All-day event</span>
                            )}
                            <label className="ms-auto flex h-6 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                              <Switch
                                size="sm"
                                checked={form.allDay}
                                onCheckedChange={(checked) => patch("allDay", checked)}
                              />
                              All day
                            </label>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <div className="min-w-20 max-w-28 flex-1">
                              <EventDateField
                                label="Start date"
                                day={form.startDay}
                                weekStartsOn={weekStartsOn}
                                timeZone={form.timeZone}
                                onChange={(day) =>
                                  setForm((previous) =>
                                    withStart(previous, day, previous.startMinutes),
                                  )
                                }
                              />
                            </div>
                            <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground @max-[360px]:hidden" />
                            <div className="min-w-20 max-w-28 flex-1">
                              <EventDateField
                                label={form.allDay ? "Last day" : "End date"}
                                day={form.endDay}
                                weekStartsOn={weekStartsOn}
                                timeZone={form.timeZone}
                                onChange={(day) =>
                                  setForm((previous) => withEnd(previous, day, previous.endMinutes))
                                }
                              />
                            </div>
                            <div className="ms-auto">
                              <Menu>
                                <MenuTrigger
                                  render={<Button type="button" variant="ghost" size="xs" />}
                                  aria-label="Repeats"
                                >
                                  <RepeatIcon />
                                  <span className="max-w-40 truncate">
                                    {form.repeat === "custom"
                                      ? "Custom"
                                      : form.repeat === "none"
                                        ? "Repeat"
                                        : repeatChoiceLabel(form.repeat, anchor)}
                                  </span>
                                </MenuTrigger>
                                <MenuPopup align="end">
                                  {(
                                    [
                                      "none",
                                      "daily",
                                      "weekdays",
                                      "weekly",
                                      "biweekly",
                                      "monthlyDay",
                                      "monthlyWeekday",
                                      "yearly",
                                      "custom",
                                    ] as const
                                  ).map((choice) => (
                                    <MenuItem
                                      key={choice}
                                      onClick={() => {
                                        if (choice === "custom") setRepeatOpen(true);
                                        else patch("repeat", choice);
                                      }}
                                    >
                                      {repeatChoiceLabel(choice, anchor)}
                                    </MenuItem>
                                  ))}
                                </MenuPopup>
                              </Menu>
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
                              : ""}{" "}
                            · {form.timeZone}
                          </p>
                        </>
                      )}
                      {!editing && event?.recurrence?.length ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <RepeatIcon className="size-3" />
                          {describeRecurrence(event.recurrence, anchor)}
                        </p>
                      ) : null}
                    </EventRow>
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
                  </div>
                  <div className="flex flex-wrap items-center gap-0.5 border-t border-border px-2 py-1.5">
                    <span
                      className="mx-1 size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: selectedCalendar?.color }}
                      aria-hidden="true"
                    />
                    {editing ? (
                      <div className="max-w-36 min-w-0">
                        <CalendarSelect
                          iconOnly
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
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Visibility"
                          />
                        }
                        disabled={!editing}
                      >
                        {form.visibility === "private" ? <LockKeyholeIcon /> : <LockOpenIcon />}
                      </MenuTrigger>
                      <MenuPopup>
                        {(
                          [
                            ["default", "Calendar default"],
                            ["public", "Public"],
                            ["private", "Private"],
                          ] as const
                        ).map(([value, label]) => (
                          <MenuItem key={value} onClick={() => patch("visibility", value)}>
                            {form.visibility === value ? "✓ " : ""}
                            {label}
                          </MenuItem>
                        ))}
                      </MenuPopup>
                    </Menu>
                    <Popover.Root>
                      <Popover.Trigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Reminders"
                          />
                        }
                      >
                        {reminders?.useDefault === false && !reminders.overrides?.length ? (
                          <BellOffIcon />
                        ) : (
                          <BellIcon />
                        )}
                      </Popover.Trigger>
                      <EventFieldPopup label="Reminders">
                        <EventReminders
                          value={reminders}
                          onChange={setReminders}
                          disabled={!editing || busy}
                          creating={!event || duplicate}
                          defaults={providerDefaults}
                        />
                      </EventFieldPopup>
                    </Popover.Root>
                    <Button
                      type="button"
                      variant="ghost-muted"
                      size="sm"
                      aria-label="Availability"
                      aria-pressed={!form.free}
                      disabled={!editing}
                      onClick={() => patch("free", !form.free)}
                    >
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {form.free ? "Free" : "Busy"}
                    </Button>
                    <div className="ms-auto">
                      <Menu>
                        <MenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="More event options"
                            />
                          }
                        >
                          <MoreHorizontalIcon />
                        </MenuTrigger>
                        <MenuPopup align="end">
                          {editing && (
                            <MenuItem onClick={() => setTimeZoneOpen(true)}>
                              Event time zone…
                            </MenuItem>
                          )}
                          {editing && guestList.length > 0 && (
                            <MenuItem onClick={() => setNotifyOpen(true)}>
                              Guest notifications…
                            </MenuItem>
                          )}
                          {event?.htmlLink && /^https?:\/\//i.test(event.htmlLink) && (
                            <MenuItem
                              render={<a href={event.htmlLink} target="_blank" rel="noreferrer" />}
                            >
                              <ExternalLinkIcon />
                              Open in Google Calendar
                            </MenuItem>
                          )}
                          {event && !duplicate && !readOnly && (
                            <MenuItem
                              variant="destructive"
                              disabled={busy}
                              onClick={() => {
                                setScope("this");
                                setConfirmDelete(true);
                              }}
                            >
                              <TrashIcon />
                              Delete event
                            </MenuItem>
                          )}
                        </MenuPopup>
                      </Menu>
                    </div>
                  </div>
                </>
              )}
            </form>
          </DialogPrimitive.Popup>
          {confirmDelete && (
            <EventActionDialog
              surface={surface}
              title={event?.seriesId ? "Delete recurring event" : "Delete event?"}
              busy={busy}
              onCancel={() => setConfirmDelete(false)}
            >
              <p className="text-sm text-muted-foreground">
                {event?.seriesId
                  ? "Choose which events to delete."
                  : "This event will be removed from your calendar."}
              </p>
              {event?.seriesId && (
                <ScopeChoices scope={scope} onChange={setScope} disabled={busy} />
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
                  disabled={busy || readOnly}
                  onClick={() => onDelete(scope, sendUpdates)}
                >
                  Delete event
                </Button>
              </div>
            </EventActionDialog>
          )}
          {timeZoneOpen && (
            <EventActionDialog
              surface={surface}
              title="Event time zone"
              onCancel={() => setTimeZoneOpen(false)}
            >
              <EventTimeZone
                value={form.timeZone}
                onSave={(value) => {
                  patch("timeZone", value);
                  setTimeZoneOpen(false);
                }}
              />
            </EventActionDialog>
          )}
          {notifyOpen && (
            <EventActionDialog
              surface={surface}
              title="Guest notifications"
              onCancel={() => setNotifyOpen(false)}
            >
              <fieldset className="grid gap-1" aria-label="Notify guests">
                {(
                  [
                    ["all", "All guests"],
                    ["externalOnly", "Guests outside Google Calendar"],
                    ["none", "No email updates"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex min-h-8 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="guest-notifications"
                      checked={sendUpdates === value}
                      onChange={() => setSendUpdates(value)}
                      className="size-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <Button type="button" size="sm" onClick={() => setNotifyOpen(false)}>
                Done
              </Button>
            </EventActionDialog>
          )}
          {repeatOpen && (
            <RepeatDialog
              anchor={anchor}
              surface={surface}
              weekStartsOn={weekStartsOn}
              rule={
                form.repeat === "custom"
                  ? customRule
                  : (createInput(form).recurrence ?? []).join("\n")
              }
              onCancel={() => setRepeatOpen(false)}
              onSave={(rule) => {
                setCustomRule(rule);
                patch("repeat", "custom");
                setRepeatOpen(false);
              }}
            />
          )}
          {pendingUpdate && (
            <RecurringSaveDialog
              surface={surface}
              scope={scope}
              onScope={setScope}
              scheduleChanged={scheduleChanged}
              busy={busy || readOnly}
              onCancel={() => {
                setPendingUpdate(null);
                if (moveDraft) onClose();
              }}
              onConfirm={() => {
                // Moving one occurrence must not rewrite the series' repeating schedule.
                const { recurrence, ...update } = pendingUpdate;
                onSave({
                  ...update,
                  ...(recurrence && scope !== "this" ? { recurrence } : {}),
                  scope,
                });
                setPendingUpdate(null);
              }}
            />
          )}
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function EventRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-t border-border px-3 py-2.5 text-base sm:text-sm">
      <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function timeText(minutes: number, hourFormat: HourFormat) {
  return formatTime(minutes * 60_000, "UTC", hourFormat);
}
