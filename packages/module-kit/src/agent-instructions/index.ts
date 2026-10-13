/**
 * The module agent instructions as provider adapters read them. The
 * `AgentInstructions` service (module-kit server) owns the text and publishes
 * it here whenever a module turns on or off; adapters build their prompts
 * with a synchronous call (`buildRuntimeInstructions`), which is why the
 * published copy is a plain value rather than a service read.
 */
let published = "";

/** Called by the `AgentInstructions` service only. */
export const publishModuleAgentInstructions = (text: string): void => {
  published = text;
};

/** Empty before startup, on a server without modules, or while every module is off. */
export const moduleAgentInstructions = (): string => published;
