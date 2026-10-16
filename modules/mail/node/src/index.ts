import { MailModule, MailRuntime } from "@otterware/mail-engine/module";
import { MailError, type MailEvent } from "@otterware/mail-contracts/rpc";
import { MAIL_STORAGE_SCHEMA } from "@otterware/mail-engine/storage";
import { OtterAccountSession } from "@otterware/module-kit/account";
import * as Option from "effect/Option";
import { workerLifecycle } from "./workerLifecycle.ts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import { openMailWorker, type MailNodeOptions } from "./runtime.ts";

export { openMailWorker, type MailNodeOptions, type MailHost } from "./runtime.ts";
export type { OtterAccountSession } from "@otterware/mail-engine/account-session";

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
      const accountService = yield* Effect.serviceOption(OtterAccountSession);
      const account = Option.getOrUndefined(accountService);
      const events = yield* PubSub.unbounded<MailEvent>();
      yield* Effect.addFinalizer(() => PubSub.shutdown(events));
      const worker = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            workerLifecycle(
              () => {
                const session = account?.providerAccount();
                return openMailWorker({ ...options, ...(session ? { session } : {}) }, (event) =>
                  Effect.runSync(PubSub.publish(events, event)),
                );
              },
              (changed) => account?.subscribe(changed) ?? (() => {}),
              () =>
                Effect.runSync(
                  PubSub.publish(events, { channel: "gmail:accounts-changed", params: null }),
                ),
            ),
          catch: error("start"),
        }),
        (worker) => Effect.promise(() => worker.close()),
      );
      return {
        call: (operation: string, input: unknown) =>
          Effect.tryPromise({
            try: async (signal) => (await worker.current()).call(operation, input, signal),
            catch: error(operation),
          }),
        runTool: (
          name: string,
          input: unknown,
          caller: Parameters<Awaited<ReturnType<typeof openMailWorker>>["runTool"]>[2],
        ) =>
          Effect.tryPromise({
            try: async (signal) => (await worker.current()).runTool(name, input, caller, signal),
            catch: error(name),
          }),
        events: Stream.fromPubSub(events),
      };
    }),
  ),
});
