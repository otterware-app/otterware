// @effect-diagnostics nodeBuiltinImport:off -- Apple's Translation framework runs in a local native helper.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as Schema from "effect/Schema";

const Detection = Schema.Struct({
  language: Schema.NullOr(Schema.String),
  confidence: Schema.Number,
});
const Translation = Schema.Struct({
  status: Schema.Literals(["ok", "notInstalled", "unsupported", "unavailable"]),
  texts: Schema.Array(Schema.String),
});
const decodeDetection = Schema.decodeUnknownSync(Detection);
const decodeTranslation = Schema.decodeUnknownSync(Translation);

export function appleTranslator(helper: string) {
  const cache = new Map<string, typeof Translation.Type>();
  const run = (command: "detect" | "translate", input: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const child = NodeChildProcess.execFile(
        helper,
        [command],
        { timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            reject(new Error("The on-device translator could not complete the request."));
            return;
          }
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error("The translator returned malformed output."));
          }
        },
      );
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify(input));
    });
  return {
    detect: async (text: string) => decodeDetection(await run("detect", { text })),
    translate: async (texts: readonly string[], source: string, target: string) => {
      const key = NodeCrypto.createHash("sha256")
        .update(JSON.stringify([texts, source, target]))
        .digest("hex");
      const prior = cache.get(key);
      if (prior) return prior;
      const result = decodeTranslation(await run("translate", { texts, source, target }));
      if (result.status === "ok") {
        if (result.texts.length !== texts.length)
          throw new Error("The translator returned an incomplete result.");
        if (cache.size >= 50) cache.delete(cache.keys().next().value!);
        cache.set(key, result);
      }
      return result;
    },
  };
}
