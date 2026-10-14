import type { CalendarWebClient } from "./host";
import { CalendarDirectory, CalendarEventInstance } from "@otterware/calendar-contracts";
import { createClientStore } from "@otterware/module-kit/web";
import * as Schema from "effect/Schema";

const Cache = Schema.Struct({
  directory: Schema.NullOr(CalendarDirectory),
  weeks: Schema.Array(Schema.String),
  ranges: Schema.Record(Schema.String, Schema.Array(CalendarEventInstance)),
});
type Cache = typeof Cache.Type;
const Persisted = Schema.Record(Schema.String, Cache);
const empty: Cache = { directory: null, weeks: [], ranges: {} };

export const useCalendarStore = createClientStore<
  {
    caches: Record<string, Cache>;
    transport: CalendarWebClient | null;
    environment: string | null;
    canWrite: boolean;
    loading: boolean;
    error: string | null;
  },
  typeof Persisted.Type
>(
  () => ({
    caches: {},
    transport: null,
    environment: null,
    canWrite: false,
    loading: true,
    error: null,
  }),
  {
    key: "otterware.calendar.cache",
    scope: "client",
    schema: Persisted,
    pick: (state) => state.caches,
    restore: (caches) => ({ caches }),
  },
);
export const calendarCache = (environment: string | null) =>
  environment ? (useCalendarStore.getState().caches[environment] ?? empty) : empty;
export function setCalendarCache(environment: string, patch: Partial<Cache>) {
  useCalendarStore.setState((state) => ({
    caches: {
      ...state.caches,
      [environment]: { ...(state.caches[environment] ?? empty), ...patch },
    },
  }));
}
export const calendarCommands = createClientStore<{ pending: string | null }>(() => ({
  pending: null,
}));
export function runCalendarCommand(command: string) {
  calendarCommands.setState({ pending: command });
}

export function cacheCalendarRange(
  environment: string,
  weeks: readonly string[],
  instances: readonly CalendarEventInstance[],
) {
  const key = JSON.stringify(weeks);
  const previous = calendarCache(environment).ranges;
  const ranges = Object.fromEntries([
    ...Object.entries(previous)
      .filter(([range]) => range !== key)
      .slice(-15),
    [key, instances],
  ]);
  setCalendarCache(environment, { ranges });
}
