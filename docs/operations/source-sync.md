# Source sync provenance

The 2026-10-22 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                                                |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `pingdotgg/t3code`             | `3b95e7831b11b17627dff16843bc087bfca397ec` | `680152e27b2a961686389ca69a1557cbb2c55f08` (2026-10-21b sync); `upstream-base` stays `339179f50a84dc599cce373dbb48f172f182f44e` |
| `otterware-app/otter-code`     | `2c07b70046aa5abdab17c343f8049896e1c432f5` | `c9c19ffbe0b08e701b3e91a86abe7f01bf5b0039` (rebased onto t3code `3b95e7831b`; no new fork features)                             |
| `otterware-app/otter-mail`     | `99775571800d199b8e557f1edaa8b0e71fdefc54` | Unchanged; portable changes through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d`                                                  |
| `otterware-app/otter-drive`    | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                                                             |
| `otterware-app/otter-calendar` | `56b952a950b862f081b3eb8ac7fad7fa067b6c7a` | Unchanged                                                                                                                       |
| `otterware-app/otter-accounts` | `6b844d29974758a664a4650133ac9d05a0f625e1` | Unchanged                                                                                                                       |

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta was applied as a three-way merge with the previous integrated revision as its base,
onto main `7001b075cc2374afdff3480793ed5d0538154e0f`, so main's history and every merged PR stay
intact. Upstream moved more of ChatView into hooks (`useComposerSend`, `useComposerResume`,
`useTimelineRewind`, `usePasteToFocusComposer`, `ChatBannerLane` and others), split the composer
controls into `ComposerControlsBar`, moved the add-environment form into `AddEnvironmentDialog` and
rewrote `useChatShortcuts` on effect events. Otterware behavior moved with that code:

- The compact side-chat embed keeps its props, shortcut filter and outgoing-message decoration;
  the decoration now lives in `useComposerSend`. The paste redirect takes a `disabled` flag that
  compact embeds set.
- `useChatShortcuts` keeps the embed's event and command filters on the new effect events.
- Module thread accessories render as a child of `ChatBannerLane`, the banner container they
  previously shared.
- The Linear surface, the app content surface and the ASCII background stay in ChatView.

Upstream's Clerk changes stay excluded: its OAuth cancellation, the `@clerk/electron` patch and
the `exposeClerkBridge` preload call. Otter Accounts replaced Clerk.

Otter Code's rebase onto the same t3code revision added no new fork features. Its ports into
upstream's split files apply here as well:

- the `~/lib/icons` mapping in the new timeline, pull request and settings files;
- the composer's control order and model picker placement in `ComposerControlsBar`;
- the attachment `+` icon;
- the pull request list surface;
- Otter Connect wording in `AddEnvironmentDialog`.

Otter Code's iOS 27 `react-native-screens` guard is registered again for upstream's
`5.0.0-t3.36` tarball; the earlier `t3.27` patch file was unregistered and is removed. Upstream's
guidance on proof for bug fixes is carried into the agent reference.

## Mail, Drive, Calendar and Accounts

Mail, Drive, Calendar and Accounts have no new source commits; their previous ports stand.
Provider credentials and IMAP passwords stay local to the device or browser; the standalone
notification watcher, its migrations, OAuth routes and consent UI, and Mail's synced chats, AI
workspace and floating chat window (#158, #159) stay excluded in favor of the host's projects,
chat orchestration and panels. Drive's standalone suite-session cookie exchange and chrome stay
excluded in favor of the host's Account capability path and module shell. The Accounts
suite-session lifetime bound (#15) is already in `infra/cloud/accounts`.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101, #103, #105).
Main's history from `7001b075cc2374afdff3480793ed5d0538154e0f` is preserved and `upstream-base`
remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source baseline and the
content-limited sync overlay are generated into `scripts/otterware/source-baseline.json`; see the
fork operations exception for their checks and expiry. No required CI job or branch protection is
bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests require separately authorized test services.
Calendar has no separate source refresh; shared host/contracts changes still need its
compatibility checks. The `react-native-screens` tarball and patch change the mobile native
fingerprint, so the mobile app needs a native build rather than an OTA update.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
