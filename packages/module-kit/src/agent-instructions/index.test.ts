import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { AgentInstructions, moduleAgentInstructions } from "./index.ts";

describe("module agent instructions", () => {
  it.effect("isolates environment snapshots and reads live state", () =>
    Effect.gen(function* () {
      let first = "mail";
      const readFirst = Effect.sync(moduleAgentInstructions).pipe(
        Effect.provideService(AgentInstructions, { read: () => first, update: () => {} }),
      );
      const readSecond = Effect.sync(moduleAgentInstructions).pipe(
        Effect.provideService(AgentInstructions, { read: () => "calendar", update: () => {} }),
      );
      expect(yield* readFirst).toBe("mail");
      expect(yield* readSecond).toBe("calendar");
      first = "";
      expect(yield* readFirst).toBe("");
      expect(yield* readSecond).toBe("calendar");
      expect(yield* Effect.sync(moduleAgentInstructions)).toBe("");
    }),
  );
});
