# Source sync provenance

The 2026-10-24 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                                               |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `3f3a1bf419f07b4dcbb3be9f9fbb4ed54055ee4f` | `51273020db3245f4ec29514a419d29b5dcb012dc` (2026-10-23 sync); `upstream-base` stays `339179f50a84dc599cce373dbb48f172f182f44e` |
| `otterware-app/otter-code`     | `7374c643cb26ef76af629813c930de44bb5ddb15` | `2cba624125a54767bc6f0dae591e28e8f719df4d` (rebased onto t3code `3f3a1bf419`; no new fork features)                            |
| `otterware-app/otter-mail`     | `99775571800d199b8e557f1edaa8b0e71fdefc54` | Unchanged; portable changes through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d`                                                 |
| `otterware-app/otter-drive`    | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                                                            |
| `otterware-app/otter-calendar` | `56b952a950b862f081b3eb8ac7fad7fa067b6c7a` | Unchanged                                                                                                                      |
| `otterware-app/otter-accounts` | `585a09cfabbc0a3faca17a4b690cbac63f3d6288` | Unchanged                                                                                                                      |

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta (75 commits) was applied as a three-way merge with the previous integrated revision
as its base, onto main `a54d9e9cb3a30cd3ea735c22028b8407f8eac674`, so main's history and every
merged PR stay intact. Otterware behavior moved with the code it modifies:

- Upstream routes projection reads through SQLite's read-only reader; the Linear issue projection
  read (`getThreadsWithLinearIssues`) goes through the same reader as its neighbours.
- Cmd+K now hides subagent threads through `isSidebarSubagentThread`, so that helper is exported
  again; the unused multi-select menu builder stays removed.
- The desktop update fallback test keeps upstream's cases with the Otter Code release URLs.

Upstream moved mobile to Screens `5.0.0-t3.37`, which still calls the iOS 27 bar minimization
setter unguarded, so the Otter patch that guards it moves to `5.0.0-t3.37` unchanged. Upstream's
label-gated relay preview workflows and the stale "needs more info" workflow arrive unmodified.
Upstream's Clerk entries stay excluded: no `@clerk/*` catalog entries, pin or patch. Otter
Accounts replaced Clerk.

Otter Code's rebase onto the same t3code revision added no new fork features; its two resolutions
(the Screens patch and the subagent helper export) apply here as well.

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
#111). Main's history from `a54d9e9cb3a30cd3ea735c22028b8407f8eac674` is preserved and
`upstream-base` remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source
baseline and the content-limited sync overlay are generated into
`scripts/otterware/source-baseline.json`; see the fork operations exception for their checks and
expiry. No required CI job or branch protection is bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests require separately authorized test services.
Calendar has no separate source refresh; shared host/contracts changes still need its
compatibility checks. The Screens bump changes the mobile native fingerprint, so the mobile app
needs a native build rather than an OTA update.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
