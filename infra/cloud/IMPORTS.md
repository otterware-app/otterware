# Source import

These files are owned here after import (ADR 0003); this is not a vendoring/sync mechanism.

- Accounts: `otterware-app/otter-accounts` at `6b844d29974758a664a4650133ac9d05a0f625e1`.
- Drive API, contracts and CLI: `otterware-app/otter-drive` at `22e2ec10211ef2f510d85d862ccb8b43fc27b05a`.
- Mail relay, its used contracts, OpenRouter runner and instructions:
  `otterware-app/otter-mail` at `e1f8aaa201cc7dfb596083249485590e8eb9602d`.

The Drive UI belongs to W5. The imported Worker code keeps Hono/Zod within `infra/cloud`;
the portable public client uses Effect Schema. Cloud's TypeScript configuration extends the
repository's compiler config; Effect-only ambient-I/O diagnostics are disabled for the Hono
Worker and Promise-based portable client. Runtime tests use isolated local databases and fake
identities. `mail/wrangler.test.jsonc` is solely an imported local-test fixture, never a deployment
configuration. The only deployment script uses `otterware-cloud`.

Accounts' existing Better Auth logout compatibility patch is applied during bundling (including
its runtime tests) in `scripts/bundle.ts`: Workers does not support `redirect: error`; manual
redirect handling still rejects a 3xx response. Package versions must keep that patch applicable.
