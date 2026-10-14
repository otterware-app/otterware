# Otter Cloud operations and future cutover

## Parallel deployment (this PR)

Only `otterware-cloud` and `cloud.otterware.app` are deployment targets. The workflow runs on
`otterware-app/otterware` main, serializes deployments, checks access to the three existing D1
bindings, provisions `otterware-cloud` D1, applies **only** `migrations/`, then deploys. It refuses
to take a hostname another Worker owns. `accounts/migrations`, `drive/migrations`, and
`mail/migrations` are imported for local tests and future maintenance; never bulk-apply them to
production. The existing schemas need no migration for this deployment.

The new database holds provider grants, short-lived OAuth state/channel tickets, and account
sync records. A distinct `CLOUD_SECRET` is generated once and retained across deployments.
Losing or rotating it invalidates Cloud capabilities and provider/OpenRouter ciphertext. Back it
up in the secret manager, never in git or a database export. Each legacy signing secret remains
separate and must retain its exact value at cutover. Do not replace any existing signing key,
OAuth client, session token, or canonical account ID.

Required deployment token permissions on account `c2256e4c101903cb1e0aa34527ebcb81`:

- Workers Scripts Edit (new Worker, service bindings, secrets, and DOs).
- D1 Edit for creation/migrations of `otterware-cloud`; D1 Read/access to `otter-accounts`,
  `otterware` and `otter-mail-relay`.
- Workers R2 Storage access to bind `otterware-artifacts`; Browser Rendering access for Drive
  thumbnails.
- Zone Read and Workers Routes Edit on the `otterware.app` zone to create the new custom domain.

The preflight reports the failing Cloudflare endpoint, status, error code and required resource.
A Wrangler binding/domain rejection is a deployment blocker: fix the token's permissions. Do not
remove a binding or take an old route as a workaround. Preflight does not prove zone permission;
the new custom-domain deployment does.

Supply these _new repository_ secrets to enable the optional paths:

| Repository Actions secret                      | Worker secret                      | Purpose                                                                                                       |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `OTTER_CLOUD_GOOGLE_PROVIDER_CLIENT_SECRET`    | `GOOGLE_PROVIDER_CLIENT_SECRET`    | Google **Otterware - Web**, client `997327858649-hvcu3vfk5m83q9jid8g17pv6etmc491v.apps.googleusercontent.com` |
| `OTTER_CLOUD_MICROSOFT_PROVIDER_CLIENT_SECRET` | `MICROSOFT_PROVIDER_CLIENT_SECRET` | Microsoft client `b0c4e8bf-e651-456e-9bc6-408a741b36f9`                                                       |
| `OTTER_CLOUD_DRIVE_SECRET`                     | `DRIVE_SECRET`                     | Existing Drive Better Auth secret, for compatibility                                                          |
| `OTTER_CLOUD_CONTENT_SIGNING_KEY`              | `CONTENT_SIGNING_KEY`              | Existing Drive preview/thumbnail grants, accepted by current usercontent Worker                               |
| `OTTER_CLOUD_ACCOUNTS_SECRET`                  | `ACCOUNTS_SECRET`                  | Existing Accounts secret; only required at hostname cutover                                                   |
| `OTTER_CLOUD_MAIL_SECRET`                      | `MAIL_SECRET`                      | Existing Mail secret; required for the compatibility API                                                      |

Do not substitute the similarly named desktop Google client secret; refresh grants belong to
the issuing client. Add these callback URLs to the existing Web provider clients without
removing any current callback:

- `https://cloud.otterware.app/v1/cloud/providers/google/callback`
- `https://cloud.otterware.app/v1/cloud/providers/microsoft/callback`

Connecting providers is initiated from the signed-in browser: its Cloud request includes
credentials so the host-only HttpOnly state cookie survives the provider redirect. Environments
consume the resulting connections; they do not move an installed desktop client's refresh token
into this database. Disconnect removes the stored grant and stops further hand-outs. It does not
revoke all Google permissions on the shared sign-in client; an already-issued provider bearer
can remain valid until Google/Microsoft expires it.

The Cloud channel subscribes to the existing `UserHub` through `script_name: otter-mail-relay`.
Existing linked Mail accounts therefore receive their current Gmail push without touching
Pub/Sub. Cloud-only connections can use a **second** subscription to
`projects/otterware/topics/gmail-push`, posting to `https://cloud.otterware.app/push/gmail`, with
that exact OIDC audience and service account `gmail-push-relay@otterware.iam.gserviceaccount.com`.
Keep the existing subscription active. Creating this subscription requires Google Cloud Pub/Sub
subscription administration and permission to attach that service account; the Cloudflare token
cannot do it. Module engines must register/renew Gmail watches, as before. Duplicate history IDs
can arrive during overlap and are normal; engines catch up from their local Gmail cursor.

No standalone profile releases, old-repository deploys, DO transfers, custom-domain moves, old
schema changes, or changes to existing Pub/Sub subscriptions belong to this stage.

## Client and data semantics

`@otterware/otter-cloud-client` exports Effect Schema contracts and `OtterCloudClient`:

```ts
const cloud = new OtterCloudClient({ origin, audience: environmentId, sessionToken });
await cloud.accessToken(audience); // Promise<string>, 15-minute Cloud capability
await cloud.connections();
await cloud.connect("google", scopes, returnTo); // browser: open returned URL
await cloud.disconnect(connectionId);
await cloud.providerToken(connectionId); // { accessToken, expiresAt, audience, scopes, connectionId }
await cloud.push(records);
await cloud.pull(cursor);
const channel = await cloud.openChannel(onEvent);
await channel.ready;
await channel.providerToken(connectionId);
await channel.push(records);
await channel.pull(cursor);
channel.close();
cloud.clearSession();
```

`sessionToken` returns an existing offline Otter **account session**, not an OAuth refresh token
and not a provider token. Code's current OAuth flow can obtain it through Accounts'
`/v1/auth/suite/session`; the host owns refreshing sign-in and protecting this session. This
adapter lets W2 provide `accessToken(audience)`/`providerToken(connectionId)` without depending on
a module engine. The audience identifies the environment/browser. Cloud checks it and account
revocation before access; Google/Microsoft access tokens themselves remain ordinary provider
bearers. The audience binding is on the Cloud hand-out, not a claim that Google sender-constrains
the returned bearer token.

Cloud capabilities contain the account session encrypted under a purpose-derived key; it is
never exposed as a cookie or to another audience. WebSockets use a 30-second single-use ticket
instead of placing an offline token in a URL. Each message and event rechecks account validity;
an alarm closes invalid idle sessions within one minute. Tokens expire after at most 15 minutes.
On socket close, reconnect using a fresh ticket, re-request pending operations, and pull from the
persisted sync cursor. The client rejects outstanding requests on disconnect rather than silently
replaying writes. The legacy push bridge keeps a hub awake while clients are connected; remove
this outbound socket bridge when push delivery is cut over.

Sync collections are `settings`, `mail.projects`, `mail.views`, `home.projects`. Save locally first
and queue `{ collection, id, value, modifiedAt, mutationId }` in the module's SQLite transaction.
Use one stable UUID per mutation and UTC epoch milliseconds; `null` is a retained tombstone.
Cloud compares `(modifiedAt, mutationId)` atomically, giving equal timestamps a deterministic
winner. Push returns the winning records even for losing/retried writes. Pull uses a monotonic
revision cursor, max 100 records per page; apply records and advance the cursor atomically.
Only remove an outbox entry when the corresponding mutation has been acknowledged, preserving
newer local edits. `sync.changed` is an invalidation hint, never the copy of record. Devices with
no account continue using the same local store and outbox.

The imported Drive API is at `/api/v1/`; it accepts API keys/Drive sessions and Cloud tokens.
Cloud users get a Drive identity and personal drive on their first authenticated request, linked
by the verified Otter Account subject (never by matching email).
Preview and thumbnail grants continue targeting **only** `usercontent.otterware.app`, using the
existing key. The Cloud host rejects `/raw/*` before dispatch. The Cloud build ships the
standalone Drive profile under `public/drive/`; moving the canonical Drive hostname still waits
for cutover. CLI device approval at `/device` is served by the Worker
on that canonical hostname, independently of the SPA, using Drive's Otter Account OAuth session.
The CLI source is in `apps/drive-cli/`, built by `build:cli`. Its separate
`publish-drive-cli.yml` workflow publishes to npm only on manual dispatch.

OpenRouter uses `/v1/cloud/agent/*` and a new `CloudAgentHub` namespace, preserving the imported
`/connection`, `/sessions`, `/turn`, `/tool-result`, and `/cancel` protocol. Keys are sealed;
turns run in Cloud; client-supplied tools are executed by the browser/environment. The portable client exposes `agentConnection`, `connectAgent`, `disconnectAgent`,
`agentSessions`, `agentMessages`, `deleteAgentSession`, `agentTurn` (typed SSE async iterator),
`answerAgentTool`, and `cancelAgentTurn`. Pass an AbortSignal for each streamed turn. Existing Mail
chat history and keys stay in its existing `AgentHub` until the agreed migration.
Mail compatibility routes are exposed under `/v1/cloud/mail/*` (the suffix maps to `/v1/*`),
with both Cloud and current account-session authorization. The original hostname router also
retains Mail MCP, APNs, Gmail callbacks, and IMAP TCP tunnel behavior for the later cutover.

## Ordered hostname/object cutover — do not execute in this PR

1. Coordinate W2/W5/W6/W7/W8 so the five profiles are ready together (ADR 0016). Inventory current
   Worker versions, custom-domain IDs, DO namespace IDs, D1 migration records, OAuth clients,
   secret names and versions, and Pub/Sub subscriptions. Record rollback versions privately;
   never export tokens/database contents into this repo. Back up each database with the approved
   D1 recovery procedure. Verify a clean install and an existing install of each profile.
2. Supply all existing secrets to the consolidated Worker **without rotating them**. Preserve
   the imported `accounts/vars.json` and `mail/vars.json` native/legacy client audiences, cookie
   rules, APNs team/key/topics, Google legacy Web secret, email delivery, URLs and issuer.
   `Env` supports `LEGACY_GOOGLE_WEB_CLIENT_SECRET`, `APNS_*`, and `RESEND_API_KEY`; provision
   these directly through the secret manager before turning on legacy hosts. Verify every
   required variable against the inventory instead of assuming source defaults are current.
3. Configure W5 static assets in `public/`. Build `src/cutover-worker.ts`, which exports the old
   `MailIdentity` and `IdentityLifecycle` RPC entrypoints plus `UserHub` and `AgentHub` with the
   database/secret adapters. Stage `LEGACY_HOSTS=enabled` **without moving routes yet**. Accounts
   keeps issuer **`https://accounts.otterware.app/v1/auth`** and the existing D1 signing-key rows.
   Keep the old three D1 bindings and all R2 objects. Do not run imported historical migrations.
4. Prepare the old Mail Worker to reference its DO classes through `script_name: otterware-cloud`
   after transfer. Keep its old code/version available as a proxy rollback. Separately arrange
   Accounts/Mail service bindings to use `otterware-cloud#MailIdentity` and
   `otterware-cloud#IdentityLifecycle`; the consolidated Worker uses those same private
   entrypoints, so deletion/sign-out close Cloud channels and clear new account data too.
5. Transfer the **existing** Mail DO namespaces; never create replacement `UserHub`/`AgentHub`
   namespaces or rename instance IDs. For this PR's pinned Wrangler migration format, append a
   new migration (do not edit `v1`):

   ```json
   {
     "tag": "mail-cutover-v2",
     "transferred_classes": [
       { "from": "UserHub", "from_script": "otter-mail-relay", "to": "UserHub" },
       { "from": "AgentHub", "from_script": "otter-mail-relay", "to": "AgentHub" }
     ]
   }
   ```

   Switch `LEGACY_USER_HUB` and `LEGACY_AGENT_HUB` to the local transferred classes, retaining
   `idFromName(userId)`. Test existing socket reconnects and chat/key reads before proceeding.
   Cloudflare also supports declarative `exports` with a coordinated expecting-transfer/source
   transfer sequence; if Wrangler is upgraded, follow its current documentation instead of
   mixing those protocols. See [class transfer documentation](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
   and the [legacy migration format](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/durable-objects/reference/durable-object-class-migrations-legacy.mdx).

6. Move custom domains in a maintenance window, one service at a time: Drive and isolated
   usercontent together, Mail (including `.dev` aliases), then Accounts. Remove each domain from
   its old Worker immediately before adding it to the new Worker. These operations are not
   atomic; capture and verify each result. Keep all legacy OAuth callback URLs and public paths.
   Never broaden cookies to `.otterware.app`; Accounts uses its host-only `__Host-` cookies,
   Mail retains only its existing narrow Mail domain, and usercontent remains separate.
7. Validate canonical OIDC discovery/JWKS, Code PKCE/offline refresh, existing Mail sessions and
   browser sign-out, Drive CLI API keys/device login/sharing/content sessions, APNs delivery,
   Gmail Pub/Sub retries, IMAP TLS tunnel, OpenRouter tool replies, Cloud provider refresh and
   sync after an offline edit. Verify raw HTML cannot reach first-party cookies. Then switch
   Gmail delivery to the consolidated handler and remove the outbound legacy socket bridge;
   retain/reconcile duplicate history notifications during overlap. Only retire the extra
   Pub/Sub subscription after engines catch up.
8. Ship the coordinated five profiles, then the separately approved old-repository migration
   releases. Archive old repos/Workers only after installed clients have transitioned and
   rollback is no longer needed. Do not delete old D1 tables, keys or R2 objects here.

Before object transfer, rollback is redeploying the previous new Worker version; old Workers are
unaffected. After transfer, **moving a domain back alone is not rollback**: old code must keep
binding the transferred namespaces in Cloud (or execute a separately planned reverse transfer).
Restore service bindings and routing coherently, then verify sessions and objects before reopening
traffic. Database rollback is not part of normal route rollback; all changes remain additive.
