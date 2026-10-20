/** The account RPCs: thin mappings onto `BrowserAccount` and this browser's Google grants. */
import * as Effect from "effect/Effect";

import { BrowserAccount } from "./BrowserAccount.ts";
import { BrowserGoogle } from "./BrowserGoogle.ts";
import { BrowserAccountError, BrowserAccountRpcGroup } from "./contracts.ts";

const failure = (cause: unknown) =>
  new BrowserAccountError({
    reason: "unavailable",
    message: cause instanceof Error ? cause.message : "Could not reach Google. Try again.",
  });

export const layerAccountHandlers = BrowserAccountRpcGroup.toLayer(
  Effect.gen(function* () {
    const account = yield* BrowserAccount;
    const google = yield* BrowserGoogle;
    const withGoogle = <A>(work: () => Promise<A>): Effect.Effect<A, BrowserAccountError> =>
      Effect.tryPromise({ try: work, catch: failure });
    return BrowserAccountRpcGroup.of({
      "browser.account.attach": (credential) => account.attach(credential),
      "browser.account.detach": () => account.detach,
      "browser.account.watch": () => account.changes,
      // Signed out, there are no grants to show or add; the page asks for a sign-in instead.
      "browser.account.connections": () =>
        Effect.andThen(
          account.cloud,
          withGoogle(async () => ({ connections: [...(await google.connections())] })),
        ),
      "browser.account.connect": ({ provider }) =>
        Effect.andThen(
          account.cloud,
          withGoogle(() => google.connect(provider)),
        ),
      "browser.account.disconnect": ({ connectionId }) =>
        withGoogle(() => google.disconnect(connectionId)),
      "browser.account.saveGoogle": (grant) => withGoogle(() => google.save(grant)),
    });
  }),
);
