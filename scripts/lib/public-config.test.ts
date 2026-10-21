// @effect-diagnostics nodeBuiltinImport:off - Tests exercise root env file precedence directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "./public-config.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadRepoEnv", () => {
  it("projects Otter's public defaults without source-build credentials", () => {
    const env = loadRepoEnv({ baseEnv: {}, repoRoot: makeTemporaryDirectory() });
    expect(env.T3CODE_ACCOUNTS_URL).toBe("https://accounts.otterware.app/v1/auth");
    expect(env.VITE_ACCOUNTS_URL).toBe(env.T3CODE_ACCOUNTS_URL);
    expect(env.EXPO_PUBLIC_ACCOUNTS_URL).toBe(env.T3CODE_ACCOUNTS_URL);
    expect(env.T3CODE_ACCOUNTS_CLI_CLIENT_ID).toBe("otter-code-cli");
    expect(env.T3CODE_RELAY_URL).toBe("https://relay.code.otterware.app");
    expect(env.T3CODE_MOBILE_OTLP_TRACES_TOKEN).toBeUndefined();
  });

  it("applies process, root local, and root precedence in that order", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env"),
      "T3CODE_ACCOUNTS_URL=https://root.example/v1/auth\nT3CODE_ACCOUNTS_CLI_CLIENT_ID=oauth_root\nT3CODE_RELAY_URL=https://root.example.test\n",
    );
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env.local"),
      "T3CODE_ACCOUNTS_URL=https://local.example/v1/auth\nT3CODE_ACCOUNTS_CLI_CLIENT_ID=oauth_local\nT3CODE_RELAY_URL=https://local.example.test\n",
    );

    expect(loadRepoEnv({ baseEnv: {}, repoRoot }).T3CODE_RELAY_URL).toBe(
      "https://local.example.test",
    );
    expect(
      loadRepoEnv({
        baseEnv: {
          T3CODE_ACCOUNTS_URL: "https://ci.example/v1/auth",
          T3CODE_ACCOUNTS_CLI_CLIENT_ID: "oauth_ci",
          T3CODE_RELAY_URL: "https://ci.example.test",
        },
        repoRoot,
      }),
    ).toMatchObject({
      T3CODE_ACCOUNTS_URL: "https://ci.example/v1/auth",
      T3CODE_ACCOUNTS_CLI_CLIENT_ID: "oauth_ci",
      VITE_ACCOUNTS_URL: "https://ci.example/v1/auth",
      EXPO_PUBLIC_ACCOUNTS_URL: "https://ci.example/v1/auth",
      T3CODE_RELAY_URL: "https://ci.example.test",
      VITE_T3CODE_RELAY_URL: "https://ci.example.test",
    });
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}
