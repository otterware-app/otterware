# Source sync provenance

The 2026-10-21b integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                      | Fetched revision                           | Earlier baseline                                                                                                               |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`          | `680152e27b2a961686389ca69a1557cbb2c55f08` | `74541bab17270c35f4418d4e543d85628632ed8f` (2026-10-21 sync); `upstream-base` stays `339179f50a84dc599cce373dbb48f172f182f44e` |
| `otterware-app/otter-code`  | `c9c19ffbe0b08e701b3e91a86abe7f01bf5b0039` | `ec59f9ded384917df61e868d07baf41c5a4c979b`                                                                                     |
| `otterware-app/otter-mail`  | `99775571800d199b8e557f1edaa8b0e71fdefc54` | Unchanged; portable changes through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d`                                                 |
| `otterware-app/otter-drive` | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                                                            |

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta was applied as a three-way merge with the previous integrated revision as its base,
onto main `6563cfafb148fa9a1ba2d253c2e92e8b4fcf626c`, so main's history and every merged PR stay
intact. Upstream's changes landed without restructuring: the orchestrator MCP model list and
thread lookups, steering that splits a finished turn, held-message sends on stop, provider adapter
fixes (Claude subagent cache TTL, Codex multi-file patches, Antigravity questions, OpenCode
out-of-funds errors), GitLab diff paging, clone stall reporting, cheaper status refreshes, the
login-shell `JAVA_HOME`, the pasted ChatGPT callback URL, standalone markdown images and the
`dev --share --built` mode.

`t3 pair` in a linked worktree now pairs only with that worktree's state, as upstream does, and
keeps the Otter Code wording of its error. Upstream's Clerk sign-in cancellation (#22903: the
desktop preload bridge, its `@clerk/electron` patch and the web pending bar) is excluded: Otter
Accounts replaced Clerk, and the desktop Otter Account sign-in uses its own PKCE flow. The
`check:changed` rewrite in `scripts/check-changed.ts` is taken but not wired up; `check:changed`
stays the Otterware gate, so the development guide keeps describing that gate. The workflow
changes for Vercel deployment output apply to the inherited release and preview workflows, which
remain disabled, and their test is not wired into CI because the Otterware CI dropped the
release-check step.

The Otter Code fork's new commit (#50) keeps conversations and the thread sidebar opaque under the
translucent window material: only the navigation rail, header and new chats stay glass, and
**Sidebar only** becomes **Rail only**. It applies to the same app frame here; the chat surface
marker moved into the monorepo's ChatView. The module rail, persistent module shell, scoped
settings/keybindings, standalone profile visibility, Otter Account adapters and connection
section, device-local Google grants, app identities and release destinations remain monorepo
implementations.

## Mail, Drive, Calendar and Accounts

Mail and Drive have no new source commits; their previous ports stand. Provider credentials and
IMAP passwords stay local to the device or browser; the standalone notification watcher, its
migrations, OAuth routes and consent UI, and Mail's synced chats, AI workspace and floating chat
window (#158, #159) stay excluded in favor of the host's projects, chat orchestration and panels.
Drive's standalone suite-session cookie exchange and chrome stay excluded in favor of the host's
Account capability path and module shell.

`otterware-app/otter-calendar` `56b952a950b862f081b3eb8ac7fad7fa067b6c7a` and
`otterware-app/otter-accounts` `6b844d29974758a664a4650133ac9d05a0f625e1` were checked for shared
sign-in or contract changes. Calendar's latest commits are icons, ad hoc macOS signing and a
Google undo fix; none touch shared sign-in or contracts. The Accounts suite-session lifetime bound
(#15) is already in `infra/cloud/accounts`.

## Protected publication

This sync follows the protected squash PR procedure of the 2026-10-20 and 2026-10-21 syncs (#101,
#103); publishing it needs the same explicit authorization. Main's history from
`6563cfafb148fa9a1ba2d253c2e92e8b4fcf626c` is preserved and `upstream-base` remains
`339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source baseline and the
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
