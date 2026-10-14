/**
 * Client stores for module data (ADR 0020): zustand stores created once per
 * app, so they outlive routes, with an optional persisted slice. `scope` says
 * where the slice belongs (ADR 0011); until an Otter Account syncs it, every
 * scope is kept on this device, which is the documented fallback.
 */
import * as Schema from "effect/Schema";
import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";

import type { ModuleSettingScope } from "../contracts/settings.ts";

export interface PersistedSlice<State, Slice> {
  readonly key: string;
  readonly scope: ModuleSettingScope;
  readonly schema: Schema.Codec<Slice, unknown>;
  readonly pick: (state: State) => Slice;
  readonly restore: (slice: Slice) => Partial<State>;
}

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function readPersisted<Slice>(
  key: string,
  schema: Schema.Codec<Slice, unknown>,
): Slice | null {
  const raw = storage()?.getItem(key);
  if (raw === null || raw === undefined) return null;
  try {
    return Schema.decodeUnknownSync(schema)(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writePersisted<Slice>(
  key: string,
  schema: Schema.Codec<Slice, unknown>,
  value: Slice,
): void {
  try {
    storage()?.setItem(key, JSON.stringify(Schema.encodeSync(schema)(value)));
  } catch {
    // Quota or privacy mode: the in-memory store still works.
  }
}

/**
 * A zustand store whose `persisted` slice is restored on creation and written
 * on every change. Modules use it for caches and preferences that must
 * survive switching apps; the host uses it for rail pins and selections.
 */
export function createClientStore<State extends object, Slice = never>(
  init: StateCreator<State>,
  persisted?: PersistedSlice<State, Slice>,
): UseBoundStore<StoreApi<State>> {
  const store = create<State>(init);
  if (persisted) {
    const restored = readPersisted(persisted.key, persisted.schema);
    if (restored !== null) store.setState(persisted.restore(restored));
    let last = persisted.pick(store.getState());
    store.subscribe((state) => {
      const next = persisted.pick(state);
      if (shallowEqual(next, last)) return;
      last = next;
      writePersisted(persisted.key, persisted.schema, next);
    });
  }
  return store;
}

/** Slices are small records of references; a field-level compare skips idle writes. */
function shallowEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every(
    (key) => (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key],
  );
}
