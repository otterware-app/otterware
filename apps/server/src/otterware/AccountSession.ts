import { makeOtterAccountSession, OtterAccountSession } from "@otterware/module-kit/account";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ServerSecretStore } from "../auth/ServerSecretStore.ts";
import { ServerEnvironmentIdentity, layerIdentity } from "../environment/ServerEnvironment.ts";
import { OTTER_ACCOUNTS_URL } from "@t3tools/shared/otterAccounts";

const SECRET = "otterware-account-session";
/** The environment keeps the suite grant in its secret store, never in module databases. */
export const layer = Layer.effect(
  OtterAccountSession,
  Effect.gen(function* () {
    const secrets = yield* ServerSecretStore;
    const identity = yield* ServerEnvironmentIdentity;
    const audience = `environment:${yield* identity.getEnvironmentId}`;
    const accountsUrl = yield* Config.String("T3CODE_ACCOUNTS_URL").pipe(
      Config.withDefault(OTTER_ACCOUNTS_URL),
    );
    const cloudOrigin = yield* Config.String("OTTERWARE_CLOUD_ORIGIN").pipe(
      Config.withDefault("https://cloud.otterware.app"),
    );
    const host = yield* Effect.acquireRelease(
      Effect.tryPromise(() =>
        makeOtterAccountSession({
          accountsUrl,
          cloudOrigin,
          audience,
          storage: {
            read: async () => {
              const saved = await Effect.runPromise(secrets.get(SECRET));
              if (Option.isNone(saved)) return null;
              try {
                return JSON.parse(new TextDecoder().decode(saved.value)) as unknown;
              } catch {
                return null;
              }
            },
            write: (value) =>
              Effect.runPromise(
                value === null
                  ? secrets.remove(SECRET)
                  : secrets.set(SECRET, new TextEncoder().encode(JSON.stringify(value))),
              ),
          },
        }),
      ),
      (host) => Effect.sync(host.close),
    );
    return host.service;
  }),
).pipe(Layer.provide(layerIdentity));
