# Source sync provenance

The 2026-10-26 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                                               |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `6a3a460b09e70f06eebfd46ad304c74b96afa179` | `a0e0f8a80ae4caa6c32d3306a10a284e252c88d3` (2026-10-25 sync); `upstream-base` stays `339179f50a84dc599cce373dbb48f172f182f44e` |
| `otterware-app/otter-code`     | `4deec789c3d1eac7326b1a8c75372a63f3a9bc8b` | `6d117502bd24398c92b7e86d0e8a6ca8742afbd0` (rebased onto t3code `6a3a460b09`; #54 holds its new fork changes)                  |
| `otterware-app/otter-mail`     | `99775571800d199b8e557f1edaa8b0e71fdefc54` | Unchanged; portable changes through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d`                                                 |
| `otterware-app/otter-drive`    | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                                                            |
| `otterware-app/otter-calendar` | `56b952a950b862f081b3eb8ac7fad7fa067b6c7a` | Unchanged                                                                                                                      |
| `otterware-app/otter-accounts` | `585a09cfabbc0a3faca17a4b690cbac63f3d6288` | Unchanged                                                                                                                      |

Upstream `main` had moved past `6a3a460b09` by publication; this sync stops at the revision Otter
Code integrated so both products carry the same T3 delta.

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta (204 commits) arrived through Otter Code: a three-way merge onto main `b52ec5881f`
with the last integrated Otter Code revision (`6d117502bd`) as base and Otter Code's new `main` as
the other side, so files Otterware had not changed take Otter Code's resolution of the same delta
and main's history and every merged PR stay intact. Otterware behavior moved with the code it
modifies:

- Settings and Usage open as upstream's modal over the app. Otterware's account, modules and module
  pages moved under `_chat.settings`, and the settings nav keeps its module groups and keybinding
  chips inside upstream's compact, icon-rail layout. The thread sidebar no longer swaps to settings.
- The root route keeps the retained Activity shell, the standalone pages and the first-run gate;
  document title, appearance, notifications, toasts and update notices now start in `appInit` as
  upstream moved them.
- Otter Accounts drives upstream's new `createCloudAccountService` on web and mobile through
  `createOtterAccountSource` (from Otter Code), replacing the account bridges.
- The module agent instructions stay appended after upstream's rewritten runtime instructions.
- Upstream's lint and effect diagnostics now cover Otterware code: Calendar reminders, module tool
  dispatch and the Home and Calendar tests follow them, and fork effects carry reasons for
  `t3code/react-effect-budget`.
- Upstream's new `infra/task-cache` uses the suite's `@cloudflare/workers-types` 5 pin: Alchemy's
  bindings resolve the single workspace version that Otter Cloud requires.
- CI keeps Otterware's own plan-based `ci.yml` and release workflows; upstream's task-cache CI
  setup is not adopted.

Upstream moved mobile to Screens `5.0.0-t3.44`, which still calls the iOS 27 bar minimization
setter unguarded, so the Otter guard patch moves to `5.0.0-t3.44` unchanged. Upstream's Clerk
entries stay excluded: Otter Accounts replaced Clerk.

Otter Code's #54 resolutions apply here too: the account source, the code intelligence schemas'
`Schema.TaggedStruct`, the `DocumentText` test layers, the installer test following the fork's
release repository and browser tests pre-bundling `@tabler/icons-react`. Its CI-runner and
workflow-adaptation changes are Otter Code's own and are not ported.

## Mail, Drive, Calendar and Accounts

Mail, Drive, Calendar and Accounts have no new source commits; their previous ports stand.
Provider credentials and IMAP passwords stay local to the device or browser; the standalone
notification watcher, its migrations, OAuth routes and consent UI, and Mail's synced chats, AI
workspace and floating chat window (#158, #159) stay excluded in favor of the host's projects,
chat orchestration and panels. Drive's standalone suite-session cookie exchange and chrome stay
excluded in favor of the host's Account capability path and module shell. The Accounts
suite-session lifetime bound (#15) and Code sign-in grants are already in `infra/cloud/accounts`.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101, #103, #105, #106,
#111, #112, #114). Main's history from `b52ec5881f65a7df9431e6ee601ab6f3d9261651` is preserved and
`upstream-base` remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source
baseline and the content-limited sync overlay are generated into
`scripts/otterware/source-baseline.json`; see the fork operations exception for their checks and
expiry. No required CI job or branch protection is bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests require separately authorized test services.
Calendar has no separate source refresh; shared host/contracts changes still need its
compatibility checks. Upstream's Screens `5.0.0-t3.44` and Enriched Markdown updates change the
mobile native fingerprint, so the mobile app needs a native build rather than an OTA update.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
