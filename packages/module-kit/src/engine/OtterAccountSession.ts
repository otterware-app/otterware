import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

export class OtterAccountSessionError extends Schema.TaggedError<OtterAccountSessionError>()(
  "OtterAccountSessionError",
  {
    operation: Schema.Literals(["access-token", "provider-token"]),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return "The Otter Account could not provide an access token.";
  }
}

export interface ProviderAccessToken {
  readonly accessToken: Redacted.Redacted<string>;
  /** Unix epoch milliseconds, matching the Cloud contract. */
  readonly expiresAt: number;
  readonly audience: string;
  readonly connectionId: string;
  readonly scopes: ReadonlyArray<string>;
}

/** W3 supplies this portable port from the environment's account session; no refresh tokens leave it. */
export class OtterAccountSession extends Context.Service<
  OtterAccountSession,
  {
    readonly accessToken: (
      audience: string,
    ) => Effect.Effect<Redacted.Redacted<string>, OtterAccountSessionError>;
    readonly providerToken: (
      connectionId: string,
    ) => Effect.Effect<ProviderAccessToken, OtterAccountSessionError>;
  }
>()("@otterware/module-kit/engine/OtterAccountSession") {}
