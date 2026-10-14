/** The agent RPCs: thin mappings onto `BrowserAgent`. */
import * as Effect from "effect/Effect";

import { BrowserAgent } from "./BrowserAgent.ts";
import { BrowserAgentRpcGroup } from "./contracts.ts";

export const layerAgentHandlers = BrowserAgentRpcGroup.toLayer(
  Effect.gen(function* () {
    const agent = yield* BrowserAgent;
    return BrowserAgentRpcGroup.of({
      "browser.agent.settings": () => agent.settings.pipe(Effect.orDie),
      "browser.agent.configure": (input) => agent.configure(input),
      "browser.agent.openRouter.connect": ({ apiKey }) => agent.connectOpenRouter(apiKey),
      "browser.agent.openRouter.disconnect": () => agent.disconnectOpenRouter,
      "browser.agent.models": ({ agent: kind }) =>
        Effect.map(agent.models(kind), (models) => ({ models })),
      "browser.agent.threads": () =>
        agent.threads.pipe(
          Effect.map((threads) => ({ threads })),
          Effect.orDie,
        ),
      "browser.agent.messages": ({ threadId }) =>
        Effect.map(agent.messages(threadId), (messages) => ({ messages })),
      "browser.agent.createThread": (input) => agent.createThread(input).pipe(Effect.orDie),
      "browser.agent.deleteThread": ({ threadId }) =>
        agent.deleteThread(threadId).pipe(Effect.orDie),
      "browser.agent.send": (input) => agent.send(input),
      "browser.agent.events": ({ threadId }) => agent.events(threadId),
      "browser.agent.answer": (input) => agent.answer(input),
      "browser.agent.stop": ({ threadId }) => agent.stop(threadId),
    });
  }),
);
