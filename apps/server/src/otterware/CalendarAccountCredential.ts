import { CalendarAccountCredentialHost } from "@otterware/calendar-node";
import { CalendarError } from "@otterware/calendar-contracts";
import { OTTER_ACCOUNTS_URL } from "@t3tools/shared/otterAccounts";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { CloudCliTokenManager } from "../cloud/CliTokenManager.ts";

/** Uses the environment's existing Account login; connecting a renderer does not change it. */
export const layer = Layer.effect(
  CalendarAccountCredentialHost,
  Effect.gen(function* () {
    const manager = yield* Effect.serviceOption(CloudCliTokenManager);
    const environment = yield* Effect.serviceOption(ServerEnvironment);
    const accountsUrl = yield* Config.String("T3CODE_ACCOUNTS_URL").pipe(
      Config.withDefault(OTTER_ACCOUNTS_URL),
    );
    const cloudOrigin = yield* Config.String("OTTERWARE_CLOUD_ORIGIN").pipe(
      Config.withDefault("https://cloud.otterware.app"),
    );
    return {
      read: Effect.gen(function* () {
        if (Option.isNone(manager) || Option.isNone(environment)) return Option.none();
        const saved = yield* manager.value.getExisting.pipe(
          Effect.mapError(
            () =>
              new CalendarError({
                code: "signed_out",
                detail: "Sign in to Otter Accounts on this environment again.",
              }),
          ),
        );
        const environmentId = yield* environment.value.getEnvironmentId;
        return Option.map(saved, (credential) => ({
          oauthToken: credential.accessToken,
          accountsUrl,
          cloudOrigin,
          audience: `calendar:${environmentId}`,
        }));
      }),
    };
  }),
);
