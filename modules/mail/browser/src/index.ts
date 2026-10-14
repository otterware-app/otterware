/**
 * Mail in the in-browser environment (ADR 0008): the Mail module with its
 * engine in a browser worker instead of a Node one. The environment worker
 * supplies `MailBrowserHost` (the signed-in Otter Account, if any, when the
 * module starts; it restarts the module when the account changes) and
 * `MailPage`, through which the page opens files, notifies and badges
 * (README.md).
 */
import { MailError, type MailEvent } from "@otterware/mail-contracts/rpc";
import { MailModule, MailRuntime } from "@otterware/mail-engine/module";
import { defineServerModule } from "@otterware/module-kit/engine";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import { MailPage } from "./page.ts";
import { type MailBrowserAccount, openMailWorker } from "./runtime.ts";

export type { MailBrowserAccount } from "./runtime.ts";
export {
  layerMailPage,
  layerMailPageHandlers,
  MAIL_PAGE_METHODS,
  MailPage,
  MailPageRpcGroup,
  type MailPageAnswer,
  type MailPageRequest,
} from "./page.ts";

export class MailBrowserHost extends Context.Service<
  MailBrowserHost,
  {
    /** The signed-in account when the module starts; none while signed out. */
    readonly account: Effect.Effect<Option.Option<MailBrowserAccount>>;
  }
>()("@otterware/mail-browser/MailBrowserHost") {}

const error = (operation: string) => (cause: unknown) =>
  new MailError({ operation, message: cause instanceof Error ? cause.message : String(cause) });

export const mailBrowserModule = defineServerModule({
  ...MailModule,
  migrations: [],
  layer: Layer.effect(
    MailRuntime,
    Effect.gen(function* () {
      const host = yield* MailBrowserHost;
      const page = yield* MailPage;
      const account = Option.getOrUndefined(yield* host.account);
      const events = yield* PubSub.unbounded<MailEvent>();
      yield* Effect.addFinalizer(() => PubSub.shutdown(events));
      const worker = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            openMailWorker(account, (event) => Effect.runSync(PubSub.publish(events, event)), page),
          catch: error("start"),
        }),
        (worker) => Effect.sync(() => worker.close()),
      );
      return MailRuntime.of({
        call: (operation, input) =>
          Effect.tryPromise({
            try: (signal) => worker.call(operation, input, signal),
            catch: error(operation),
          }),
        runTool: (name, input, caller) =>
          Effect.tryPromise({
            try: (signal) => worker.runTool(name, input, caller, signal),
            catch: error(name),
          }),
        events: Stream.fromPubSub(events),
      });
    }),
  ),
});
