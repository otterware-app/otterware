import {
  DEFAULT_CALENDAR_PREFERENCES,
  type CalendarEventInstance,
  type CalendarEventDetails,
  type CalendarSearchResult,
  type CalendarMutationResult,
} from "@otterware/calendar-contracts";
import {
  DAY_MS,
  fromZoned,
  zonedDay,
  systemTimeZone,
  civilDate,
  formatDayNumber,
  parseDayNumber,
} from "@otterware/calendar-contracts/time";
import { useModulePageContext, type ModulePageProps } from "@otterware/module-kit/web";
import { useEffectEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCalendarClient, useCalendarDirectory, useCalendarWeeks } from "./host.tsx";
import { TimeGrid } from "./grid/TimeGrid.tsx";
import { AgendaList } from "./grid/AgendaList.tsx";
import { EventEditor } from "./EventEditor.tsx";
import { monthViewWeeks, timeGridDays, stepAnchor, type CalendarViewKind } from "./runtime/days.ts";
import { shortcutAction } from "./runtime/shortcuts.ts";
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
  const [view, setView] = useState<CalendarViewKind>("week");
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
  const [agendaRange, setAgendaRange] = useState({ anchor: date, from: date, to: date + 42 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<CalendarSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchSequence = useRef(0);
  useEffect(() => {
    if (active && searchOpen) searchInput.current?.focus();
  }, [active, searchOpen]);
  const [goToDate, setGoToDate] = useState(false);
  const monthWeeks = useMemo(
    () => monthViewWeeks(date, preferences.weekStartsOn, preferences.showWeekends),
    [date, preferences.weekStartsOn, preferences.showWeekends],
  );
  const days = useMemo(
    () =>
      view === "month"
        ? monthWeeks.flat()
        : view === "agenda"
          ? [date, date + 42]
          : timeGridDays(view, date, preferences),
    [view, date, monthWeeks, preferences],
  );
  const range = agendaRange.anchor === date ? agendaRange : { from: date, to: date + 42 };
  const weeks = chunkWeeksForDays(
    view === "agenda" ? range.from : days[0]!,
    view === "agenda" ? range.to : days[days.length - 1]!,
    zone,
  );
  const { instances, loading, error: weekError } = useCalendarWeeks(active ? weeks : []);
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
    else if (
      subpath === "month" ||
      subpath === "week" ||
      subpath === "day" ||
      subpath === "custom" ||
      subpath === "agenda"
    )
      setView(subpath);
    else if (subpath === "search") {
      setSearchOpen(true);
      searchInput.current?.focus();
    } else if (subpath === "new" && canWrite) openFromRoute();
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
        target.closest("dialog,[role=dialog]"))
    )
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo(event.shiftKey);
      return;
    }
    const action = shortcutAction(event, preferences.shortcuts);
    if (action === "today") setDate(today);
    else if (
      action === "week" ||
      action === "day" ||
      action === "month" ||
      action === "agenda" ||
      action === "custom"
    )
      setView(action);
    else if (action === "next" || action === "previous")
      setDate((value) => stepAnchor(view, value, action === "next" ? 1 : -1, preferences));
    else if (action === "create" && canWrite) newEvent();
    else if (action === "search") {
      setSearchOpen(true);
      searchInput.current?.focus();
    } else if (action === "goToDate") setGoToDate(true);
    else if (event.key === "Escape") {
      setSearchOpen(false);
      setGoToDate(false);
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
          onClick={() => setDate(stepAnchor(view, date, -1, preferences))}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next period"
          onClick={() => setDate(stepAnchor(view, date, 1, preferences))}
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
          <option value="custom">{preferences.customDays} days</option>
          <option value="agenda">Agenda</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setSearchOpen((value) => !value);
            searchInput.current?.focus();
          }}
        >
          Search events
        </button>
        <button type="button" onClick={() => setGoToDate((value) => !value)}>
          Go to date
        </button>
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
      {goToDate && (
        <label className="calendar-date-jump">
          Go to date
          <input
            type="date"
            value={formatDayNumber(date)}
            onChange={(event) => {
              const day = parseDayNumber(event.target.value);
              if (day !== null) {
                setDate(day);
                setGoToDate(false);
              }
            }}
          />
        </label>
      )}
      <section className="calendar-search" hidden={!searchOpen} aria-label="Search all calendars">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const sequence = ++searchSequence.current;
            setSearching(true);
            setError(null);
            client
              .search({ query: query.trim(), limit: 100 })
              .then(
                (result) => {
                  if (sequence === searchSequence.current) setSearchResult(result);
                },
                (cause) => {
                  if (sequence === searchSequence.current) setError(String(cause));
                },
              )
              .finally(() => {
                if (sequence === searchSequence.current) setSearching(false);
              });
          }}
        >
          <label>
            Search all calendars
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, location, description or guest"
            />
          </label>
          <button type="submit" disabled={searching || !query.trim()}>
            {searching ? "Searching…" : "Search"}
          </button>
          <button type="button" onClick={() => setSearchOpen(false)}>
            Close search
          </button>
        </form>
        {searchResult && (
          <div className="calendar-search-results">
            {searchResult.results.map((event) => (
              <button
                type="button"
                key={`${event.calendarId}/${event.eventId}`}
                onClick={() => {
                  setDate(
                    event.allDay ? Math.floor(event.start / DAY_MS) : zonedDay(event.start, zone),
                  );
                  setSelected(event);
                  setSearchOpen(false);
                }}
              >
                <strong>{event.title || "Untitled event"}</strong>
                <span>
                  {formatLongDate(
                    event.allDay ? Math.floor(event.start / DAY_MS) : zonedDay(event.start, zone),
                  )}{" "}
                  · {calendars.get(event.calendarId)?.name}
                </span>
              </button>
            ))}
            {searchResult.results.length === 0 && <p role="status">No matching events.</p>}
          </div>
        )}
      </section>
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
              weeks={monthWeeks}
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
          ) : view === "agenda" ? (
            <AgendaList
              {...common}
              anchorDay={date}
              onNeedRange={(from, to) =>
                setAgendaRange((previous) =>
                  previous.anchor === date && previous.from === from && previous.to === to
                    ? previous
                    : { anchor: date, from, to },
                )
              }
              onOpenDay={(day) => {
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
              await mutate("eventId" in input ? "Edited event" : "Created event", () =>
                "eventId" in input ? client.update(input) : client.create(input),
              );
              setSelected(null);
              setDraft(null);
            })
          }
          onDelete={(scope, sendUpdates) =>
            selected &&
            void run(async () => {
              await mutate("Deleted event", () =>
                client.delete({
                  calendarId: selected.calendarId,
                  eventId: selected.eventId,
                  scope,
                  sendUpdates,
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
