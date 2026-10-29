# Source sync provenance

The 2026-10-29 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                 |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `fe219c4de18f5ee37c28cbd3914a5569b1579156` | `0c8075170152c1aa24ab1d5a9a652adeafbbf1a5` (2026-10-28 sync); `upstream-base` stays `339179f50a` |
| `otterware-app/otter-code`     | `@@OTTER_MAIN@@`                           | `8b3f89b35d5f09867c6247657b294f5c61cce863` (2026-10-28 main, including #57–#59)                  |
| `otterware-app/otter-mail`     | `40f6085063ece8542561abfd8a399dc61156e3d9` | `ab878dc822d00e5eb7641a3937e4267c393d3949`; portable changes now through `46b114791b`            |
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

The T3 delta (94 commits) arrived through Otter Code: a three-way merge onto main `4b69e39f04`
with Otter Code's previous `main` (`8b3f89b35d`, whose #57–#59 Otterware had already taken) as
base and its new `main` as the other side. Otterware behavior moved with the code it modifies:

- Upstream's composer rework puts the attach button first in the footer, which subsumes
  Otterware's move of it; the drawer-above class stays on the composer shell's new `contextRow`.
- Upstream folded `sortProviderInstanceEntries` into `providerInstanceEntriesFor` and removed
  `ComposerControlChevron` and `useIsMobile`; Home, assistant threads and Drive use the
  replacements.
- The API-agent adapter tells the orchestration prompt whether the thread's MCP tools include
  device tools, as upstream's new prompt signature asks.
- Upstream's opt-in folder ("boring") sidebar keeps project expansion and the legacy sidebar
  opt-in; the UI store and desktop settings keep them again and their tests follow.
- The diff panel combines upstream's tool-call diffs and hide-tests filter with the scoped review
  (commit scopes, single-file view, Viewed marks). Effects touched by the merge carry the
  `no-unreasoned-state-sync` reasons the synced lint rules ask for.
- Upstream's AGENTS.md wording (no permission gate on browser verification) goes into the agent
  reference; Otterware's short AGENTS.md stays.

Otter Code's sync resolutions apply here too: upstream's T3 Chat account link stays inert, since
Otter accounts are not Clerk users and the relay has no T3 Chat secret, and the account dialog
accepts upstream's page argument. Upstream's Clerk entries stay excluded: Otter Accounts replaced
Clerk. Otter Code's CI-runner and workflow-adaptation changes are its own and are not ported.

## Mail, Drive, Calendar and Accounts

Mail selectively ports #163–#166: provider-specific Archive handling and cache relabeling, Outlook
Flagged and Snoozed, and folder moves beside Categorize. Verification-code reader cards support
Copy & trash, and Outlook holds scheduled sends through Microsoft Graph, including cancellation
and recovery, without Cloud relay changes. The host keeps its All mailboxes spaces, shell and
theme. Standalone notification actions, watcher migrations, OAuth routes and consent UI, synced
chats and AI workspace, the floating chat window, standalone chrome and release bumps stay
excluded; provider credentials and IMAP passwords stay local to the device or browser. Drive,
Calendar and Accounts have no new source commits; their previous ports stand.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101, #103, #105, #106,
#111, #112, #114, #118, #120, #123). Main's history from `4b69e39f04` is preserved and
`upstream-base` remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source baseline
and the content-limited sync overlay are generated into `scripts/otterware/source-baseline.json`;
see the fork operations exception for their checks and expiry. No required CI job or branch
protection is bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests and Microsoft Graph scheduled sends require
separately authorized test services. Calendar has no separate source refresh; shared
host/contracts changes still need its compatibility checks. Upstream's `@expo/ui` patch adds
native Android code and the mobile version moves to 2.2.0, so the mobile app needs a native build
rather than an OTA update.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
