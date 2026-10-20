# Source sync provenance

The 2026-10-20 integration audits these fetched `main` revisions. The source checkouts are
read-only inputs; their checked-out branches are not baselines.

| Source                      | Fetched revision                           | Earlier baseline                                                                                                                   |
| --------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pingdotgg/t3code`          | `67c0fc0cdaf963b103518862dd7b68a9c758ecf2` | `339179f50a84dc599cce373dbb48f172f182f44e` (`upstream-base`)                                                                       |
| `otterware-app/otter-code`  | `63bcbc5ab35c598bee33450dc908d9765b3effee` | Integrated fork behavior, reconciled with current monorepo `aaf6b7c5e8d64e2cfb5f12d630844f199daf7d87`                              |
| `otterware-app/otter-mail`  | `c2132ef1d2d4d293e8b2a3dac1813f75501b6b23` | Initial import `e1f8aaa201cc7dfb596083249485590e8eb9602d`; Outlook import in Otter Code `979de26201b35e14bfc78776663f1b97a268d0ff` |
| `otterware-app/otter-drive` | `514675ad0a8590acff4c904047b59438fa2d16a8` | Initial import `22e2ec10211ef2f510d85d862ccb8b43fc27b05a`                                                                          |

Mail and Drive are Otterware-owned modules after their initial imports (ADR 0003). The latest
reviewed source revision records a selective port, rather than asserting that these directories
are unchanged vendor copies. Future audits must compare the source delta with the integrated
behavior as well as these revisions.

## Code

The Code fork was reconciled first, followed by the current T3 host. This brings the current
provider, orchestration, remote connection, editor, diff review, activity, mobile and theme work
through the existing module seams. Upstream's compiler migration covers the Code renderer.
The imported module renderers retain their manual caches; the measured compiler baseline in
`apps/web/src/otterware/react-compiler-baseline.json` rejects newly failing files and requires
removing entries once they compile, following the mobile coverage approach.

The module rail, persistent module shell, scoped settings/keybindings, standalone profile
visibility, Otter Account adapters, app identities, and release destinations remain monorepo
implementations. The standalone Code sidebar/auth composition does not replace them. Compact
module assistants filter chat shortcuts by their focused surface. A generated relay migration
joins the upstream API-pause migration and the existing Otter migration head without applying
anything to a database.

## Mail

Portable Mail changes through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d` include sync health and reauthentication status, provider-specific mailbox
capabilities, Outlook sparse-delta preservation and draft handling, draft revision protection,
Content-ID handling, and removal of the obsolete Mail Google client fallback. Native Mail also
receives Outlook, sync health and device-local OpenClaw improvements. Existing bundle IDs,
signing, icons and release versions remain unchanged.

The standalone source's server notification watcher stores Google/Microsoft notification grants
or IMAP passwords. That watcher, its migrations, its OAuth routes, and the corresponding native
consent/password-upload UI are excluded: provider credentials and IMAP passwords remain local
to the device/browser. Existing Gmail push delivery remains. The Gmail notification extension retains the current relay’s v1 payload and device-side history
enrichment; Outlook/IMAP background alerts from the excluded watcher are not imported. The
browser Gmail relay still exchanges and seals a refresh grant without persisting it; the browser
holds the sealed grant.
The host's combined Mail/Calendar/contacts scopes remain intact. Microsoft mailbox proof,
Graph notification forwarding and sealed browser exchange are ported separately from the
credential-storing watcher; they retain local provider tokens and the shared Accounts identity.

Standalone renderer chrome, sign-in, agent runtimes, palette and panel routing are not copied
over the host-owned equivalents. Accounts identity and its accepted audiences are governed by
the Accounts service, separately from removing Mail's obsolete OAuth fallback. Local device
forget does not revoke Google's project-wide authorization or separately granted runtimes.

The final source refresh also audited Mail PR #158 (`b75f0258f801ab36ac233966892fd742b8fc1f6d`,
release `c2132ef1d2d4d293e8b2a3dac1813f75501b6b23`). Its 106-file change replaces standalone
projects, MCP project tools and their storage with Mail-owned synced chats, an AI workspace and
a floating chat window. Otterware already owns shared projects and chat orchestration in its
host. This architecture replacement, including the project-drop/chat migrations and matching
native navigation, is excluded as one coherent change. The source release version is not copied.

## Drive

The port adds connected storage backends, their API/contracts and storage settings in the
native host settings frame; storage ownership checks and immutable file locations remain in
the server. The migration is source code only and must be applied during a separately authorized
deployment. Public links open read-only views without acquiring an account grant. Content uses
the existing isolated signed origin, and each read rechecks the link's scope and existence.
Private operations continue to require a capability.

The standalone Drive suite-session cookie exchange and its tests/migration are excluded; the
host already supplies its Account capability path and independent runtime grants.
Standalone Drive navigation, sidebar, title bands and settings chrome are replaced by current
module shell equivalents. The monorepo already incorporated the Drive CLI stale-write/version
protections and MCP move/archive/restore/promote/folder operations in PR #99; this sync preserves
them. Mail device Google and native settings/profile integration were already merged in PRs
#97–#98 and are not reintroduced as separate standalone flows.

## Protected publication

Laurin authorized a protected squash PR as a one-time exception to atomic reconstruction.
The original prepared candidate `13362b1d55fcac71149ca46cefe31e1b5ebd4035` remains recorded;
focused validation fixes and the protected publication metadata are reviewed on top of that tree.
Main's existing `aaf6b7c5e8d64e2cfb5f12d630844f199daf7d87` history is preserved and
`upstream-base` remains `339179f50a84dc599cce373dbb48f172f182f44e`.
The exact integrated source baseline and content-limited sync overlay are generated into
`scripts/otterware/source-baseline.json`; see the fork operations exception for their checks
and expiry. No required CI job or branch protection is bypassed.

## Validation and release boundary

`vp run check:changed --no-browser` runs the affected local checks while explicitly reporting
browser tests deferred to CI. It does not authorize launching a browser. Native Swift tests
require macOS/Xcode; live S3/Azure/GCS driver tests require separately authorized test services.
Calendar has no separate source refresh; shared host/contracts changes still need its
compatibility checks.

A source merge does not establish production readiness. Device Google OAuth needs its real
build configuration and device verification, browser Google needs the corresponding deployed
Mail relay/Accounts API, and the new Cloud/Drive API and migrations require a separately
approved deployment. Cloud publishing is manual: a push to main must not deploy it. Required CI
compilation is validation; release publication, deployment and runtime installation remain
separate actions.
