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
      // Host messages are written for people and carry no credentials.
      catch: (cause) =>
        new AccountSessionError({
          message:
            cause instanceof Error
              ? cause.message
              : "Could not connect to your Otter Account. Sign in again or check this environment's connection.",
        }),
    });
  /** Provider grants belong to this device, not to Cloud; headless servers have none (VMs deferred). */
  const device = (host: OtterAccountSession["Service"]) => {
    const account = host.providerAccount();
    if (!account)
      throw new Error(
        host.current()
          ? "Google can't be connected on this environment yet."
          : host.status().followsApp
            ? "Sign in to this app with your Otter Account first."
            : "Sign this environment in to your Otter Account first.",
      );
    return account;
  };
  return AccountRpcGroup.of({
    "account.session.state": () =>
      call(async (host) => {
        const account = host.current();
        return {
          accountId: account?.accountId ?? null,
          email: account?.email ?? null,
          ...host.status(),
        };
      }),
    "account.session.signIn": () => call((host) => host.signIn()),
    "account.session.signOut": () => call((host) => host.signOut()),
    "account.session.useAppAccount": ({ accessToken }) =>
      call((host) => host.useAppAccount(accessToken)),
    "account.connections.list": () =>
      call(async (host) => [...(await (host.providerAccount()?.connections() ?? []))]),
    "account.connections.connect": ({ provider }) => call((host) => device(host).connect(provider)),
    "account.connections.disconnect": ({ connectionId }) =>
      call((host) => device(host).disconnect(connectionId)),
  });
});
