/**
 * Settings › Modules: the live on/off switch per module of the primary
 * environment (ADR 0010). Turning a module off closes its services and hides
 * its pages, tools and RPCs there until it is turned on again; a module that
 * failed to start shows why and retries when turned on.
 */
import type { ModuleStateEntry } from "@otterware/module-kit/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useSettingsScope } from "../components/settings/SettingsScopeContext";
import { useState } from "react";

import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  SettingsUnavailableGroup,
} from "../components/settings/settingsLayout";
import { Switch } from "../components/ui/switch";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useAtomCommand } from "../state/use-atom-command";
import { setModuleEnabled, useModuleStates } from "./moduleState";
import { moduleRegistry } from "./registry";

function describeState(entry: ModuleStateEntry): string {
  switch (entry.state) {
    case "on":
      return "On. Its pages, agent tools and instructions are available on this environment.";
    case "off":
      return "Off. Its pages, agent tools and instructions are unavailable on this environment.";
    case "failed":
      return `Could not start${entry.failure ? `: ${entry.failure}` : ""}. Turn it on again to retry.`;
  }
}

export function ModulesSettingsPage() {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environment } = useSettingsScope();
  const environmentId = environment?.environmentId ?? primaryEnvironmentId;
  const states = useModuleStates(environmentId);
  const canWrite = useAtomValue(setModuleEnabled.permissionAtom(environmentId));
  const setEnabled = useAtomCommand(setModuleEnabled);
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
            description={describeState(entry)}
            control={
              <Switch
                size="sm"
                aria-label={`${moduleRegistry.byId(entry.id)?.label ?? entry.id} on this environment`}
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
          Environment scope · Changes apply to this environment and all clients connected to it.
          Data is kept when a module is off.
        </p>
        <SettingsUnavailableGroup
          message={
            environmentId === null
              ? "Connect an environment to manage its modules."
              : states.status === "unavailable"
                ? "This environment runs Otter Code without modules."
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
                  ? "Reading this environment’s modules…"
                  : "This environment’s build ships no modules."
              }
            />
          )}
        </SettingsUnavailableGroup>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
