import { MailError, type MailEvent } from "@otterware/mail-contracts/rpc";
import type { ModuleToolCallerScope } from "@otterware/module-kit/engine";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

/** Supplied by the environment worker or browser worker. No channel tunnel crosses the client wire. */
export class MailRuntime extends Context.Service<
  MailRuntime,
  {
    readonly call: (operation: string, input: unknown) => Effect.Effect<unknown, MailError>;
    readonly runTool: (
      name: string,
      input: unknown,
      caller: ModuleToolCallerScope,
    ) => Effect.Effect<unknown, MailError>;
    readonly events: Stream.Stream<MailEvent, MailError>;
  }
>()("@otterware/mail/MailRuntime") {}
