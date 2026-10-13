import { expect, it, vi } from "vite-plus/test";
const helper = vi.hoisted(() => ({
  result: { status: "ok", texts: ["Hello"] } as unknown,
  calls: 0,
}));
vi.mock("node:child_process", () => ({
  execFile: (
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string) => void,
  ) => {
    ++helper.calls;
    return { stdin: { on: () => {}, end: () => callback(null, JSON.stringify(helper.result)) } };
  },
}));
import { appleTranslator } from "./translation.ts";
it("caches successful translations and rejects incomplete replies", async () => {
  helper.calls = 0;
  helper.result = { status: "ok", texts: ["Hello"] };
  const translator = appleTranslator("/fake/translator");
  expect(await translator.translate(["Hallo"], "de", "en")).toEqual(helper.result);
  expect(await translator.translate(["Hallo"], "de", "en")).toEqual(helper.result);
  expect(helper.calls).toBe(1);
  await expect(translator.translate(["Hallo", "Welt"], "de", "en")).rejects.toThrow("incomplete");
  helper.result = { status: "notInstalled", texts: [] };
  expect(await translator.translate(["Welt"], "de", "en")).toMatchObject({
    status: "notInstalled",
  });
});
