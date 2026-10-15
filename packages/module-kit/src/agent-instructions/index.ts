import * as Context from "effect/Context";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";

/** Per-environment instructions, also readable at synchronous provider boundaries. */
export class AgentInstructions extends Context.Reference<{
  readonly read: () => string;
  readonly update: (text: string) => void;
}>("@otterware/module-kit/AgentInstructions", {
  defaultValue: () => ({ read: () => "", update: () => {} }),
}) {}

/** One cell per application layer build; never shared between server instances. */
export const layer = Layer.sync(AgentInstructions, () => {
  let text = "";
  return {
    read: () => text,
    update: (next) => {
      text = next;
    },
  };
});

export const moduleAgentInstructions = (): string =>
  Fiber.getCurrent()?.getRef(AgentInstructions).read() ?? "";
