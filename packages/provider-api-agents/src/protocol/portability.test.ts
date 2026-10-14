// @effect-diagnostics nodeBuiltinImport:off - The test reads the protocol sources it checks.
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

// The browser's light agent loop (ADR 0009) runs this code as is.
describe("protocol portability", () => {
  it("imports nothing from Node, Electron, Effect platforms or the server", () => {
    const directory = new URL("./", import.meta.url);
    const sources = NodeFS.readdirSync(directory).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const name of sources) {
      const source = NodeFS.readFileSync(new URL(name, directory), "utf8");
      const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
      expect(
        imports.filter((specifier) => !specifier.startsWith("./")),
        `${name} must import only sibling protocol modules`,
      ).toEqual([]);
      expect(source, name).not.toMatch(/\b(process|Buffer|require)\b[.(]/);
    }
  });
});
