# Source sync provenance

The 2026-10-27 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                         | Fetched revision                           | Earlier baseline                                                                                 |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pingdotgg/t3code`             | `5d91ab1117ad51ef1288a94717d85c70e7af09fe` | `6a3a460b09e70f06eebfd46ad304c74b96afa179` (2026-10-26 sync); `upstream-base` stays `339179f50a` |
| `otterware-app/otter-code`     | `99a8f4cc32f5d279fc011867e5e558cec6b5bf90` | `4deec789c3d1eac7326b1a8c75372a63f3a9bc8b` (rebased onto t3code `5d91ab1117`; #56 holds #55)     |
| `otterware-app/otter-mail`     | `a86a0691b6c52d7637928ffdd6fbd7c2b1a730ef` | `99775571800d199b8e557f1edaa8b0e71fdefc54`; portable changes now through `a86a0691b6`            |
| `otterware-app/otter-drive`    | `514675ad0a8590acff4c904047b59438fa2d16a8` | Unchanged since the 2026-10-20 sync                                                              |
| `otterware-app/otter-calendar` | `56b952a950b862f081b3eb8ac7fad7fa067b6c7a` | Unchanged                                                                                        |
| `otterware-app/otter-accounts` | `585a09cfabbc0a3faca17a4b690cbac63f3d6288` | Unchanged                                                                                        |

Upstream `main` had moved past `5d91ab1117` by publication; this sync stops at the revision Otter
Code integrated so both products carry the same T3 delta.

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The T3 delta (135 commits) arrived through Otter Code: a three-way merge onto main `95703e3d03`
with the last integrated Otter Code revision (`4deec789c3`) as base and Otter Code's new `main` as
the other side, so files Otterware had not changed take Otter Code's resolution of the same delta
and main's history and every merged PR stay intact. Otterware behavior moved with the code it
modifies:

- Upstream split Settings into Chat, Diffs, Threads, Browser, Devices, Worktrees, Sharing &
  access, Maintenance, Labs and About, and retired Integrations, Storage and Beta. The settings
  registry's App, Code and standalone page lists follow the new pages (Diffs and Worktrees are
  Code pages), the nav keeps its module groups and keybinding chips, and the Code profile follows
  upstream's nav order. Mail's Todoist page, which merged into Integrations, is now its own Mail
  page; module pages can no longer merge into the retired host pages.
- Profile visibility stays on the General page's rows and sections under upstream's new section
  ids (Sidebar carries `organization`); the About section keeps the profile wordmark.
- Upstream moved the root's theme, toast, tracing and guide-run helpers into `appInit` and the
  beforeLoad; the root route keeps the retained Activity shell, the standalone pages and the
  first-run gate without them.
- Drafts now promote from the draft store (#25615): the module side chat follows the store's
  recorded redirect instead of promoting drafts itself.
- Moved settings redirect by `href`, because module pages are not literal routes.
- Upstream's lint and effect diagnostics now cover more Otterware code: module runtime, tools,
  state store and suite database, the Code Home contributor, account session, device Google and
  the browser environment follow them.
- Module packages take React from the catalog, so module-kit and web share one React 19.3 and one
  `lucide-react` instance.

Upstream moved mobile to Screens `5.0.0-t3.45`, which still calls the iOS 27 bar minimization
setter unguarded, so the Otter guard patch moves to `5.0.0-t3.45` unchanged. Upstream's Clerk
entries stay excluded: Otter Accounts replaced Clerk.

Otter Code's sync resolutions apply here too: the retained project-space shortcut rules, the
hoisted Linear schema decoders, the `otter-code` triage command and the connection diagnosis
wording. Its CI-runner and workflow-adaptation changes are Otter Code's own and are not ported.

## Mail, Drive, Calendar and Accounts

Mail's #160 is ported: keyboard shortcuts keep working while focus is inside an HTML mail body,
because the sandboxed frame forwards its keydowns to the app. Its v0.13.13 release bump is not
ported. Drive, Calendar and Accounts have no new source commits; their previous ports stand.
Provider credentials and IMAP passwords stay local to the device or browser; the standalone
notification watcher, its migrations, OAuth routes and consent UI, and Mail's synced chats, AI
workspace and floating chat window (#158, #159) stay excluded in favor of the host's projects,
chat orchestration and panels. Drive's standalone suite-session cookie exchange and chrome stay
excluded in favor of the host's Account capability path and module shell. The Accounts
suite-session lifetime bound (#15) and Code sign-in grants are already in `infra/cloud/accounts`.

## Protected publication

This sync follows the protected squash PR procedure of the earlier syncs (#101, #103, #105, #106,
#111, #112, #114, #118). Main's history from `95703e3d03` is preserved and `upstream-base`
remains `339179f50a84dc599cce373dbb48f172f182f44e`. The integrated source baseline and the
content-limited sync overlay are generated into `scripts/otterware/source-baseline.json`; see the
fork operations exception for their checks and expiry. No required CI job or branch protection is
bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests require separately authorized test services.
Calendar has no separate source refresh; shared host/contracts changes still need its
compatibility checks. Upstream's Screens `5.0.0-t3.45` update changes the mobile native
fingerprint, so the mobile app needs a native build rather than an OTA update.

A source merge does not establish production readiness. Device Google OAuth needs its real build
configuration and device verification, browser Google needs the corresponding deployed Mail
relay/Accounts API, and Cloud/Drive migrations require a separately approved deployment. Cloud
publishing is manual: a push to main must not deploy it. Required CI compilation is validation;
release publication, deployment and runtime installation remain separate actions.
