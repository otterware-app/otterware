# Source sync provenance

The 2026-10-30 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                 |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `aa11ef6783da81039e6646e2e96941748afb358e` | `fe219c4de18f5ee37c28cbd3914a5569b1579156` (2026-10-29 sync); `upstream-base` stays `339179f50a` |
| `otterware-app/otter-code`     | `OTTER_CODE_MAIN`                          | `c776aa0079f56f7130fb99bc64a50dcf05eef7e7` (2026-10-29 main)                                     |
| `otterware-app/otter-mail`     | `40f6085063ece8542561abfd8a399dc61156e3d9` | Unchanged; portable changes through `46b114791b`                                                 |
| `otterware-app/otter-drive`    | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                              |
| `otterware-app/otter-calendar` | `56b952a950b862f081b3eb8ac7fad7fa067b6c7a` | Unchanged                                                                                        |
| `otterware-app/otter-accounts` | `585a09cfabbc0a3faca17a4b690cbac63f3d6288` | Unchanged                                                                                        |

This sync stops at the t3code revision Otter Code integrated, so both products carry the same T3
delta.

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta (136 commits) arrived through Otter Code: a three-way merge onto main `87ce626682`
with Otter Code's previous `main` (`c776aa0079`) as base and its new `main` as the other side.
Otterware behavior moved with the code it modifies:

- Settings keep Otterware's profile wordmark and per-profile visibility beside upstream's new
  imports; the Appearance panel keeps window appearance beside upstream's thread-details row, and
  the settings nav keeps project groups beside upstream's Secrets page.
- The CLI release repository still comes from the active profile's server release; upstream's
  release-page URL and version helpers derive from it.
- Otter Code #61 (empty-thread hero during long turns) is covered by Otterware's stricter gate
  from #119, which also waits for running work and worktree setup; the duplicate is dropped.
- Upstream's undo notice joins the sidebar utility row, which the fork renders on every page,
  since Settings, Pull requests and Usage live in the space rail.
- Otterware's `check:changed` stays its own script; upstream's rewrite of
  `scripts/check-changed.ts` and its AGENTS.md wording about it are not wired up here.
- Upstream's release-notes and draft-then-publish prerelease steps arrive in the inherited
  `release.yml`; Otterware publishes through `otterware-release.yml`.

Otter Code's sync resolutions apply here too: upstream's new CLI shadowing tests use the profile's
command name, the code-intelligence panel width fallback key composes with upstream's `setWidth`,
and the context budget is re-measured. Upstream's Clerk entries stay excluded: Otter Accounts
replaced Clerk. Otter Code's CI-runner and workflow-adaptation changes are its own and are not
ported. Upstream's migration 073 adds indexes to `statev2.sqlite` only; suite data stays in
`suite.sqlite`.

## Mail, Drive, Calendar and Accounts

No source has new commits since the 2026-10-29 sync. Mail's selective port of #163–#166 and its
exclusions (standalone notification actions, watcher migrations, OAuth routes and consent UI,
synced chats and AI workspace, the floating chat window, standalone chrome and release bumps)
stand, as do the Drive, Calendar and Accounts ports. Shared sign-in is unchanged.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101, #103, #105, #106,
#111, #112, #114, #118, #120, #123, #124). Main's history from `87ce626682` is preserved and
`upstream-base` remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source baseline
and the content-limited sync overlay are generated into `scripts/otterware/source-baseline.json`;
see the fork operations exception for their checks and expiry. No required CI job or branch
protection is bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests and Microsoft Graph scheduled sends require
separately authorized test services. Calendar has no separate source refresh; shared
host/contracts changes still need its compatibility checks. This delta changes no native mobile
code or dependencies, so mobile changes can ship as an OTA update.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
