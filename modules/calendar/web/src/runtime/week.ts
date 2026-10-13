import type { CalendarEventInstance, CalendarWeekEvent } from "@otterware/calendar-contracts";
import { instanceKey, sameInstance } from "./days.ts";
/** Instances of one or more week chunks by `calendarEventKey`. */
export type CalendarInstanceMap = ReadonlyMap<string, CalendarEventInstance>;

export const EMPTY_CALENDAR_INSTANCES: CalendarInstanceMap = new Map();
const EMPTY_CALENDAR_INSTANCE_LIST: ReadonlyArray<CalendarEventInstance> = [];

/** Puts `instances` into `next`, reusing the existing object when nothing changed. */
function upsertInto(
  next: Map<string, CalendarEventInstance>,
  current: CalendarInstanceMap,
  instances: ReadonlyArray<CalendarEventInstance>,
): boolean {
  let changed = false;
  for (const instance of instances) {
    const key = instanceKey(instance);
    const existing = current.get(key);
    if (existing !== undefined && sameInstance(existing, instance)) {
      if (next.get(key) !== existing) {
        next.set(key, existing);
        changed = true;
      }
      continue;
    }
    next.set(key, instance);
    changed = true;
  }
  return changed;
}

function sameEntries(left: CalendarInstanceMap, right: CalendarInstanceMap): boolean {
  if (left.size !== right.size) return false;
  for (const [key, instance] of left) {
    if (right.get(key) !== instance) return false;
  }
  return true;
}

/**
 * Applies one week-chunk event. Returns `current` itself when the event changes nothing (a
 * snapshot equal to what is shown, an upsert of an unchanged instance, a removal of unknown keys).
 */
export function applyCalendarWeekEvent(
  current: CalendarInstanceMap,
  event: CalendarWeekEvent,
): CalendarInstanceMap {
  switch (event._tag) {
    case "snapshot": {
      const next = new Map<string, CalendarEventInstance>();
      upsertInto(next, current, event.instances);
      if (sameEntries(next, current)) return current;
      return next.size === 0 ? EMPTY_CALENDAR_INSTANCES : next;
    }
    case "upserted": {
      const next = new Map(current);
      return upsertInto(next, current, event.instances) ? next : current;
    }
    case "removed": {
      if (!event.keys.some((key) => current.has(key))) return current;
      const next = new Map(current);
      for (const key of event.keys) next.delete(key);
      return next;
    }
    case "calendarReplaced": {
      const next = new Map<string, CalendarEventInstance>();
      for (const [key, instance] of current) {
        if (instance.calendarId !== event.calendarId) next.set(key, instance);
      }
      upsertInto(next, current, event.instances);
      return sameEntries(next, current) ? current : next;
    }
  }
}

/**
 * Every instance of the given chunks once, in chunk order. Chunks overlap on events that span
 * a week boundary; the first chunk's copy wins.
 */
export function mergeCalendarChunks(
  chunks: ReadonlyArray<CalendarInstanceMap>,
): ReadonlyArray<CalendarEventInstance> {
  if (chunks.length === 0) return EMPTY_CALENDAR_INSTANCE_LIST;
  if (chunks.length === 1) {
    const only = chunks[0]!;
    return only.size === 0 ? EMPTY_CALENDAR_INSTANCE_LIST : [...only.values()];
  }
  const seen = new Set<string>();
  const merged: CalendarEventInstance[] = [];
  for (const chunk of chunks) {
    for (const [key, instance] of chunk) {
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(instance);
    }
  }
  return merged.length === 0 ? EMPTY_CALENDAR_INSTANCE_LIST : merged;
}
