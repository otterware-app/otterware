# Source sync provenance

The 2026-10-31 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                 |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `80a2351fcb909034e65a512dfabeb3cdfd367762` | `aa11ef6783da81039e6646e2e96941748afb358e` (2026-10-30 sync); `upstream-base` stays `339179f50a` |
| `otterware-app/otter-code`     | `064a273f327032ff974ab9be666ad2f6ded6c287` | `37283f5478b84dd602352723e8a77885eda48380` (2026-10-30 main)                                     |
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

The T3 delta (309 commits) arrived through Otter Code: a three-way merge onto main `fab507afae`
with Otter Code's previous `main` (`37283f5478`) as base and its new `main` as the other side.
Otterware behavior moved with the code it modifies:

- Upstream's commit review in the Diff pane (#19941) replaces the fork's own commit plumbing:
  `review.getBranchCommits` and `commitSha` stand in for `review.listCommits` and the
  `{ commit }` source request, which are gone from the contracts, the server and the Otter RPC
  group. The fork's scope menu, file tree, Viewed marks and "All changes" (`source: "all"`) stay,
  reading upstream's commit list. Otterware's commit-scope driver tests now exercise upstream's
  API.
- Upstream's back/forward history (#27430) keeps its trackpad swipe; the fork's title-band buttons
  use its Navigation API state in Electron instead of a sidebar wordmark row the fork does not
  have.
- Upstream's npm release lookup moved to the server (#27847) and queries the `otter-code`
  package; the web's own npm check and its "not on npm yet" wait are gone, as upstream intends.
- Upstream's `copyDesktopBuildArtifacts` (#24434) joins Otterware's desktop build script without
  upstream's build lock, which Otterware's script does not use. The release smoke list keeps
  `provider-api-agents` beside upstream's secret-provider packages.
- `ElectronApp` takes upstream's locale detection; `AppSidebarLayout` mounts the swipe handler
  beside the shell trackers; `OtterwareServer.test` stubs upstream's new `ProjectCloneTracker`.
- `KeybindingsSettings` drops two helpers the Otterware panel no longer called.

Otter Code's sync resolutions apply here too: upstream's new tests that assume T3 names use the
fork's scheme, `~/.otter-code/device`, `favicon.svg` and upstream's black dark canvas, and the
context budget is re-measured. Those test fixes land in Otter Code through #63, after the recorded
revision. Otterware's own scope-menu tests expect upstream's commit selection, which carries the
branch base.
Upstream's Clerk token store stays excluded: Otter Accounts replaced Clerk. Otterware's
`AGENTS.md` and `check:changed` guidance stay its own. Otter Code's CI-runner and
workflow-adaptation changes are its own and are not ported; this delta changes no workflows.
Upstream's migrations 074 (message search triggers skip attachment placeholders) and 075
(subagent delivery state) change `statev2.sqlite` only, in upstream's numbering; suite data stays
in `suite.sqlite`.

## Mail, Drive, Calendar and Accounts

No source has new commits since the 2026-10-29 sync. Mail's selective port of #163–#166 and its
exclusions (standalone notification actions, watcher migrations, OAuth routes and consent UI,
synced chats and AI workspace, the floating chat window, standalone chrome and release bumps)
stand, as do the Drive, Calendar and Accounts ports. Shared sign-in is unchanged.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101, #103, #105, #106,
#111, #112, #114, #118, #120, #123, #124, #125). Main's history from `fab507afae` is preserved and
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
