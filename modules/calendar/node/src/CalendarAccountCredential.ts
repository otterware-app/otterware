import type { CalendarAccountCredential } from "@otterware/calendar-engine";
import type { CalendarError } from "@otterware/calendar-contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

/** Host-only credential port. Engines consume account-held provider connections, never host storage. */
export class CalendarAccountCredentialHost extends Context.Service<
  CalendarAccountCredentialHost,
  {
    readonly read: Effect.Effect<Option.Option<CalendarAccountCredential>, CalendarError>;
  }
>()("@otterware/calendar-node/CalendarAccountCredential/CalendarAccountCredentialHost") {}
