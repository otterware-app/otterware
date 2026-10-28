# Source sync provenance

The 2026-10-28 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                 |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `0c8075170152c1aa24ab1d5a9a652adeafbbf1a5` | `5d91ab1117ad51ef1288a94717d85c70e7af09fe` (2026-10-27 sync); `upstream-base` stays `339179f50a` |
| `otterware-app/otter-code`     | `deebed1e30a6ecc4557fba72134ec57a1e8c81fc` | `99a8f4cc32f5d279fc011867e5e558cec6b5bf90` (rebased onto t3code `0c80751701`; no new fork PRs)   |
| `otterware-app/otter-mail`     | `ab878dc822d00e5eb7641a3937e4267c393d3949` | `a86a0691b6c52d7637928ffdd6fbd7c2b1a730ef`; portable changes still through `a86a0691b6`          |
| `otterware-app/otter-drive`    | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                              |
| `otterware-app/otter-calendar` | `56b952a950b862f081b3eb8ac7fad7fa067b6c7a` | Unchanged                                                                                        |
| `otterware-app/otter-accounts` | `585a09cfabbc0a3faca17a4b690cbac63f3d6288` | Unchanged                                                                                        |

Upstream `main` had moved past `0c80751701` by publication; this sync stops at the revision Otter
Code integrated so both products carry the same T3 delta.

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta (171 commits) arrived through Otter Code: a three-way merge onto main `7a6a432e91`
with the last integrated Otter Code revision (`99a8f4cc32`) as base and Otter Code's new `main` as
the other side, so files Otterware had not changed take Otter Code's resolution of the same delta
and main's history and every merged PR stay intact. Otterware behavior moved with the code it
modifies:

- Upstream moved the provider client registry into `@t3tools/client-runtime/provider-clients`,
  shared by web and mobile. Otterware's API-key agent clients register there; that file replaces
  web's `providerDriverMeta.ts` and mobile's `providerClients.ts` as the provider seam.
- Upstream's MCP `layerTools` is the tool set its context-budget test measures. Module toolkits
  join in `McpHttpServer.layer`, outside that set.
- The desktop queues macOS `open-url` events that arrive before configure. Mail's URL handler is
  first in the queued handler, as it was in the listener.
- The root route keeps its shell gate, standalone pages and shell readiness, and gains upstream's
  dev Replay host and the link coordinator for a disabled local environment.
- Upstream made the settings sections a keyboard tree. The Otterware nav keeps its module groups
  and keybinding chips without it.
- Upstream deleted the unreachable `v2EventPresentation` and the lifecycle row's compaction case;
  Otterware's copies go with them.
- The sidebar's project scope is now a list (`sidebarProjectScopeKeys`); Otterware's space tests
  follow it.
- Upstream's `no-unreasoned-state-sync` rule replaces the effect budget; Otterware's effect
  directives use the new rule name.
- The module server test provides upstream's new peer-link services.

Otter Code's sync resolutions apply here too: the `ottercode://pair` scheme for upstream's pairing
links, Otter's release and source URLs in startup recovery and triage, Otter account surfaces on
upstream's `StandalonePage`, and the iOS 27 guard patch moved to upstream's Screens
`5.0.0-t3.48`, which still calls the bar minimization setter unguarded. Upstream's unreachable-code
cleanup removed the relay worker's default export, which Alchemy's bundle entry imports; it is
restored (Otter Code #57). The MCP tool list budget records the fork's Linear tools (#58). The relay's merge
migration records upstream's delivery-attempt retention head and Otterware's own earlier merge
head. Upstream's Clerk entries stay excluded: Otter Accounts replaced Clerk. Otter Code's
CI-runner and workflow-adaptation changes are its own and are not ported.

## Mail, Drive, Calendar and Accounts

Mail's #161 and #162 are not ported. #162 replaces the standalone app's rail with one sidebar of
mailbox tabs, and #161 restyles its list, reader and cards on a palette of its own; in Otterware
the host shell owns the rail and sidebar and Mail follows the host theme. Their v0.13.14 and
v0.13.15 release bumps are not ported either. Drive, Calendar and Accounts have no new source
commits; their previous ports stand. Provider credentials and IMAP passwords stay local to the
device or browser; the standalone notification watcher, its migrations, OAuth routes and consent
UI, and Mail's synced chats, AI workspace and floating chat window (#158, #159) stay excluded in
favor of the host's projects, chat orchestration and panels. Drive's standalone suite-session
cookie exchange and chrome stay excluded in favor of the host's Account capability path and
module shell. The Accounts suite-session lifetime bound (#15) and Code sign-in grants are already
in `infra/cloud/accounts`.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101, #103, #105, #106,
#111, #112, #114, #118, #120). Main's history from `7a6a432e91` is preserved and `upstream-base`
remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source baseline and the
content-limited sync overlay are generated into `scripts/otterware/source-baseline.json`; see the
fork operations exception for their checks and expiry. No required CI job or branch protection is
bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests require separately authorized test services.
Calendar has no separate source refresh; shared host/contracts changes still need its
compatibility checks. Upstream's Screens `5.0.0-t3.48` update and its Expo Observe endpoint in the
app config change the mobile native fingerprint, so the mobile app needs a native build rather
than an OTA update.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
