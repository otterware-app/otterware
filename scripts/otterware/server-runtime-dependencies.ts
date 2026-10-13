// @effect-diagnostics nodeBuiltinImport:off -- Release checks inspect manifests and emitted Node bundles before packaging.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import ts from "typescript-legacy";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { findEsmImportsOfExternalPackages } from "../lib/cli-executable-imports.ts";
import { isRuntimeExternalCliDependency } from "../lib/cli-external-packages.ts";
import { collectWorkspaceManifestPaths } from "./release-workspace-manifests.ts";

const readManifest = (root: string, path: string) =>
  JSON.parse(NodeFS.readFileSync(NodePath.join(root, path), "utf8")) as {
    dependencies?: Record<string, string>;
  };

/** Workspace imports lose their package-local resolver when bundled into the server. */
export function assertServerRuntimeDependencies(root: string) {
  const dependencies = readManifest(root, "apps/server/package.json").dependencies ?? {};
  const missing = new Set<string>();
  for (const path of collectWorkspaceManifestPaths(root, ["apps/server/package.json"])) {
    for (const name of Object.keys(readManifest(root, path).dependencies ?? {})) {
      if (isRuntimeExternalCliDependency(name) && !Object.hasOwn(dependencies, name)) {
        missing.add(`${name} (from ${path})`);
      }
    }
  }
  if (missing.size) {
    throw new Error(
      `Server runtime externals need production dependencies:\n${[...missing].sort().join("\n")}`,
    );
  }
}

/** Include CommonJS loaders without matching code samples inside strings or comments. */
function findServerRuntimeImports(source: string) {
  const specifiers = new Set(findEsmImportsOfExternalPackages(source));
  const module = ts.createSourceFile(
    "bundle.mjs",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  const requireNames = new Set(["require", "__require"]);
  const isCreateRequire = (node: ts.Node) =>
    (ts.isIdentifier(node) && /^createRequire(?:\$\d+)?$/.test(node.text)) ||
    (ts.isPropertyAccessExpression(node) && node.name.text === "createRequire");
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      isCreateRequire(node.initializer.expression)
    ) {
      requireNames.add(node.name.text);
    }
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) &&
        (requireNames.has(node.expression.text) || /^require_\d+$/.test(node.expression.text))) ||
        (ts.isCallExpression(node.expression) && isCreateRequire(node.expression.expression)))
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) {
        const specifier = argument.text;
        // ws's two optional accelerators are intentionally absent; its guarded requires fall back to JS.
        if (
          !NodeModule.isBuiltin(specifier) &&
          !specifier.startsWith(".") &&
          specifier !== "bufferutil" &&
          specifier !== "utf-8-validate"
        )
          specifiers.add(specifier);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(module);
  return specifiers;
}

/** ESM imports in emitted chunks resolve from dist, not a workspace module's node_modules. */
export function missingServerBundleDependencies(
  sources: ReadonlyArray<string>,
  dependencies: Readonly<Record<string, string>>,
) {
  const missing = new Set<string>();
  for (const source of sources) {
    for (const specifier of findServerRuntimeImports(source)) {
      const name = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0]!;
      if (!Object.hasOwn(dependencies, name)) missing.add(name);
    }
  }
  return [...missing].sort();
}

/** Check what CI actually built, then load its entry without starting a server. */
export function assertServerRuntimeBundle(root: string) {
  const dist = NodePath.join(root, "apps/server/dist");
  const entry = NodePath.join(dist, "bin.mjs");
  if (!NodeFS.existsSync(entry))
    throw new Error("Server bundle missing: build before the artifact smoke check");
  const sources = [...NodeFS.globSync("**/*.mjs", { cwd: dist })].map((path) =>
    NodeFS.readFileSync(NodePath.join(dist, path), "utf8"),
  );
  const dependencies = readManifest(root, "apps/server/package.json").dependencies ?? {};
  const missing = missingServerBundleDependencies(sources, dependencies);
  if (missing.length)
    throw new Error(
      `Emitted server bundle imports undeclared production dependencies: ${missing.join(", ")}`,
    );
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "otterware-bundle-smoke-"));
  try {
    NodeChildProcess.execFileSync(process.execPath, [entry, "serve", "--help"], {
      cwd: root,
      env: { ...process.env, T3CODE_HOME: home },
      timeout: 30_000,
      stdio: "pipe",
    });
  } finally {
    NodeFS.rmSync(home, { recursive: true, force: true });
  }
}
