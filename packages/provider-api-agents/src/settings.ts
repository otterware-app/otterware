/**
 * Instance settings of the API agent drivers. Shared by the server drivers
 * and the client settings form, so they hold only browser-safe schema code.
 * Keys and tokens are credentials: the server keeps them in its secret store
 * and clients only learn whether one is saved.
 *
 * @module provider-api-agents/settings
 */
import {
  CustomModelSetting,
  makeProviderSettingsSchema,
  secretSetting,
  TrimmedString,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const enabled = Schema.Boolean.pipe(
  Schema.withDecodingDefault(Effect.succeed(false)),
  Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
);
const customModels = Schema.Array(CustomModelSetting).pipe(
  Schema.withDecodingDefault(Effect.succeed([])),
  Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
);
const credential = (title: string, description: string, placeholder: string) =>
  TrimmedString.pipe(
    secretSetting,
    Schema.withDecodingDefault(Effect.succeed("")),
    Schema.annotateKey({
      title,
      description,
      providerSettingsForm: { control: "password", placeholder, clearWhenEmpty: "omit" },
    }),
  );
const serverUrl = (description: string, placeholder: string) =>
  TrimmedString.pipe(
    Schema.withDecodingDefault(Effect.succeed("")),
    Schema.annotateKey({
      title: "Server URL",
      description,
      providerSettingsForm: { placeholder, clearWhenEmpty: "omit" },
    }),
  );

export const OpenRouterSettings = makeProviderSettingsSchema(
  {
    enabled,
    apiKey: credential(
      "API key",
      "An OpenRouter key from openrouter.ai/settings/keys. Stored separately on the host.",
      "sk-or-…",
    ),
    customModels,
  },
  { order: ["apiKey"] },
);
export type OpenRouterSettings = typeof OpenRouterSettings.Type;

export const HermesSettings = makeProviderSettingsSchema(
  {
    enabled,
    baseUrl: serverUrl(
      "Address of the Hermes API server, reachable from this environment.",
      "http://127.0.0.1:8642",
    ),
    apiKey: credential(
      "API key",
      "The API_SERVER_KEY of that Hermes gateway. Stored separately on the host.",
      "API_SERVER_KEY",
    ),
    customModels,
  },
  { order: ["baseUrl", "apiKey"] },
);
export type HermesSettings = typeof HermesSettings.Type;

export const OpenClawSettings = makeProviderSettingsSchema(
  {
    enabled,
    baseUrl: serverUrl(
      "Address of the OpenClaw gateway, reachable from this environment.",
      "http://127.0.0.1:18789",
    ),
    token: credential(
      "Gateway token",
      "The gateway's token or password. Stored separately on the host.",
      "gateway.auth.token",
    ),
    customModels,
  },
  { order: ["baseUrl", "token"] },
);
export type OpenClawSettings = typeof OpenClawSettings.Type;
