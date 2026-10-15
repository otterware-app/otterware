import * as NodeFS from "node:fs";
const { readFileSync } = NodeFS;

import * as NodePath from "node:path";
const { resolve } = NodePath;

/** Local Mail development keeps its own fake/test identity and never calls Accounts. */
export function localConfig(): string {
  const root = resolve(import.meta.dirname, "..");
  return readFileSync(resolve(root, "wrangler.test.jsonc"), "utf8")
    .replace(/"services":\s*\[[\s\S]*?\],/, '"services": [],')
    .replace('"IDENTITY_MODE": "accounts"', '"IDENTITY_MODE": "legacy"')
    .replace('"src/worker.ts"', JSON.stringify(resolve(root, "src/worker.ts")))
    .replace(
      '"migrations_dir": "migrations"',
      `"migrations_dir": ${JSON.stringify(resolve(root, "migrations"))}`,
    );
}
