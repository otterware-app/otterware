import { createClientStore } from "./clientStore.ts";
/** Content publishes ephemeral predicates; the shell owns keyboard dispatch. */
export const useModuleCommandContext = createClientStore(() => ({
  contexts: {} as Readonly<Record<string, Readonly<Record<string, boolean>>>>,
}));
