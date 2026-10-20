/**
 * The account port engines exchange themselves (Calendar): the page's sign-in, bound to an
 * audience per engine on this browser, with Google from this browser's own grants.
 */
import { BrowserAccountCredential } from "@otterware/composition/browser";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { BrowserInstallation } from "../BrowserInstallation.ts";
import { BrowserAccount } from "./BrowserAccount.ts";
import { BrowserGoogle } from "./BrowserGoogle.ts";

export const layerAccountCredential = Layer.effect(
  BrowserAccountCredential,
  Effect.gen(function* () {
    const account = yield* BrowserAccount;
    const installation = yield* BrowserInstallation;
    const google = yield* BrowserGoogle;
    return BrowserAccountCredential.of({
      read: (purpose) =>
        Effect.map(
          account.credential,
          Option.map((credential) => ({
            oauthToken: credential.accessToken,
            accountsUrl: credential.accountsUrl,
            cloudOrigin: credential.cloudOrigin,
            audience: `${purpose}:browser:${installation.id}`,
            providers: google,
          })),
        ),
    });
  }),
);
