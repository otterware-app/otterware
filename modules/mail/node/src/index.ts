import { MailModule, MailRuntime } from "@otterware/mail-engine/module";
import { MailError, type MailEvent } from "@otterware/mail-contracts/rpc";
import { MAIL_STORAGE_SCHEMA } from "@otterware/mail-engine/storage";
import * as Context from "effect/Context";
import type { MailHost } from "./runtime.ts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import { openMailWorker, type MailNodeOptions } from "./runtime.ts";

export { openMailWorker, type MailNodeOptions, type MailHost } from "./runtime.ts";
export type { OtterAccountSession } from "@otterware/mail-engine/account-session";

/** Mail-local host seam while module-kit grows shared account and desktop ports. */
export const MailHostContext = Context.Reference<MailHost>("@otterware/mail/Host", {
  defaultValue: () => ({}),
});

const error = (operation: string) => (cause: unknown) =>
  new MailError({ operation, message: cause instanceof Error ? cause.message : String(cause) });
export const mailNodeModule = (options: MailNodeOptions) => ({
  ...MailModule,
  migrations: [
    {
      module: "mail",
      id: 1,
      name: "mail-storage-and-import",
      run: Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        for (const statement of MAIL_STORAGE_SCHEMA.split(";").filter((s) => s.trim()))
          yield* sql.unsafe(statement);
      }),
    },
  ],
  layer: Layer.effect(
    MailRuntime,
    Effect.gen(function* () {
      const host = yield* MailHostContext;
      const events = yield* PubSub.unbounded<MailEvent>();
      yield* Effect.addFinalizer(() => PubSub.shutdown(events));
      const worker = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            openMailWorker({ ...host, ...options }, (event) =>
              Effect.runSync(PubSub.publish(events, event)),
            ),
          catch: error("start"),
        }),
        (worker) => Effect.promise(() => worker.close()),
      );
      return {
        call: (operation: string, input: unknown) =>
          Effect.tryPromise({
            try: (signal) => worker.call(operation, input, signal),
            catch: error(operation),
          }),
        runTool: (name: string, input: unknown, caller: Parameters<typeof worker.runTool>[2]) =>
          Effect.tryPromise({
            try: (signal) => worker.runTool(name, input, caller, signal),
            catch: error(name),
          }),
        events: Stream.fromPubSub(events),
      };
    }),
  ),
});
