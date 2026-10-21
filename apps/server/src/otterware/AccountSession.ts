import {
  appLogin,
  makeOtterAccountSession,
  OtterAccountSession,
  type EnvironmentLogin,
} from "@otterware/module-kit/account";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { ServerEnvironmentIdentity, layerIdentity } from "../environment/ServerEnvironment.ts";
import { OTTER_ACCOUNTS_URL } from "@t3tools/shared/otterAccounts";
import * as ServerConfig from "../config.ts";
import {
  CloudCliTokenManager,
  deviceAuthorizationLogin,
  type DeviceAuthorizationPrompt,
} from "../cloud/CliTokenManager.ts";
import { cloudCliOAuthConfig } from "../cloud/publicConfig.ts";
import * as DeviceGoogle from "./DeviceGoogle.ts";

const signedOut: EnvironmentLogin = {
  accessToken: async () => null,
  signIn: () => Promise.reject(new Error("This environment cannot sign in to an Otter Account.")),
  signOut: async () => {},
};

/**
 * The environment's Otter Account, which every module and Home use. A desktop app's built-in
 * environment uses the account the app is signed in to (`appLogin`): same machine, same person,
 * no separate sign-in. Any other environment signs in itself (the login Code's relay link uses),
 * kept and renewed in the server secret store, and keeps working when a client signs out.
 * Provider grants are separate: Google is connected on this device only (`DeviceGoogle`).
 */
export const layer = Layer.effect(
  OtterAccountSession,
  Effect.gen(function* () {
    const identity = yield* ServerEnvironmentIdentity;
    const config = yield* ServerConfig.ServerConfig;
    const tokens = yield* Effect.serviceOption(CloudCliTokenManager);
    const http = yield* HttpClient.HttpClient;
    const audience = `environment:${yield* identity.getEnvironmentId}`;
    const accountsUrl = yield* Config.String("T3CODE_ACCOUNTS_URL").pipe(
      Config.withDefault(OTTER_ACCOUNTS_URL),
    );
    const cloudOrigin = yield* Config.String("OTTERWARE_CLOUD_ORIGIN").pipe(
      Config.withDefault("https://cloud.otterware.app"),
    );
    const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
      Effect.runPromise(Effect.provideService(effect, HttpClient.HttpClient, http));
    let signingIn: Fiber.Fiber<unknown, unknown> | null = null;
    const ownLogin: EnvironmentLogin = Option.match(tokens, {
      onNone: () => signedOut,
      onSome: (manager) => ({
        accessToken: () =>
          run(manager.getExisting).then((token) =>
            Option.isSome(token) ? token.value.accessToken : null,
          ),
        signIn: (signedIn) =>
          run(
            Effect.gen(function* () {
              const shown = yield* Deferred.make<DeviceAuthorizationPrompt>();
              if (signingIn) yield* Fiber.interrupt(signingIn);
              const fiber = Effect.runFork(
                Effect.provideService(
                  deviceAuthorizationLogin((prompt) => Deferred.succeed(shown, prompt)).pipe(
                    Effect.flatMap(({ token }) => manager.store(token)),
                    Effect.tap(() => Effect.sync(signedIn)),
                    Effect.onExit((exit) =>
                      Exit.isFailure(exit)
                        ? Deferred.die(shown, Cause.squash(exit.cause))
                        : Effect.void,
                    ),
                  ),
                  HttpClient.HttpClient,
                  http,
                ),
              );
              signingIn = fiber;
              const prompt = yield* Deferred.await(shown);
              const now = yield* Clock.currentTimeMillis;
              return {
                verificationUrl: prompt.verificationUriComplete ?? prompt.verificationUri,
                userCode: prompt.userCode,
                expiresAt: now + Duration.toMillis(prompt.expiresIn),
              };
            }),
          ),
        signOut: () =>
          run(
            Effect.gen(function* () {
              const token = yield* manager.getExisting.pipe(
                Effect.orElseSucceed(() => Option.none()),
              );
              if (Option.isSome(token)) {
                // Revoke the grant itself, not just the local copy (RFC 7009).
                const oauth = yield* cloudCliOAuthConfig;
                yield* HttpClientRequest.post(
                  oauth.tokenEndpoint.replace(/\/token$/, "/revoke"),
                ).pipe(
                  HttpClientRequest.bodyUrlParams({
                    token: token.value.refreshToken,
                    token_type_hint: "refresh_token",
                    client_id: oauth.clientId,
                  }),
                  http.execute,
                  Effect.timeout("15 seconds"),
                  Effect.ignore,
                );
              }
              yield* manager.clear;
            }),
          ),
      }),
    });
    const login = config.mode === "desktop" ? appLogin() : ownLogin;
    // Google is authorized per device; headless servers keep Mail and Calendar off (VMs deferred).
    const devices = config.mode === "desktop" ? yield* DeviceGoogle.make : null;
    const host = yield* Effect.acquireRelease(
      Effect.sync(() =>
        makeOtterAccountSession({
          accountsUrl,
          cloudOrigin,
          audience,
          login,
          devices,
        }),
      ),
      (host) =>
        Effect.gen(function* () {
          if (signingIn) yield* Fiber.interrupt(signingIn);
          host.close();
        }),
    );
    return host.service;
  }),
).pipe(Layer.provide(layerIdentity));
