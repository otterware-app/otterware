import { useNavigate } from "@tanstack/react-router";
import {
  DEFAULT_CALENDAR_PREFERENCES,
  type CalendarEventInstance,
  type CalendarEventDetails,
  type CalendarSearchResult,
  type CalendarMutationResult,
} from "@otterware/calendar-contracts";
import {
  DAY_MS,
  civilDate,
  fromZoned,
  zonedDay,
  toZoned,
  systemTimeZone,
  formatDayNumber,
  parseDayNumber,
} from "@otterware/calendar-contracts/time";
import {
  useModulePageContext,
  useShellSelection,
  type ModulePageProps,
} from "@otterware/module-kit/web";
import { useEffectEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCalendarClient, useCalendarDirectory, useCalendarWeeks } from "./host.tsx";
import { TimeGrid } from "./grid/TimeGrid.tsx";
import { AgendaList } from "./grid/AgendaList.tsx";
import { EventEditor } from "./EventEditor.tsx";
import { monthViewWeeks, timeGridDays, stepAnchor, type CalendarViewKind } from "./runtime/days.ts";
import { calendarCommands } from "./calendarStore";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { CalendarDaysIcon } from "lucide-react";
import { Input } from "~/components/ui/input";
import { useModulePageFrameOverrides } from "../../ModulePageLayout";
import { MonthGrid } from "./grid/MonthGrid.tsx";
import type { CalendarDraft, CalendarEventChange } from "./grid/types.ts";
import { chunkWeeksForDays } from "./runtime/chunks.ts";
import { createCalendarHistory, eventTimeInput } from "./runtime/optimistic.ts";
import { formatLongDate } from "./runtime/format.ts";
import { useMinuteClock } from "./grid/useMinuteClock.ts";
import { useConnectProvider } from "../../account/useConnectProvider";

export default function CalendarPage({
  active,
  subpath,
  projectId,
  search = window.location.search,
}: ModulePageProps & { readonly search?: string }) {
  const client = useCalendarClient();
  const { directory, error: directoryError, canWrite } = useCalendarDirectory();
  const preferences = directory?.preferences ?? DEFAULT_CALENDAR_PREFERENCES;
  const zone = preferences.timeZone ?? systemTimeZone();
  const now = useMinuteClock();
  const today = zonedDay(now, zone);
  const [date, setDate] = useState(
    () => parseDayNumber(new URLSearchParams(search).get("date") ?? "") ?? today,
  );
  const month = civilDate(date);
  const [view, setCurrentView] = useState<CalendarViewKind>("week");
  const navigate = useNavigate();
  const connectGoogle = useConnectProvider();
  const setView = (next: CalendarViewKind) => {
    setCurrentView(next);
    const base = projectId ? `/home/projects/${projectId}/calendar` : "/calendar";
    void navigate({ href: `${base}/${next}` });
  };
  const [selected, setSelected] = useState<CalendarEventInstance | null>(null);
  const [draft, setDraft] = useState<(CalendarDraft & { readonly duplicate?: boolean }) | null>(
    null,
  );
  const [details, setDetails] = useState<CalendarEventDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history] = useState(createCalendarHistory);
  useSyncExternalStore(history.subscribe, history.getState);
  const root = useRef<HTMLDivElement>(null);
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
  const defaultCalendar =
    writable.find((calendar) => calendar.calendarId === preferences.defaultCalendarId)
      ?.calendarId ?? writable[0]?.calendarId;

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
  const newEvent = () => {
    const minutes = Math.ceil(toZoned(now, zone).minutes / 15) * 15;
    create({
      start: fromZoned(date, minutes, zone),
      end: fromZoned(date, minutes + preferences.defaultEventMinutes, zone),
      allDay: false,
    });
  };
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
      setCurrentView(subpath);
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
    const query = new URLSearchParams(search);
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
  }, [active, client, zone, search]);
  const pendingCommand = calendarCommands((state) => state.pending);
  const executeCommand = useEffectEvent((action: string) => {
    if (action === "today") setDate(today);
    else if (["week", "day", "month", "agenda", "custom"].includes(action))
      setView(action as CalendarViewKind);
    else if (action === "next" || action === "previous")
      setDate((value) => stepAnchor(view, value, action === "next" ? 1 : -1, preferences));
    else if (action === "create" && canWrite) newEvent();
    else if (action === "search") setSearchOpen(true);
    else if (action === "goToDate") setGoToDate(true);
    else if (action === "undo") undo();
    else if (action === "redo") undo(true);
    else if (action === "close") {
      setSearchOpen(false);
      setGoToDate(false);
      setSelected(null);
      setDraft(null);
    }
  });
  useEffect(() => {
    if (!active || !pendingCommand) return;
    executeCommand(pendingCommand);
    calendarCommands.setState({ pending: null });
  }, [active, pendingCommand]);
  useEffect(() => {
    if (active) useShellSelection.getState().selectSpace("calendar", view);
  }, [active, view]);
  const frame = useMemo(() => ({ title: formatLongDate(date) }), [date]);
  useModulePageFrameOverrides(frame, active);

  useModulePageContext(
    {
      module: "calendar",
      title: `Calendar, ${formatLongDate(view === "agenda" ? range.from : days[0]!)} to ${formatLongDate(view === "agenda" ? range.to : days[days.length - 1]!)}, time zone ${zone}`,
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
    instances: instances
      .filter(
        (instance) =>
          calendars.get(instance.calendarId)?.visible !== false &&
          (preferences.showDeclined || instance.response !== "declined"),
      )
      .map((instance) =>
        calendars.get(instance.calendarId)?.watchOnly ? { ...instance, watchOnly: true } : instance,
      ),
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
    <div
      ref={root}
      className="relative flex h-full min-h-0 flex-col bg-background text-foreground"
      tabIndex={-1}
    >
      {goToDate && (
        <label className="flex items-center gap-3 px-4 py-3">
          Go to date
          <Input
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
      <section
        className="border-b border-border px-4 py-3"
        hidden={!searchOpen}
        aria-label="Search all calendars"
      >
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
          <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
            Search all calendars
            <Input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, location or description"
            />
          </label>
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? "Searching…" : "Search"}
          </Button>
          <Button type="button" onClick={() => setSearchOpen(false)}>
            Close search
          </Button>
        </form>
        {searchResult && (
          <div className="mt-3 grid max-h-72 overflow-y-auto">
            {searchResult.results.map((event) => (
              <Button
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
              </Button>
            ))}
            {searchResult.results.length === 0 && <p role="status">No matching events.</p>}
          </div>
        )}
      </section>
      {(error ?? directoryError ?? weekError) && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error ?? directoryError ?? weekError}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col" aria-busy={loading || busy}>
          {!directory ? (
            <p role="status" className="sr-only">
              Loading calendars…
            </p>
          ) : directory.accounts.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarDaysIcon />
                </EmptyMedia>
                <EmptyTitle>No calendars yet</EmptyTitle>
                <EmptyDescription>
                  The Google accounts linked to your Otter Account show up here, on every device.
                  Each device authorizes them once.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  size="sm"
                  onClick={() =>
                    void connectGoogle("google").catch((cause: unknown) =>
                      setError(
                        cause instanceof Error ? cause.message : "Could not open Google sign-in.",
                      ),
                    )
                  }
                >
                  Link Google account
                </Button>
              </EmptyContent>
            </Empty>
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
      {active && ((!selected && draft) || (selected && details)) && (
        <EventEditor
          key={`${selectedKey ?? "new"}:${draft ? `${draft.start}:${draft.end}:${draft.allDay}:${draft.duplicate ?? false}` : "details"}`}
          surface={root}
          event={details}
          duplicate={draft?.duplicate === true}
          draft={draft}
          timeZone={zone}
          hourFormat={preferences.hourFormat}
          weekStartsOn={preferences.weekStartsOn}
          calendars={directory?.calendars ?? []}
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
