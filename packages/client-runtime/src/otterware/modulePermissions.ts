import { OTTERWARE_RPC_SUPERSET_SCOPES } from "@otterware/composition/contracts";
import {
  clientRpcRequiredScopes as hostScopes,
  type AuthEnvironmentScope,
} from "@t3tools/contracts";

/** Keep the module policy with composition, avoiding a contracts -> modules import cycle. */
export function clientRpcRequiredScopes(
  method: string,
  input: unknown,
): readonly AuthEnvironmentScope[] {
  if (Object.hasOwn(OTTERWARE_RPC_SUPERSET_SCOPES, method)) {
    return [OTTERWARE_RPC_SUPERSET_SCOPES[method as keyof typeof OTTERWARE_RPC_SUPERSET_SCOPES]];
  }
  return hostScopes(method, input);
}
