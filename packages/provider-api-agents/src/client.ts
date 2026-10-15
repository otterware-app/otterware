/**
 * Client definitions of the API agent drivers: settings forms, labels, badges
 * and glyphs. Browser- and React Native-safe.
 *
 * @module provider-api-agents/client
 */
import { ProviderDriverKind } from "@t3tools/contracts";
import { defineProviderClient } from "@t3tools/provider-core/client";

import { HermesSettings, OpenClawSettings, OpenRouterSettings } from "./settings.ts";

const fill = { light: "#171717", dark: "#e5e5e5" };

export const openRouterClient = defineProviderClient({
  driverKind: ProviderDriverKind.make("openrouter"),
  label: "OpenRouter",
  settingsSchema: OpenRouterSettings,
  badgeLabel: "Beta",
  icon: {
    viewBox: "0 0 24 24",
    fill,
    paths: [
      {
        d: "M2 10.5h7.2l4.2-5.5H17V2.5l5 3.75L17 10V7.5h-2.4L11 12l3.6 4.5H17V14l5 3.75-5 3.75V19h-3.6l-4.2-5.5H2z",
      },
    ],
  },
});

export const hermesClient = defineProviderClient({
  driverKind: ProviderDriverKind.make("hermes"),
  label: "Hermes",
  settingsSchema: HermesSettings,
  badgeLabel: "Beta",
  icon: {
    viewBox: "0 0 24 24",
    fill,
    paths: [{ d: "M5 3h3v7.5h8V3h3v18h-3v-7.5H8V21H5z" }],
  },
});

export const openClawClient = defineProviderClient({
  driverKind: ProviderDriverKind.make("openclaw"),
  label: "OpenClaw",
  settingsSchema: OpenClawSettings,
  badgeLabel: "Beta",
  icon: {
    viewBox: "0 0 24 24",
    fill,
    paths: [
      {
        d: "M6 3c2.2 4.3 2.2 10.3-1 18l-2.2-.9c2.8-6.9 2.9-12 1.1-16.2zm6.5 0c2.2 4.3 2.2 10.3-1 18l-2.2-.9c2.8-6.9 2.9-12 1.1-16.2zM19 3c2.2 4.3 2.2 10.3-1 18l-2.2-.9c2.8-6.9 2.9-12 1.1-16.2z",
      },
    ],
  },
});

/** The three API agents, in presentation order. */
export const apiAgentClients = [openRouterClient, hermesClient, openClawClient] as const;
