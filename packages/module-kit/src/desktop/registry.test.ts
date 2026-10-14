import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { createDesktopRegistry, desktopMethod } from "./index.ts";

it("decodes before executing and rejects unregistered or inherited methods", async () => {
  const registry = createDesktopRegistry();
  const calls: number[] = [];
  const stop = registry.register("example", {
    count: desktopMethod(Schema.Struct({ count: Schema.Int }), ({ count }) => {
      calls.push(count);
      return count;
    }),
  });
  const invoke = (method: string, input: unknown) =>
    registry.invoke({ module: "example", method, input }, { senderId: 1 });
  await expect(invoke("count", { count: "3" })).rejects.toThrow();
  await expect(invoke("constructor", {})).rejects.toThrow("unavailable");
  expect(calls).toEqual([]);
  await expect(invoke("count", { count: 3 })).resolves.toBe(3);
  stop();
  await expect(invoke("count", { count: 4 })).rejects.toThrow("unavailable");
  expect(calls).toEqual([3]);
});
