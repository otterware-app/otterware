// @effect-diagnostics nodeBuiltinImport:off - Actions preflight runs before workspace dependencies are installed.
import * as NodeFS from "node:fs";
import { resolveProfile } from "../../profiles/index.ts";

/** Only new preview Workers/domains are deployable from this config. */
const profile = resolveProfile(process.env.OTTERWARE_PROFILE);
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId || !/^[a-f0-9]{32}$/.test(accountId))
  throw new Error("Missing Cloudflare account ID");
const host = `${profile.id}.next.otterware.app`;
NodeFS.writeFileSync(
  "scripts/otterware/.web-preview.json",
  JSON.stringify({
    name: `otterware-next-${profile.id}`,
    account_id: accountId,
    main: "../otter/web/worker.mjs",
    compatibility_date: "2026-10-13",
    workers_dev: true,
    assets: {
      directory: "../../apps/web/dist",
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: true,
    },
    routes: [{ pattern: host, custom_domain: true }],
  }),
);
process.stdout.write(`Preview: https://${host}\n`);
