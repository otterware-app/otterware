/**
 * The `app.*` when-variables keybindings can use: Code when it is visible, then
 * every module the profile ships. Read from the profile rather than the module
 * registry so settings logic can import it without loading module state.
 */
import { shellWhenVariables } from "@otterware/module-kit/web";
import { activeProfile } from "@otterware/profiles/active";

export const SHELL_WHEN_VARIABLES = shellWhenVariables([
  ...(activeProfile.codeVisible ? ["code"] : []),
  ...activeProfile.modules,
]);
