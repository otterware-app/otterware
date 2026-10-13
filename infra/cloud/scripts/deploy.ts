import * as NodeFSP from "node:fs/promises";
const { readFile, writeFile } = NodeFSP;

import * as NodeChildProcess from "node:child_process";
const { execFileSync } = NodeChildProcess;

import * as NodeBuffer from "node:buffer";
const { Buffer } = NodeBuffer;

import * as NodeCrypto from "node:crypto";
const { randomBytes } = NodeCrypto;

import { bundle } from "./bundle.ts";

// Run only in the new repository's main deployment. No old Worker is ever a mutation target.
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account)
  throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.");
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api<T>(
  path: string,
  permission: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await response.json()) as {
    success: boolean;
    result: T;
    errors?: { code: number; message: string }[];
  };
  if (!response.ok || !data.success)
    throw new Error(
      `${method} ${path}: HTTP ${response.status}; requires ${permission}. Cloudflare errors: ${JSON.stringify(data.errors ?? [])}`,
    );
  return data.result;
}
const config = JSON.parse(await readFile("wrangler.json", "utf8"));
if (
  config.name !== "otterware-cloud" ||
  config.routes.length !== 1 ||
  config.routes[0].pattern !== "cloud.otterware.app" ||
  config.vars.LEGACY_HOSTS
)
  throw new Error("Parallel deployment boundary changed; refusing deployment.");
for (const db of config.d1_databases.slice(1))
  await api(`/d1/database/${db.database_id}`, `D1 Read on ${db.database_name} (${db.database_id})`);
const domains = await api<{ hostname: string; service: string }[]>(
  "/workers/domains",
  "Workers Scripts Read",
);
const occupied = domains.find(
  (d) => d.hostname === "cloud.otterware.app" && d.service !== config.name,
);
if (occupied)
  throw new Error(
    "cloud.otterware.app already belongs to another Worker. Refusing route takeover.",
  );
let databases = await api<{ uuid: string; name: string }[]>("/d1/database?per_page=100", "D1 Read");
let database = databases.find((d) => d.name === "otterware-cloud");
if (!database)
  database = await api<{ uuid: string; name: string }>(
    "/d1/database",
    "D1 Edit (create otterware-cloud)",
    "POST",
    { name: "otterware-cloud", primary_location_hint: "weur" },
  );
config.d1_databases[0].database_id = database.uuid;
await writeFile(".wrangler.deploy.json", JSON.stringify(config, null, 2));
const wrangler = (args: string[], input?: string) =>
  execFileSync("pnpm", ["exec", "wrangler", ...args, "--config", ".wrangler.deploy.json"], {
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    input,
    env: { ...process.env, CI: "true" },
  });
if (process.argv.includes("--prepare")) {
  console.log(
    "Verified legacy D1 access and prepared the new Cloud database. No existing migrations applied.",
  );
} else {
  await bundle();
  wrangler(["d1", "migrations", "apply", "ACCOUNT_DATA", "--remote"]);
  wrangler(["deploy"]);
  const secrets = await api<{ name: string }[]>(
    "/workers/scripts/otterware-cloud/secrets",
    "Workers Scripts Edit",
  );
  const values: Record<string, string> = {};
  if (!secrets.some((s) => s.name === "CLOUD_SECRET"))
    values.CLOUD_SECRET = Buffer.from(randomBytes(48)).toString("base64url");
  for (const name of [
    "GOOGLE_PROVIDER_CLIENT_SECRET",
    "MICROSOFT_PROVIDER_CLIENT_SECRET",
    "ACCOUNTS_SECRET",
    "MAIL_SECRET",
    "DRIVE_SECRET",
    "CONTENT_SIGNING_KEY",
  ]) {
    const value = process.env[`OTTER_CLOUD_${name}`];
    if (value) values[name] = value;
  }
  if (Object.keys(values).length) wrangler(["secret", "bulk"], JSON.stringify(values));
  const response = await fetch("https://cloud.otterware.app/health");
  if (
    !response.ok ||
    ((await response.json()) as { service?: string }).service !== "otterware-cloud"
  )
    throw new Error("Cloud deployment health check failed.");
  console.log("Deployed https://cloud.otterware.app. Old routes and namespaces were not moved.");
  for (const name of [
    "GOOGLE_PROVIDER_CLIENT_SECRET",
    "MICROSOFT_PROVIDER_CLIENT_SECRET",
    "DRIVE_SECRET",
    "CONTENT_SIGNING_KEY",
  ]) {
    if (!values[name] && !secrets.some((s) => s.name === name))
      console.log(`Not configured: ${name}`);
  }
}
