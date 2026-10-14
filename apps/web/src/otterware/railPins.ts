/**
 * Pins on the rail (ADR 0020): any module space or sidebar row the user wants
 * one click away. Account scope (ADR 0011): kept on this device until the
 * Otter Account syncs client preferences, the documented fallback.
 */
import { createClientStore } from "@otterware/module-kit/web";
import type { ContextMenuItem } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const RailPin = Schema.Struct({
  id: Schema.String,
  module: Schema.String,
  kind: Schema.Literals(["space", "row"]),
  label: Schema.String,
  href: Schema.String,
  /** The space a pinned space selects; rows keep the module's current space. */
  spaceId: Schema.optional(Schema.String),
});
export type RailPin = typeof RailPin.Type;

const PersistedPins = Schema.Struct({ pins: Schema.Array(RailPin) });

interface RailPinsState {
  readonly pins: ReadonlyArray<RailPin>;
  readonly pin: (pin: RailPin) => void;
  readonly unpin: (id: string) => void;
}

export const useRailPins = createClientStore<RailPinsState, typeof PersistedPins.Type>(
  (set) => ({
    pins: [],
    pin: (pin) =>
      set((state) => ({
        pins: state.pins.some((entry) => entry.id === pin.id) ? state.pins : [...state.pins, pin],
      })),
    unpin: (id) => set((state) => ({ pins: state.pins.filter((entry) => entry.id !== id) })),
  }),
  {
    key: "otterware:rail-pins:v1",
    scope: "account",
    schema: PersistedPins,
    pick: (state) => ({ pins: state.pins }),
    restore: (slice) => ({ pins: slice.pins }),
  },
);

export const railPinId = (module: string, kind: RailPin["kind"], id: string) =>
  `${module}:${kind}:${id}`;

export type PinMenuAction = "pin" | "unpin";

/** The "Pin to rail" / "Unpin" entry of a context menu, for the current pin state. */
export function pinMenuItem(pinned: boolean): ContextMenuItem<PinMenuAction> {
  return pinned ? { id: "unpin", label: "Unpin from rail" } : { id: "pin", label: "Pin to rail" };
}

/** Applies a pin menu choice; a no-op for other actions. */
export function applyPinMenuAction(action: string | null, pin: RailPin): void {
  const store = useRailPins.getState();
  if (action === "pin") store.pin(pin);
  else if (action === "unpin") store.unpin(pin.id);
}
