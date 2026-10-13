import {
  DEFAULT_CALENDAR_PREFERENCES,
  type CalendarEventInstance,
  type CalendarEventDetails,
  type CalendarId,
  type CalendarChangeScope,
  type CalendarMutationResult,
} from "@otterware/calendar-contracts";
import {
  DAY_MS,
  fromZoned,
  addMonths,
  zonedDay,
  systemTimeZone,
  civilDate,
  dayNumber,
  weekday,
  formatDayNumber,
  parseDayNumber,
  formatZonedIso,
  parseInstant,
} from "@otterware/calendar-contracts/time";
import { useModulePageContext, type ModulePageProps } from "@otterware/module-kit/web";
import { useEffectEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCalendarClient, useCalendarDirectory, useCalendarWeeks } from "./host.tsx";
import { TimeGrid } from "./grid/TimeGrid.tsx";
import { MonthGrid } from "./grid/MonthGrid.tsx";
import type { CalendarDraft, CalendarEventChange } from "./grid/types.ts";
import { chunkWeeksForDays } from "./runtime/chunks.ts";
import { createCalendarHistory, eventTimeInput } from "./runtime/optimistic.ts";
import { formatLongDate } from "./runtime/format.ts";
import { useMinuteClock } from "./grid/useMinuteClock.ts";
import "./calendar.css";

export default function CalendarPage({ active, subpath }: ModulePageProps) {
  const client = useCalendarClient();
  const { directory, error: directoryError, canWrite } = useCalendarDirectory();
  const preferences = directory?.preferences ?? DEFAULT_CALENDAR_PREFERENCES;
  const zone = preferences.timeZone ?? systemTimeZone();
  const now = useMinuteClock();
  const today = zonedDay(now, zone);
  const [date, setDate] = useState(
    () => parseDayNumber(new URLSearchParams(window.location.search).get("date") ?? "") ?? today,
  );
  const [view, setView] = useState<"week" | "day" | "month">("week");
  const [selected, setSelected] = useState<CalendarEventInstance | null>(null);
  const [draft, setDraft] = useState<(CalendarDraft & { readonly duplicate?: boolean }) | null>(
    null,
  );
  const [details, setDetails] = useState<CalendarEventDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history] = useState(createCalendarHistory);
  const stack = useSyncExternalStore(history.subscribe, history.getState);
  const root = useRef<HTMLDivElement>(null);
  const month = civilDate(date);
  const first = view === "month" ? dayNumber(month.year, month.month, 1) : date;
  const start =
    view === "day" ? date : first - ((weekday(first) - preferences.weekStartsOn + 7) % 7);
  const days = useMemo(
    () =>
      Array.from({ length: view === "day" ? 1 : view === "month" ? 42 : 7 }, (_, i) => start + i),
    [start, view],
  );
  const weeks = chunkWeeksForDays(days[0]!, days[days.length - 1]!, zone);
  const { instances, loading, error: weekError } = useCalendarWeeks(weeks);
  const calendars = useMemo(
    () => new Map(directory?.calendars.map((calendar) => [calendar.calendarId, calendar]) ?? []),
    [directory],
  );
  const selectedKey = selected ? `${selected.calendarId}/${selected.eventId}` : null;
  const writable =
    directory?.calendars.filter(
      (calendar) => calendar.accessRole === "owner" || calendar.accessRole === "writer",
    ) ?? [];
  const defaultCalendar = preferences.defaultCalendarId ?? writable[0]?.calendarId;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Calendar could not complete that change.");
    } finally {
      setBusy(false);
    }
  };
  const mutate = async (label: string, work: () => Promise<CalendarMutationResult>) =>
    history.trackMutation(async () => {
      const result = await work();
      history.record({ label, steps: result.undo });
      return result;
    });
  const create = (value: CalendarDraft) => {
    if (canWrite) {
      setSelected(null);
      setDraft(value);
    }
  };
  const newEvent = () =>
    create({
      start: fromZoned(date, 9 * 60, zone),
      end: fromZoned(date, 9 * 60 + preferences.defaultEventMinutes, zone),
      allDay: false,
    });
  const move = (change: CalendarEventChange) => {
    if (!canWrite || busy) return;
    // Recurring changes open the scope selector before touching the provider.
    if (change.instance.seriesId) {
      setSelected(change.instance);
      setDraft(change);
      return;
    }
    void run(async () => {
      await mutate("Moved event", () =>
        change.duplicate
          ? client.create({
              calendarId: change.instance.calendarId,
              title: change.instance.title,
              time: eventTimeInput(change, zone),
            })
          : client.update({
              calendarId: change.instance.calendarId,
              eventId: change.instance.eventId,
              time: eventTimeInput(change, zone),
            }),
      );
    });
  };
  const undo = (redo = false) =>
    void run(async () => {
      const result = await history[redo ? "redo" : "undo"](async (steps) => {
        try {
          return { ok: true, undo: (await client.undo({ steps })).undo };
        } catch (cause) {
          return { ok: false, error: cause };
        }
      });
      if (result._tag === "failed") throw result.error;
    });
  const openFromRoute = useEffectEvent(newEvent);
  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react/set-state-in-effect -- Palette navigation updates the retained calendar view.
    if (subpath === "today") setDate(today);
    else if (subpath === "month" || subpath === "week" || subpath === "day") setView(subpath);
    else if (subpath === "new" && canWrite) openFromRoute();
  }, [active, subpath, today, canWrite]);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- Clear the old event while fetching the newly selected event.
    setDetails(null);
    if (!selected) return;
    let cancelled = false;
    client.getEvent(selected.calendarId, selected.eventId).then(
      (value) => {
        if (!cancelled) setDetails(value);
      },
      (cause) => {
        if (!cancelled) setError(String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, selected]);
  const lastDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const query = new URLSearchParams(window.location.search);
    const calendarId = query.get("calendar");
    const eventId = query.get("event");
    if (!calendarId || !eventId) return;
    const key = `${calendarId}/${eventId}`;
    if (lastDeepLink.current === key) return;
    let cancelled = false;
    client.getEvent(calendarId, eventId).then(
      (event) => {
        if (cancelled) return;
        lastDeepLink.current = key;
        setDate(event.allDay ? Math.floor(event.start / DAY_MS) : zonedDay(event.start, zone));
        setSelected(event);
      },
      (cause) => {
        if (!cancelled) setError(String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, client, zone]);
  const onKeyboard = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.closest("input,textarea,select,[contenteditable=true]") ||
        target.closest("[role=dialog]"))
    )
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo(event.shiftKey);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const action = event.key.toLowerCase();
    if (action === "t") setDate(today);
    else if (action === "w") setView("week");
    else if (action === "d") setView("day");
    else if (action === "m") setView("month");
    else if (action === "j" || action === "k")
      setDate((value) =>
        view === "month"
          ? addMonths(value, action === "j" ? 1 : -1)
          : value + (action === "j" ? 1 : -1) * (view === "day" ? 1 : 7),
      );
    else if (action === "c" && canWrite) newEvent();
    else if (action === "escape") {
      setSelected(null);
      setDraft(null);
    } else return;
    event.preventDefault();
  });
  useEffect(() => {
    if (!active) return;
    document.addEventListener("keydown", onKeyboard);
    return () => document.removeEventListener("keydown", onKeyboard);
  }, [active]);

  useModulePageContext(
    {
      module: "calendar",
      title: `Calendar, ${formatLongDate(days[0]!)} to ${formatLongDate(days[days.length - 1]!)}, time zone ${zone}`,
      refs: selected
        ? [{ kind: "calendar.event", id: selectedKey!, label: selected.title }]
        : (directory?.calendars
            .filter((calendar) => calendar.visible)
            .map((calendar) => ({
              kind: "calendar.calendar",
              id: calendar.calendarId,
              label: calendar.name,
            })) ?? []),
    },
    active,
  );
  const common = {
    instances: preferences.showDeclined
      ? instances
      : instances.filter((instance) => instance.response !== "declined"),
    calendars,
    timeZone: zone,
    preferences,
    today,
    selectedKey,
    onOpenEvent: (event: CalendarEventInstance) => {
      setDraft(null);
      setSelected(event);
    },
    onCreate: create,
    onChangeEvent: move,
  };
  return (
    <div ref={root} className="calendar-module" tabIndex={-1}>
      <header className="calendar-toolbar">
        <h1>
          {view === "month"
            ? new Intl.DateTimeFormat(undefined, {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(date * DAY_MS))
            : formatLongDate(date)}
        </h1>
        <button type="button" onClick={() => setDate(today)}>
          Today
        </button>
        <button
          type="button"
          aria-label="Previous period"
          onClick={() =>
            setDate(view === "month" ? addMonths(date, -1) : date - (view === "day" ? 1 : 7))
          }
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next period"
          onClick={() =>
            setDate(view === "month" ? addMonths(date, 1) : date + (view === "day" ? 1 : 7))
          }
        >
          ›
        </button>
        <select
          aria-label="Calendar view"
          value={view}
          onChange={(event) => setView(event.target.value as typeof view)}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
        <button type="button" disabled={!canWrite || busy || !defaultCalendar} onClick={newEvent}>
          Create event
        </button>
        <button
          type="button"
          disabled={!canWrite || busy || stack.undo.length === 0}
          onClick={() => undo()}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!canWrite || busy || stack.redo.length === 0}
          onClick={() => undo(true)}
        >
          Redo
        </button>
      </header>
      {(error ?? directoryError ?? weekError) && (
        <p role="alert" className="calendar-error">
          {error ?? directoryError ?? weekError}
        </p>
      )}
      <div className="calendar-body">
        <aside className="calendar-sidebar" aria-label="Calendars">
          {directory?.accounts.map((account) => (
            <section key={account.accountId}>
              <h2>{account.email}</h2>
              {account.error && <p role="status">{account.error}</p>}
              {directory.calendars
                .filter((calendar) => calendar.accountId === account.accountId)
                .map((calendar) => (
                  <label key={calendar.calendarId}>
                    <input
                      type="checkbox"
                      checked={calendar.visible}
                      disabled={!canWrite || busy}
                      onChange={(event) =>
                        void run(() =>
                          client.calendar({
                            calendarId: calendar.calendarId,
                            visible: event.target.checked,
                          }),
                        )
                      }
                    />{" "}
                    <span style={{ color: calendar.color }}>●</span> {calendar.name}
                  </label>
                ))}
            </section>
          ))}
          <button type="button" disabled={!canWrite || busy} onClick={() => void run(client.sync)}>
            Sync now
          </button>
          <a href="/settings/calendar">Calendar settings</a>
        </aside>
        <main className="calendar-grid" aria-busy={loading || busy}>
          {!directory ? (
            <p role="status">Loading calendars…</p>
          ) : directory.accounts.length === 0 ? (
            <p>
              Connect Google in <a href="/settings/calendar">Calendar settings</a>, or add demo
              calendars there.
            </p>
          ) : view === "month" ? (
            <MonthGrid
              {...common}
              weeks={Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7))}
              month={month.month}
              onOpenDay={(day) => {
                setDate(day);
                setView("day");
              }}
              onShowMore={(day) => {
                setDate(day);
                setView("day");
              }}
            />
          ) : (
            <TimeGrid
              {...common}
              days={days}
              onOpenDay={(day) => {
                setDate(day);
                setView("day");
              }}
            />
          )}
        </main>
      </div>
      {((!selected && draft) || (selected && details)) && (
        <EventEditor
          key={selectedKey ?? `${draft?.start}`}
          event={details}
          duplicate={draft?.duplicate === true}
          draft={draft}
          timeZone={zone}
          calendars={writable}
          defaultCalendar={defaultCalendar}
          canWrite={canWrite}
          busy={busy}
          onClose={() => {
            setSelected(null);
            setDraft(null);
          }}
          onSave={(input) =>
            void run(async () => {
              await mutate(selected ? "Edited event" : "Created event", () =>
                selected && !draft?.duplicate
                  ? client.update({
                      ...input,
                      calendarId: selected.calendarId,
                      eventId: selected.eventId,
                    })
                  : client.create({
                      ...input,
                      recurrence: draft?.duplicate ? [] : input.recurrence,
                    }),
              );
              setSelected(null);
              setDraft(null);
            })
          }
          onDelete={(scope) =>
            selected &&
            void run(async () => {
              await mutate("Deleted event", () =>
                client.delete({
                  calendarId: selected.calendarId,
                  eventId: selected.eventId,
                  scope,
                }),
              );
              setSelected(null);
            })
          }
          onRespond={(response) =>
            selected &&
            void run(async () => {
              await mutate("Responded to invitation", () =>
                client.respond({
                  calendarId: selected.calendarId,
                  eventId: selected.eventId,
                  response,
                }),
              );
              setSelected(null);
            })
          }
        />
      )}
    </div>
  );
}

function EventEditor({
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
  calendars: ReadonlyArray<{ calendarId: CalendarId; name: string }>;
  defaultCalendar: CalendarId | undefined;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (input: {
    calendarId: CalendarId;
    title: string;
    description: string;
    location: string;
    time: ReturnType<typeof eventTimeInput>;
    scope: CalendarChangeScope;
    attendees: string[];
    recurrence?: string[];
  }) => void;
  onDelete: (scope: CalendarChangeScope) => void;
  onRespond: (response: "accepted" | "declined" | "tentative") => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [guests, setGuests] = useState(
    event?.attendees.map((guest) => guest.email).join(", ") ?? "",
  );
  const [repeat, setRepeat] = useState(event?.recurrence?.length ? "custom" : "none");
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? defaultCalendar);
  const [scope, setScope] = useState<CalendarChangeScope>("this");
  const [allDay, setAllDay] = useState(draft?.allDay ?? event?.allDay === true);
  const fields = draft ?? event;
  const local = (millis: number) => formatZonedIso(millis, timeZone).slice(0, 16);
  const [start, setStart] = useState(
    fields
      ? fields.allDay
        ? `${formatDayNumber(Math.floor(fields.start / DAY_MS))}T00:00`
        : local(fields.start)
      : "",
  );
  const [end, setEnd] = useState(
    fields
      ? fields.allDay
        ? `${formatDayNumber(Math.floor(fields.end / DAY_MS))}T00:00`
        : local(fields.end)
      : "",
  );
  const from = allDay
    ? Date.parse(`${start.slice(0, 10)}T00:00:00Z`)
    : parseInstant(start, timeZone);
  const to = allDay ? Date.parse(`${end.slice(0, 10)}T00:00:00Z`) : parseInstant(end, timeZone);
  const valid =
    calendarId !== undefined &&
    from !== null &&
    to !== null &&
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    to > from;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="calendar-editor-title"
      className="calendar-editor"
    >
      <h2 id="calendar-editor-title">
        {duplicate
          ? "Copy event"
          : event
            ? "Event details"
            : draft
              ? "New event"
              : "Loading event…"}
      </h2>
      <form
        onSubmit={(submit) => {
          submit.preventDefault();
          if (valid && calendarId && from !== null && to !== null)
            onSave({
              calendarId,
              title,
              description,
              location,
              time: eventTimeInput({ start: from, end: to, allDay }, timeZone),
              scope,
              attendees: guests
                .split(/[,\n]/)
                .map((value) => value.trim())
                .filter(Boolean),
              ...(event && (repeat === "custom" || (event.seriesId && scope === "this"))
                ? {}
                : { recurrence: repeat === "none" ? [] : [`RRULE:FREQ=${repeat.toUpperCase()}`] }),
            });
        }}
      >
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canWrite || event?.readOnly}
            autoFocus
          />
        </label>
        <label>
          Calendar
          <select
            value={calendarId ?? ""}
            onChange={(e) => setCalendarId(e.target.value as CalendarId)}
            disabled={event !== null || !canWrite}
          >
            {calendars.map((c) => (
              <option key={c.calendarId} value={c.calendarId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            disabled={!canWrite || event?.readOnly}
          />{" "}
          All day
        </label>
        <label>
          Starts
          <input
            type={allDay ? "date" : "datetime-local"}
            value={allDay ? start.slice(0, 10) : start}
            onChange={(e) => setStart(allDay ? `${e.target.value}T00:00` : e.target.value)}
            disabled={!canWrite || event?.readOnly}
          />
        </label>
        <label>
          Ends{allDay && " (exclusive)"}
          <input
            type={allDay ? "date" : "datetime-local"}
            value={allDay ? end.slice(0, 10) : end}
            onChange={(e) => setEnd(allDay ? `${e.target.value}T00:00` : e.target.value)}
            disabled={!canWrite || event?.readOnly}
          />
        </label>
        <label>
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={!canWrite || event?.readOnly}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canWrite || event?.readOnly}
          />
        </label>
        <label>
          Guests
          <input
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            placeholder="Emails separated by commas"
            disabled={!canWrite || event?.readOnly}
          />
        </label>
        <label>
          Repeats
          <select
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            disabled={
              !canWrite || event?.readOnly || (event?.seriesId !== undefined && scope === "this")
            }
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
            <option value="yearly">Every year</option>
            {event?.recurrence?.length && <option value="custom">Keep current schedule</option>}
          </select>
        </label>
        {event?.seriesId && !duplicate && (
          <label>
            Apply to
            <select value={scope} onChange={(e) => setScope(e.target.value as CalendarChangeScope)}>
              <option value="this">This event</option>
              <option value="following">This and following</option>
              <option value="all">All events</option>
            </select>
          </label>
        )}
        {event?.conference && (
          <a href={event.conference.url} target="_blank" rel="noreferrer">
            Join meeting
          </a>
        )}
        {event?.attendees.map((guest) => (
          <p key={guest.email}>
            {guest.displayName ?? guest.email}: {guest.responseStatus}
          </p>
        ))}
        {event?.canRespond && !duplicate && (
          <div>
            {(["accepted", "tentative", "declined"] as const).map((response) => (
              <button
                key={response}
                type="button"
                disabled={!canWrite || busy}
                onClick={() => onRespond(response)}
              >
                {response}
              </button>
            ))}
          </div>
        )}
        <div className="calendar-editor-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="submit" disabled={!canWrite || busy || !valid || event?.readOnly === true}>
            Save
          </button>
          {event && !duplicate && (
            <button
              type="button"
              disabled={!canWrite || busy || event.readOnly}
              onClick={() => onDelete(scope)}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
