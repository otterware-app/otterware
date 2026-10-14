// @effect-diagnostics nodeBuiltinImport:off -- Release fixture discovery is a Node script.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/** Include workspace dependencies of every fixture root, including dev and peer dependencies. */
export function collectWorkspaceManifestPaths(
  root: string,
  initial: ReadonlyArray<string>,
): Array<string> {
  const yaml = NodeFS.readFileSync(NodePath.join(root, "pnpm-workspace.yaml"), "utf8");
  const packageSection = yaml.match(/^packages:\s*\n((?:[ \t]+.*\n)*)/m)?.[1];
  if (!packageSection) throw new Error("Missing workspace package patterns");
  const patterns = [...packageSection.matchAll(/^\s+-\s+["']?([^"'\n]+)["']?\s*$/gm)].map(
    (match) => `${match[1]!.trim()}/package.json`,
  );
  const manifests = new Map<string, { path: string; dependencies: ReadonlyArray<string> }>();
  for (const path of NodeFS.globSync(patterns, { cwd: root })) {
    const manifest = JSON.parse(NodeFS.readFileSync(NodePath.join(root, path), "utf8"));
    if (!manifest.name) continue;
    if (manifests.has(manifest.name))
      throw new Error(`Duplicate workspace package: ${manifest.name}`);
    const dependencies = Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    })
      .filter(([, version]) => typeof version === "string" && version.startsWith("workspace:"))
      .map(([name]) => name);
    manifests.set(manifest.name, { path, dependencies });
  }
  const paths = new Set(initial);
  const visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);
    const manifest = manifests.get(name);
    if (!manifest) throw new Error(`Missing workspace package: ${name}`);
    paths.add(manifest.path);
    manifest.dependencies.forEach(visit);
  };
  // Root package dev dependencies (including the lint plugin) are also installed by pnpm.
  const rootManifest = JSON.parse(NodeFS.readFileSync(NodePath.join(root, "package.json"), "utf8"));
  for (const [name, version] of Object.entries({
    ...rootManifest.dependencies,
    ...rootManifest.devDependencies,
  })) {
    if (typeof version === "string" && version.startsWith("workspace:")) visit(name);
  }
  for (const [name, manifest] of manifests) if (paths.has(manifest.path)) visit(name);
  return [...paths].toSorted();
}
