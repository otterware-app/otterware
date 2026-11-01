# Source sync provenance

The 2026-11-01 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                 |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `ce48e459001817092f45f70f334212bb2b973288` | `80a2351fcb909034e65a512dfabeb3cdfd367762` (2026-10-31 sync); `upstream-base` stays `339179f50a` |
| `otterware-app/otter-code`     | `becc96b0a72411d69928516e8d5c8eb3283596d9` | `064a273f327032ff974ab9be666ad2f6ded6c287` (2026-10-31 main)                                     |
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

The T3 delta (262 commits) arrived through Otter Code: a three-way merge onto main `c3942fa372`
with Otter Code's previous `main` (`064a273f32`) as base and its new `main` as the other side.
Otterware behavior moved with the code it modifies:

- Upstream's side chats embed a `ChatView` (`embedded`) beside Otterware's compact assistant
  (`compact`). Both props stay: each hides the header, root panel controls, device setup host,
  right panel and focus-on-open, and pastes and window shortcuts stay with the page around them
  (`usePasteToFocusComposer` takes the compact flag next to upstream's side-chat pane check;
  `useChatShortcuts` keeps Otterware's event and command filters beside upstream's `embedded`).
- Upstream dropped the Linux `--class` switch, so the profile-derived `linuxWmClass` goes too; the
  desktop entry name still follows the profile.
- Upstream's project pinning and archiving join the command palette after the module commands.
  Re-adding an archived project unarchives it.
- `ProjectDefaultsSettings` keeps the profile setting filter beside upstream's client settings.
- `useResizableWidth` takes upstream's responsive default (a stationary click no longer saves a
  width) with the fork's shared fallback key. Upstream's tests for it join Otterware's suite.
- `.github/scripts/ci-changes.cjs` expands every `*` segment of a workspace pattern, so
  upstream's new docs-owner test reads `modules/*/*`.

Otter Code's sync resolutions apply here too: upstream's new installer and app-variant tests use
`otter-code` and `dev.otterware.code`; the linked pull request status test loads `index.css` for
the CSS-mask icons; upstream's `DiffPanel` browser test is dropped because the fork's scope menu
and target-branch picker replace the combobox it drives (that picker already keeps the worktree
cwd when a preview fails, upstream #27635); and the context budget is re-measured. Upstream's
Clerk token store stays excluded: Otter Accounts replaced Clerk. Otterware's `AGENTS.md` and
`check:changed` guidance stay its own. Otter Code's CI-runner and workflow-adaptation changes are
its own and are not ported. Upstream's migration 076 (project pin and archive columns) changes
`statev2.sqlite` only, in upstream's numbering; suite data stays in `suite.sqlite`.

## Mail, Drive, Calendar and Accounts

No source has new commits since the 2026-10-29 sync. Mail's selective port of #163–#166 and its
exclusions (standalone notification actions, watcher migrations, OAuth routes and consent UI,
synced chats and AI workspace, the floating chat window, standalone chrome and release bumps)
stand, as do the Drive, Calendar and Accounts ports. Shared sign-in is unchanged.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101 through #126).
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
host/contracts changes still need its compatibility checks. This delta changes native mobile code
(composer, terminal and review-diff Android views, the iOS background grace subscriber) and the
Expo config, so mobile needs a native rebuild; an OTA update cannot carry it.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
