# Source sync provenance

The 2026-10-21 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                      | Fetched revision                           | Earlier baseline                                                                                                               |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`          | `74541bab17270c35f4418d4e543d85628632ed8f` | `67c0fc0cdaf963b103518862dd7b68a9c758ecf2` (2026-10-20 sync); `upstream-base` stays `339179f50a84dc599cce373dbb48f172f182f44e` |
| `otterware-app/otter-code`  | `ec59f9ded384917df61e868d07baf41c5a4c979b` | `63bcbc5ab35c598bee33450dc908d9765b3effee`, reconciled with monorepo `0b2778ae7f0227ca0c13761947b37a8d7549a6dd`                |
| `otterware-app/otter-mail`  | `99775571800d199b8e557f1edaa8b0e71fdefc54` | `c2132ef1d2d4d293e8b2a3dac1813f75501b6b23`; portable changes through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d`                |
| `otterware-app/otter-drive` | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                                                            |

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta was applied as a three-way merge with the previous integrated revision as its base,
so main's history and every merged PR stay intact. Upstream split ChatView, the composer, the
timeline, chat markdown, sidebar rows, the command palette, the pull request page and several
settings pages (Connections, Appearance, Typography, Archived threads, Background activity) into
separate files. Conflicts take upstream's structure; Otterware behavior moved with the code it
modifies: embedded compact chats and message decoration, the Linear issues dialog, badges and
panel props, the shared panel width fallback, the window appearance section, shell keybindings,
spaces in the palette and sidebar, Otterware themes, the icon set and branded text. Upstream's
pruning of low-signal tests is taken; only tests of Otterware-only behavior remain.

Where upstream now covers an Otterware change, upstream's version replaces it: the thread undo
handler (now `ThreadUndoShortcut`), the compact command check (now in `ChatView.logic`), helpers
upstream made private, and its Electron download cache and expo patch override. Its
`scripts/check-changed.ts` is not wired up; `check:changed` stays the Otterware gate, which also
reserves heavy slots and covers modules and profiles.

The Otter Code fork's new commit (#49) contributes Otter Code names for the pair error, the Codex
agent name hint and the boot-service cgroup check, and `Effect.fn` conversions and test-timeout
removals for upstream's newer lint rules. Its WebSocket handler split is not needed here: the
monorepo already adds its RPC methods as a separate module group and the server typechecks
without it. Its Linux metainfo rename belongs to the release workstream. The module rail, persistent module shell, scoped
settings/keybindings, standalone profile visibility, Otter Account adapters and connection
section, device-local Google grants, app identities and release destinations remain monorepo
implementations.

## Mail

Portable Mail changes through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d` remain integrated: sync
health and reauthentication, provider mailbox capabilities, Outlook sparse-delta and draft
handling, draft revision protection, Content-ID handling and native Outlook/OpenClaw
improvements. Provider credentials and IMAP passwords stay local to the device or browser; the
standalone notification watcher, its migrations, OAuth routes and consent UI stay excluded, and
Gmail push keeps the relay's v1 payload.

PR #158 (`b75f0258f801ab36ac233966892fd742b8fc1f6d`) replaced standalone projects with
Mail-owned synced chats, an AI workspace and a floating chat window. Otterware's host owns shared
projects and chat orchestration, so that architecture stays excluded. PR #159
(`a362072a5fe628bedac2e60f4fd41c1e03de9f9f`) is excluded with it: the iPhone tab bar's Agent tab
and chats drawer present #158's synced chats, ⌘I/Escape close #158's floating chat window, the
rail's … menu and Customize duplicate the host rail's own customization, and the wide-opening
browser panel belongs to the standalone renderer, where Otterware uses the host's panel. Release
version commits are not copied.

## Drive

Drive has no new source commits. The previous port stands: connected storage backends and their
settings in the native host settings frame, server-side ownership checks and immutable file
locations, read-only public links on the isolated signed origin, and the CLI stale-write and MCP
document operations from PR #99. The standalone suite-session cookie exchange and Drive chrome
remain excluded in favor of the host's Account capability path and module shell.

## Protected publication

Laurin authorized this sync as an ordinary protected squash PR, as for the 2026-10-20 sync (#101).
Main's history from `0b2778ae7f0227ca0c13761947b37a8d7549a6dd` is preserved and `upstream-base`
remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source baseline and the
content-limited sync overlay are generated into `scripts/otterware/source-baseline.json`; see the
fork operations exception for their checks and expiry. No required CI job or branch protection is
bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests require separately authorized test services.
Calendar has no separate source refresh; shared host/contracts changes still need its
compatibility checks.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
