import * as NodeChildProcess from "node:child_process";
const { spawnSync } = NodeChildProcess;

import * as NodeFS from "node:fs";
const { readFileSync } = NodeFS;

import * as NodePath from "node:path";
const { resolve } = NodePath;

import { describe, expect, it } from "vite-plus/test";

const entry = resolve(import.meta.dirname, "../src/index.ts");
const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
);

function run(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", entry, ...args], {
    encoding: "utf8",
    cwd: resolve(import.meta.dirname, ".."),
  });
}

describe("version options", () => {
  it.each(["-v", "--version"])("prints the CLI version for %s", (flag) => {
    const result = run(flag);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(version);
  });

  it("leaves artifact version selectors to the subcommand", () => {
    const result = run("artifacts", "files", "example", "--version", "1", "--help");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: otterdrive artifacts files [options] <artifact>");
    expect(result.stdout).toContain("--version <number>");
    expect(result.stdout.trim()).not.toBe(version);
  });
});
