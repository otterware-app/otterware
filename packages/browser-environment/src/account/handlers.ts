/** The account RPCs: thin mappings onto `BrowserAccount` and its Cloud client. */
import type { OtterCloudClient } from "@otterware/otter-cloud-client";
import * as Effect from "effect/Effect";

import { BrowserAccount, cloudFailure } from "./BrowserAccount.ts";
import { BrowserAccountRpcGroup, type BrowserAccountError } from "./contracts.ts";

export const layerAccountHandlers = BrowserAccountRpcGroup.toLayer(
  Effect.gen(function* () {
    const account = yield* BrowserAccount;
    const withCloud = <A>(
      work: (client: OtterCloudClient) => Promise<A>,
    ): Effect.Effect<A, BrowserAccountError> =>
      Effect.flatMap(account.cloud, ({ client }) =>
        Effect.tryPromise({ try: () => work(client), catch: cloudFailure }),
      );
    return BrowserAccountRpcGroup.of({
      "browser.account.attach": (credential) => account.attach(credential),
      "browser.account.detach": () => account.detach,
      "browser.account.watch": () => account.changes,
      "browser.account.connections": () =>
        Effect.map(
          withCloud((client) => client.connections()),
          (connections) => ({ connections }),
        ),
      "browser.account.connect": ({ provider, scopes, returnTo }) =>
        withCloud((client) => client.connect(provider, scopes, returnTo)),
      "browser.account.disconnect": ({ connectionId }) =>
        withCloud((client) => client.disconnect(connectionId)),
    });
  }),
);
