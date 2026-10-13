// @effect-diagnostics globalFetch:off -- The Cloud client is promise-based and takes the runtime's fetch.
/**
 * Home's account data sync on an environment (ADR 0019): the environment's
 * existing Account login, exchanged for a Cloud client bound to
 * `home:<environment>`. Without a login Home stays local. Changes from other
 * devices arrive by Home's periodic pull until the environment channel
 * (ADR 0018) carries `sync.changed` here.
 */
import { HomeAccount } from "@otterware/composition/server";
import { AccountSessions } from "@otterware/otter-cloud-client/session";
import { OTTER_ACCOUNTS_URL } from "@t3tools/shared/otterAccounts";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { CloudCliTokenManager } from "../cloud/CliTokenManager.ts";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";

export const layer = Layer.effect(
  HomeAccount,
  Effect.gen(function* () {
    const manager = yield* Effect.serviceOption(CloudCliTokenManager);
    const environment = yield* Effect.serviceOption(ServerEnvironment);
    const accountsUrl = yield* Config.String("T3CODE_ACCOUNTS_URL").pipe(
      Config.withDefault(OTTER_ACCOUNTS_URL),
    );
    const cloudOrigin = yield* Config.String("OTTERWARE_CLOUD_ORIGIN").pipe(
      Config.withDefault("https://cloud.otterware.app"),
    );
    const sessions = new AccountSessions({ fetch: globalThis.fetch });
    const current = Effect.gen(function* () {
      if (Option.isNone(manager) || Option.isNone(environment)) return Option.none();
      const saved = yield* manager.value.getExisting.pipe(
        Effect.option,
        Effect.map(Option.flatten),
      );
      const environmentId = yield* environment.value.getEnvironmentId;
      const cloud = yield* Effect.tryPromise(() =>
        sessions.current(
          Option.isNone(saved)
            ? null
            : {
                oauthToken: saved.value.accessToken,
                accountsUrl,
                cloudOrigin,
                audience: `home:${environmentId}`,
              },
        ),
      ).pipe(Effect.orElseSucceed(() => null));
      return Option.map(Option.fromNullishOr(cloud), ({ accountId, client }) => ({
        accountId,
        push: (records: Parameters<typeof client.push>[0]) => client.push(records),
        pull: (cursor: number) => client.pull(cursor),
      }));
    });
    return HomeAccount.of({ current, changes: Stream.never });
  }),
);
