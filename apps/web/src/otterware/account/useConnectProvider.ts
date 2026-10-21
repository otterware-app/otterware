import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { PROVIDER_SCOPES } from "@otterware/otter-cloud-client/scopes";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";
import { ensureLocalApi } from "../../localApi";
import { useAtomCommand } from "../../state/use-atom-command";
import { useModuleTarget } from "../browser/runtime";
import { connectGoogleInBrowser } from "./browserGoogle";
import { connectProvider } from "./rpc";

export type ConnectableProvider = keyof typeof PROVIDER_SCOPES;

/**
 * Authorizes Google on this device and links the account to the Otter Account: one consent for
 * Mail, Calendar and contacts here. Pass a linked account's `email` to authorize it on this
 * device or to add access it lacks. Settings, Mail and Calendar all start it here.
 */
export function useConnectProvider(environmentId?: EnvironmentId) {
  const moduleTarget = useModuleTarget();
  const targetEnvironment =
    environmentId ?? (moduleTarget._tag === "environment" ? moduleTarget.environmentId : null);
  const connect = useAtomCommand(connectProvider);
  return useCallback(
    async (provider: ConnectableProvider, email?: string) => {
      // Google is authorized per device: this browser keeps its own sealed grant.
      if (!targetEnvironment) return connectGoogleInBrowser();
      const result = await connect({
        environmentId: targetEnvironment,
        input: { provider, ...(email ? { email } : {}) },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      await ensureLocalApi().shell.openExternal(result.value.url);
    },
    [targetEnvironment, connect],
  );
}
