import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { OtterAccountSession } from "../account/index.ts";
import { AccountRpcGroup, AccountSessionError } from "../contracts/account.ts";

/** Credentials enter only this host boundary; modules receive the scoped account service. */
export const accountHandlers = Effect.gen(function* () {
  const service = yield* Effect.serviceOption(OtterAccountSession);
  const call = <A>(run: (session: OtterAccountSession["Service"]) => Promise<A>) =>
    Effect.tryPromise({
      try: () => {
        if (Option.isNone(service)) throw new Error("Account services are unavailable.");
        return run(service.value);
      },
      catch: () =>
        new AccountSessionError({
          message:
            "Could not connect to your Otter Account. Sign in again or check this environment's connection.",
        }),
    });
  const connected = (host: OtterAccountSession["Service"]) => {
    const account = host.current();
    if (!account) throw new Error("Sign in to your Otter Account.");
    return account;
  };
  return AccountRpcGroup.of({
    "account.session.attach": ({ accessToken }) =>
      call(async (host) => ({ accountId: await host.attach(accessToken) })),
    "account.session.detach": () => call((host) => host.detach()),
    "account.session.state": () =>
      call(async (host) => ({ accountId: host.current()?.accountId ?? null })),
    "account.connections.list": () => call((host) => connected(host).connections()),
    "account.connections.connect": ({ provider, scopes, returnTo }) =>
      call((host) => connected(host).client.connect(provider, scopes, returnTo)),
    "account.connections.disconnect": ({ connectionId }) =>
      call(async (host) => {
        await connected(host).client.disconnect(connectionId);
      }),
  });
});
