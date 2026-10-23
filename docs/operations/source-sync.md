# Source sync provenance

The 2026-10-23 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                                               |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `51273020db3245f4ec29514a419d29b5dcb012dc` | `3b95e7831b11b17627dff16843bc087bfca397ec` (2026-10-22 sync); `upstream-base` stays `339179f50a84dc599cce373dbb48f172f182f44e` |
| `otterware-app/otter-code`     | `2cba624125a54767bc6f0dae591e28e8f719df4d` | `2c07b70046aa5abdab17c343f8049896e1c432f5` (rebased onto t3code `51273020db`; no new fork features)                            |
| `otterware-app/otter-mail`     | `99775571800d199b8e557f1edaa8b0e71fdefc54` | Unchanged; portable changes through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d`                                                 |
| `otterware-app/otter-drive`    | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                                                            |
| `otterware-app/otter-calendar` | `56b952a950b862f081b3eb8ac7fad7fa067b6c7a` | Unchanged                                                                                                                      |
| `otterware-app/otter-accounts` | `585a09cfabbc0a3faca17a4b690cbac63f3d6288` | `6b844d29974758a664a4650133ac9d05a0f625e1`; its one new commit was already integrated                                          |

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta was applied as a three-way merge with the previous integrated revision as its base,
onto main `0db8a936841a591ccb350e78494f9f2f66d22e92`, so main's history and every merged PR stay
intact. Upstream registers the WebSocket handlers as two disjoint RPC groups to stay under
TypeScript's instantiation limit; the split applies to the group that already omits the Otter
and suite RPCs. Upstream also renders the chat timeline through `ThreadTimeline` and removed the
provider update launch toasts. Otterware behavior moved with that code:

- The app content surface and the ASCII background wrap `ThreadTimeline`; module thread
  accessories stay children of `ChatBannerLane`.
- The compact side-chat embed still never shows the draft hero, now keyed on `timelineEmpty`.
- The thread sidebar takes upstream's `routeReveal` inside the module-aware sidebar content; the
  legacy sidebar stays removed.
- The provider update notification files that only carried the icon mapping are removed with
  upstream's.

Upstream made `typescript` the `@tsc-rs/typescript` drop-in and dropped the `effect-tsgo` patch and
its dependency; Otterware follows. Upstream's Clerk Expo bump stays excluded: no `@clerk/*`
catalog entries, no `@clerk/expo-native-components` pin or patch. Otter Accounts replaced Clerk.

Otter Code's rebase onto the same t3code revision added no new fork features. Its resolutions
apply here as well: the `~/lib/icons` mapping beside upstream's new agent-message row icon, the
Otter Code wording in the Full Disk Access step, and the language server note in the CLI entry.

## Mail, Drive, Calendar and Accounts

Mail, Drive and Calendar have no new source commits; their previous ports stand. Accounts added
listing and revoking Code sign-ins (`/v1/auth/code/grants`); `infra/cloud/accounts` already
carries the identical `code.ts` and `worker.ts`, so shared sign-in needs no change here.
Provider credentials and IMAP passwords stay local to the device or browser; the standalone
notification watcher, its migrations, OAuth routes and consent UI, and Mail's synced chats, AI
workspace and floating chat window (#158, #159) stay excluded in favor of the host's projects,
chat orchestration and panels. Drive's standalone suite-session cookie exchange and chrome stay
excluded in favor of the host's Account capability path and module shell. The Accounts
suite-session lifetime bound (#15) is already in `infra/cloud/accounts`.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101, #103, #105, #106).
Main's history from `0db8a936841a591ccb350e78494f9f2f66d22e92` is preserved and `upstream-base`
remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source baseline and the
content-limited sync overlay are generated into `scripts/otterware/source-baseline.json`; see the
fork operations exception for their checks and expiry. No required CI job or branch protection is
bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests require separately authorized test services.
Calendar has no separate source refresh; shared host/contracts changes still need its
compatibility checks. Upstream changed native iOS modules (composer editor, sidebar tab bar
and native controls), which changes the mobile native fingerprint, so the mobile app needs a
native build rather than an OTA update.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
