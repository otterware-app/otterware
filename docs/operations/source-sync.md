# Source sync provenance

The 2026-10-25 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                                               |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `a0e0f8a80ae4caa6c32d3306a10a284e252c88d3` | `3f3a1bf419f07b4dcbb3be9f9fbb4ed54055ee4f` (2026-10-24 sync); `upstream-base` stays `339179f50a84dc599cce373dbb48f172f182f44e` |
| `otterware-app/otter-code`     | `6d117502bd24398c92b7e86d0e8a6ca8742afbd0` | `7374c643cb26ef76af629813c930de44bb5ddb15` (rebased onto t3code `a0e0f8a80a`; #52 is its only new fork change)                 |
| `otterware-app/otter-mail`     | `99775571800d199b8e557f1edaa8b0e71fdefc54` | Unchanged; portable changes through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d`                                                 |
| `otterware-app/otter-drive`    | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                                                            |
| `otterware-app/otter-calendar` | `56b952a950b862f081b3eb8ac7fad7fa067b6c7a` | Unchanged                                                                                                                      |
| `otterware-app/otter-accounts` | `585a09cfabbc0a3faca17a4b690cbac63f3d6288` | Unchanged                                                                                                                      |

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta (82 commits) was applied as a three-way merge with the previous integrated revision
as its base, onto main `85c1402bb37e4794127946f8bcf913aa81d3b0bf`, so main's history and every
merged PR stay intact. Files Otterware had not changed since the Otter Code revision it last
integrated take Otter Code's resolution of the same delta; the rest were merged against it.
Otterware behavior moved with the code it modifies:

- The command palette keeps its module items and profile filter on upstream's new settings
  matcher (`settingsForThisPlatform`).
- The root route keeps the retained Activity shell; upstream's guest page returns before it, and
  `GuestShareDialogHost` joins the first-run gate's hosts.
- The server build keeps the module-worker plugin and the executable's bundling predicates;
  `ElectronApp` keeps `requestSingleInstanceLock`.
- Upstream's new Beta settings panel signs in through Otter Accounts instead of Clerk.

Upstream moved mobile to Screens `5.0.0-t3.43`, which still calls the iOS 27 bar minimization
setter unguarded, so the Otter patch that guards it moves to `5.0.0-t3.43` unchanged. Upstream's
Clerk entries stay excluded: no `@clerk/*` catalog entries, pin or patch. Otter Accounts replaced
Clerk.

Otter Code's #52 (update, setup and triage paths on the fork, the relay deploy limited to the
otter-code repository) is ported. Its sync resolutions apply here too: the Screens patch, the
Beta panel's sign-in, the exported `shouldOpenPullRequestExternally` the Linear badges use, and
the Linux desktop-entry fixture under Otter's ID.

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
#111, #112). Main's history from `85c1402bb37e4794127946f8bcf913aa81d3b0bf` is preserved and
`upstream-base` remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source
baseline and the content-limited sync overlay are generated into
`scripts/otterware/source-baseline.json`; see the fork operations exception for their checks and
expiry. No required CI job or branch protection is bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests require separately authorized test services.
Calendar has no separate source refresh; shared host/contracts changes still need its
compatibility checks. Upstream's Screens bump, native highlighter (`@pierre/highlights`) and
Enriched Markdown update change the mobile native fingerprint, so the mobile app needs a native
build rather than an OTA update.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
