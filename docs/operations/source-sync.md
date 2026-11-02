# Source sync provenance

The 2026-11-02 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                 |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `d890e5c40120769badcf18bff6d1ac983c8f40c7` | `ce48e459001817092f45f70f334212bb2b973288` (2026-11-01 sync); `upstream-base` stays `339179f50a` |
| `otterware-app/otter-code`     | `bbb6d282934c6e8dc3573c50a2175a47cc9d3b61` | `becc96b0a72411d69928516e8d5c8eb3283596d9` (2026-11-01 main)                                     |
| `otterware-app/otter-mail`     | `d55f0218980205cdacf330b20d41e3a25872d1b5` | `40f6085063ece8542561abfd8a399dc61156e3d9`; portable changes now through `1ee888f957`            |
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

The T3 delta (174 commits) arrived through Otter Code: a three-way merge onto main `d620ac2eb2`
with Otter Code's previous `main` (`becc96b0a7`) as base and its new `main` as the other side.
Two files conflicted, and Otterware behavior moved with the code it modifies:

- `ChatView` renders upstream's `ChildThreadApprovals` above the composer, whose shell keeps
  Otterware's drawer class for the draft hero state.
- The About settings panel keeps the profile wordmark above upstream's managed-policy
  Organization row.

Otter Code's sync resolutions apply here too: the fork keeps no privacy-policy or usage-data
notice, so upstream's managed-policy `telemetryOff` wording in the welcome wizard and About panel
goes with it (and its helper); upstream's `connectDenial` texts say Otter Connect; the project
scope combobox that upstream changed stays replaced by the rail; the update pill drops `min-w-0`
as upstream did, so the undo notice cannot squeeze it out; and the context budget is
re-measured. Upstream's new relaunch test passes app links in the profile's scheme
(`getDesktopScheme`), not `t3code`. Upstream's Clerk token store stays excluded: Otter Accounts
replaced Clerk. Otterware's `AGENTS.md` and `check:changed` guidance stay its own. Otter Code's
CI-runner and workflow-adaptation changes are its own and are not ported. The delta adds no
`statev2.sqlite` migration; suite data stays in `suite.sqlite`.

## Mail, Drive, Calendar and Accounts

Mail was reviewed through `d55f021`, with portable changes through `1ee888f957`. The selective
port of #171–#175 adapts message-list typography, outlined label chips, dense wide rows, text day
headings, unread/read surfaces and selection to Otterware's Mail content, and removes the
dim-read and list-style preferences (their synced `otter:` keys go too). Host typography, themes
and chrome remain authoritative. The earlier exclusions stand; this delta adds #167–#170's agent
chats, window tabs and standalone sidebar (AI workspace and standalone chrome), #176–#177's
native iPhone app, #178's standalone extension architecture (invitations, codes, translation and
Todoist keep their behavior here without it) and release bumps. Drive, Calendar and Accounts
have no new commits, and shared sign-in is unchanged.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101 through #127).
Main's history from `fab507afae` is preserved and `upstream-base` remains
`339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source baseline and the
content-limited sync overlay are generated into `scripts/otterware/source-baseline.json`; see the
fork operations exception for their checks and expiry. No required CI job or branch protection is
bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests and Microsoft Graph scheduled sends require
separately authorized test services. Calendar has no separate source refresh; shared
host/contracts changes still need its compatibility checks. This delta changes only JavaScript
in mobile, but installed binaries predate earlier native changes, so mobile still needs a native
rebuild before an OTA update can reach them.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
