import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { PROVIDER_SCOPES } from "@otterware/otter-cloud-client/scopes";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";
import { ensureLocalApi } from "../../localApi";
import { useAtomCommand } from "../../state/use-atom-command";
import { useModuleTarget } from "../browser/runtime";
import { connectProvider } from "./rpc";

export type ConnectableProvider = keyof typeof PROVIDER_SCOPES;

/**
 * Connects Google on this device: one consent for Mail, Calendar and contacts here, kept by
 * the environment. It does not follow the account to other devices. Settings, Mail and
 * Calendar all start it here.
 */
export function useConnectProvider(environmentId?: EnvironmentId) {
  const moduleTarget = useModuleTarget();
  const targetEnvironment =
    environmentId ?? (moduleTarget._tag === "environment" ? moduleTarget.environmentId : null);
  const connect = useAtomCommand(connectProvider);
  return useCallback(
    async (provider: ConnectableProvider) => {
      const input = {
        provider,
        scopes: [...PROVIDER_SCOPES[provider]],
        returnTo: window.location.href,
      };
      // Google is authorized per device. The in-browser environment has no device-local
      // Google yet, and Cloud no longer holds new grants, so only environments connect it.
      if (!targetEnvironment) throw new Error("Google can't be connected in this browser yet.");
      const result = await connect({ environmentId: targetEnvironment, input });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      const url = result.value.url;
      await ensureLocalApi().shell.openExternal(url);
    },
    [targetEnvironment, connect],
  );
}
