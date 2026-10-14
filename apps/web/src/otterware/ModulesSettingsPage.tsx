/**
 * Settings › Modules: the live on/off switch per module of the primary
 * environment (ADR 0010). Turning a module off closes its services and hides
 * its pages, tools and RPCs there until it is turned on again; a module that
 * failed to start shows why and retries when turned on.
 */
import type { ModuleStateEntry } from "@otterware/module-kit/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useSettingsScope } from "../components/settings/SettingsScopeContext";
import type * as Effect from "effect/Effect";
import { useState } from "react";

import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  SettingsUnavailableGroup,
} from "../components/settings/settingsLayout";
import { Switch } from "../components/ui/switch";
import { isThisBrowser, useModuleCommand, useModuleEnvironmentId } from "./browser/moduleEndpoint";
import type { browserClient } from "./browser/runtime";
import { setModuleEnabled, useModuleStates } from "./moduleState";
import { moduleRegistry } from "./registry";

const setInBrowser = (
  client: Effect.Success<typeof browserClient>,
  input: { readonly id: string; readonly enabled: boolean },
) => client["modules.setEnabled"](input);

function describeState(entry: ModuleStateEntry, where: string): string {
  switch (entry.state) {
    case "on":
      return `On. Its pages, agent tools and instructions are available in ${where}.`;
    case "off":
      return `Off. Its pages, agent tools and instructions are unavailable in ${where}.`;
    case "failed":
      return `Could not start${entry.failure ? `: ${entry.failure}` : ""}. Turn it on again to retry.`;
  }
}

export function ModulesSettingsPage() {
  const moduleEnvironmentId = useModuleEnvironmentId();
  const { environment } = useSettingsScope();
  const environmentId = environment?.environmentId ?? moduleEnvironmentId;
  // Without a paired environment the modules run in this browser, the user's own.
  const inBrowser = isThisBrowser(environmentId);
  const where = inBrowser ? "this browser" : "this environment";
  const states = useModuleStates(environmentId);
  const environmentCanWrite = useAtomValue(
    setModuleEnabled.permissionAtom(inBrowser ? null : environmentId),
  );
  const canWrite = inBrowser || environmentCanWrite;
  const setEnabled = useModuleCommand(setModuleEnabled, setInBrowser);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const toggle = async (id: string, enabled: boolean) => {
    if (environmentId === null || states.status !== "available") return;
    setPendingId(id);
    try {
      await setEnabled({ environmentId, input: { id, enabled } });
    } finally {
      setPendingId(null);
      states.refresh();
    }
  };

  const rows =
    states.status === "available"
      ? states.modules.map((entry) => (
          <SettingsRow
            key={entry.id}
            id={`module-${entry.id}`}
            title={moduleRegistry.byId(entry.id)?.label ?? entry.id}
            description={describeState(entry, where)}
            control={
              <Switch
                size="sm"
                aria-label={`${moduleRegistry.byId(entry.id)?.label ?? entry.id} in ${where}`}
                checked={entry.state === "on"}
                disabled={!canWrite || pendingId !== null}
                onCheckedChange={(checked) => void toggle(entry.id, checked)}
              />
            }
          />
        ))
      : null;

  return (
    <SettingsPageContainer>
      <SettingsSection title="Modules">
        <p className="text-sm text-muted-foreground">
          {inBrowser
            ? "This browser · No environment is paired, so modules run in this browser profile. Data is kept when a module is off."
            : "Environment scope · Changes apply to this environment and all clients connected to it. Data is kept when a module is off."}
        </p>
        <SettingsUnavailableGroup
          message={
            environmentId === null
              ? "Connect an environment to manage its modules."
              : states.status === "unavailable"
                ? "Modules could not be read. Reconnect or use an environment that supports modules."
                : !canWrite
                  ? "Your access to this environment does not include changing settings."
                  : undefined
          }
        >
          {rows !== null && rows.length > 0 ? (
            rows
          ) : (
            <SettingsRow
              title="No modules"
              description={
                states.status === "loading"
                  ? `Reading the modules of ${where}…`
                  : `The build for ${where} ships no modules.`
              }
            />
          )}
        </SettingsUnavailableGroup>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
