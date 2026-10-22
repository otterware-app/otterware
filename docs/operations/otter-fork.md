# Otter fork operations

> This page preserves legacy Code identities and procedures. The monorepo origin is
> `otterware-app/otterware`. Publishing and deployment workflows here remain disabled
> until the release workstream replaces them; the root agent rules take precedence.

Otter Code is a fork of [T3 Code](https://github.com/pingdotgg/t3code) with its own name, app IDs,
relay, and release channel. Everything in [AGENTS.md](../../AGENTS.md) and [OTTERWARE.md](../../OTTERWARE.md) still applies. This file covers what is
different and how to keep the fork aligned with upstream.

> This fork now lives in `otterware-app/otterware` and builds the Otterware apps too. Read
> [OTTERWARE.md](OTTERWARE.md) for the repository layout and the rules for working here.

## How the fork stays in sync

- **Upstream is `pingdotgg/t3code`'s `main`.** `upstream-base` records the exact upstream commit the
  fork sits on and is always the parent of `main`'s single Otterware commit.
- **One commit.** Everything Otterware adds or changes is one commit on top of `upstream-base`:
  `chore(otterware): Otterware on T3 Code`. `git diff upstream-base main` is the whole fork
  ([ADR 0002](../adr/0002-daily-rebase-stack.md)).
- **Between syncs,** work lands on `main` through pull requests merged on green CI. Never push to
  `main` directly, and never merge upstream into `main`. The next sync folds those PRs back into the
  one commit.
- **Upstream first.** On a conflict, prefer upstream's change or fix whenever it covers what ours
  did, and port Otterware behavior on top only where upstream lacks it; do not keep our version
  because it already exists.

### Preparing a sync

Work in a fresh worktree. Configure the remotes once (`origin` is `otterware-app/otterware`,
`upstream` is `https://github.com/pingdotgg/t3code.git` with `-t main --no-tags`). Then:

```sh
git fetch origin main upstream-base
git fetch upstream main
old_main=$(git rev-parse origin/main)
old_base=$(git rev-parse origin/upstream-base)
new_base=$(git rev-parse upstream/main)
git switch -c "otterware/sync-$(date +%F)" "$old_main"
git merge --no-ff --no-commit upstream/main
```

Resolve every conflict with upstream's current behavior, keeping only the additional Otterware
functionality. Do not hand-resolve generated files: run `vp i` for `pnpm-lock.yaml`, regenerate
`apps/web/src/routeTree.gen.ts` when routes changed, and rerun
`.github/scripts/otter-adapt-upstream.sh` so its output matches the new upstream. Run
`scripts/otter/rebrand-ui-text.sh` for user-facing text upstream added; a sync is where one-off
rebrands of upstream files belong, so they never enter the seam list. If upstream added
relay migrations that branch from the fork's chain, add a merge migration that records both heads as
parents without changing the schema:

```sh
cd infra/relay
pnpm exec drizzle-kit generate --custom --name otter_upstream_merge \
  --dialect postgresql --schema ./src/persistence/schema.ts --out ./migrations/postgres
```

Then collapse the result to one commit and check it:

```sh
git reset --soft "$new_base"
git commit -m "chore(otterware): Otterware on T3 Code" -m "Upstream: pingdotgg/t3code@$new_base"
git rev-list --left-right --count "$new_base"...HEAD   # 0 1
git diff --check "$new_base"..HEAD
```

Typecheck the packages with resolved conflicts and run the focused tests next to them (through
`scripts/otterware/heavy.sh`); leave the full suite to CI.

### Protected publication exception

Laurin authorized ordinary protected squash PRs for the daily Code/Mail/Drive syncs since
2026-10-20 (#101, #103, #105 and later). They preserve main's merged history and leave `upstream-base` at
`339179f50a84dc599cce373dbb48f172f182f44e`. `scripts/otterware/source-baseline.json` records the
integrated T3 revision, the reviewed module source revisions and the base main the sync applies
to; [source sync](source-sync.md) describes the current integration. Each such sync is a separate,
explicit exception to the one-commit reconstruction/publication procedure below; it does not
authorize a shared history rewrite or relax branch protection.

The seam check uses that explicit source baseline for ownership, including newly upstream-owned
files. For this sync alone, against the recorded base main, it verifies byte-identical upstream
imports and exact, mode-sensitive Git tree entries for resolved overlay files. Stage the reviewed
integration, then run `node scripts/otterware/check-upstream-seams.ts --record-sync-overlay` to
regenerate those entries. An unstaged edit or different tree entry cannot use an exception.
The overlay exceptions expire once main advances past the recorded base, so subsequent PRs must
use the ordinary seam list. Do not extend that list with hundreds of sync-only branding changes.
The PR still requires the normal green `CI gate` before squash merging. The next authorized
reconstruction must start from the integrated baseline and preserve every subsequently merged PR.

### Publishing a prepared sync

A sync rewrites `main`. Update `main` and `upstream-base` together with explicit leases; the push
to `main` runs CI, and a failure is fixed forward with a PR. If a lease fails, someone moved a ref:
stop and prepare again against the new state instead of overriding it. There is no sync PR and no
backup branch.

```sh
git push --atomic origin \
  --force-with-lease="refs/heads/main:$old_main" \
  --force-with-lease="refs/heads/upstream-base:$old_base" \
  HEAD:refs/heads/main "$new_base:refs/heads/upstream-base"
```

Existing worktrees and feature branches still point at the old `main`: rebase only their own work
onto the new `origin/main`, using their previous base explicitly (`git rebase --onto origin/main
"$old_main"`). Do not rebase or reset other active worktrees.

**Keep the diff small:** prefer repository variables and secrets over code, and new files over
edits to upstream files. Leave internal names (`@t3tools/*`, `T3CODE_*`, code identifiers) alone.
`scripts/otter/rebrand-ui-text.sh` renames client UI text; it runs by hand during a sync, and its
exclusions list text that must keep matching what the server or agents emit.

## Identities and infrastructure

| What                 | Value                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------- |
| App and bundle ID    | `dev.otterware.code` (`.dev`, `.preview`; iOS extensions `.widgets`, `.sharing`)        |
| URL scheme           | `ottercode` (`ottercode-dev`, `ottercode-preview`)                                      |
| Data home            | `~/.otter-code` (never `~/.t3`, so it can sit beside an installed T3 Code)              |
| Background service   | `otter-code.service` (systemd user unit), `dev.otterware.code.service` (launchd)        |
| Releases and updates | GitHub Releases of `otterware-app/otter-code`, nightly channel                          |
| Relay                | `https://relay.code.otterware.app` (Cloudflare Worker, deployed from `infra/relay`)     |
| Tunnels              | `prod-<digest>.otterware.app`, one per linked machine                                   |
| Hosted web app       | `https://code.otterware.app` (Cloudflare Worker `otter-code-web`)                       |
| Sign-in              | Otter Accounts at `accounts.otterware.app`                                              |
| Apple                | Team `YNJ5WLH965`, App Store app `6815697255`                                           |
| Mobile builds        | EAS project `@clary-so/otter-code`                                                      |
| CLI on npm           | `otter-code` (command `otter-code`), platform builds `@otterware/otter-code-<platform>` |
| App icons            | `assets/otter` (production), `assets/otter-nightly`, `assets/otter-dev`: see below      |

Secrets live in the repository's Actions secrets and its `production` environment.

The icons come from the Otterware brand kit (October 2026): the Otter Code symbol, a charcoal
(`#2c2f31`) "‹›" swoosh, on an ivory (`#f8f5ec`) tile. Each Icon Composer project has two layers,
`background.svg` and `symbol.svg`, both full 1024pt canvases. Production is the kit's light icon,
with a dark appearance (ivory symbol on charcoal) set through `fill-specializations`; iOS derives
the tinted one. Dev is the blueprint variant (blue gradient, grid and crop marks, white symbol) and
nightly the night sky (indigo to violet, stars and clouds, ivory symbol). Each folder also holds
`<name>-web-favicon.svg`, drawn by hand and copied as is: production's switches with
`prefers-color-scheme`. `vp run icons:export` regenerates the iOS, Linux, Windows and web exports
as `assets/README.md` describes; the macOS PNGs still need Icon Composer's `macOS pre-Tahoe`
export (an 824pt tile inset 100, with shadow). The tracked exports were rendered from the kit's
SVGs with resvg, which matches those framings: rounded tiles (radius 230 of 1024) for the iOS,
universal and web files.

`apps/mobile/assets/otter/` holds the Android art, rendered from the same layers: the symbol as the
adaptive foreground at half the 108dp canvas (inside the 66dp safe circle), on ivory for production
and on the variant's background image for dev and nightly (`-dev` and `-nightly` files), the
Android 12+ splash as both layers on the 288dp canvas, and a white symbol for the monochrome
launcher layer and the notification icon. The in-app symbol (`T3Wordmark` on web and mobile, the
widget's `T3Mark.svg`, `agent_activity_mark.xml`, the DMG backgrounds) is the kit's
`symbol-tight.svg`: viewBox `123 127 780 780`, coordinates rounded to 0.1.

## Releases

- **Desktop and server runtimes:** `release.yml` (T3's pipeline) builds macOS arm64/x64 and Linux
  x64/arm64 on GitHub-hosted runners and publishes a nightly GitHub Release that installed apps
  offer in their update dialog. Windows, AUR, marketing, and Discord are skipped.
  Start one by hand with `gh workflow run release.yml -f channel=nightly`.
- **CLI on npm:** the same run publishes `otter-code` and its `@otterware/otter-code-<platform>`
  packages with the `NPM_TOKEN` secret (an npm account that is a member of the `otterware` org),
  tagged `nightly` and also `latest`, so `npx otter-code` and `npm i -g otter-code` get the newest
  build. The token is needed because new packages have no npm trusted publisher yet.
- **macOS passkeys:** `MACOS_PROVISIONING_PROFILE` is the base64 Developer ID profile for
  `dev.otterware.code`, signed by Clary GmbH's team `YNJ5WLH965` (`APPLE_TEAM_ID`). The
  Otterware branch must pass its own `OTTERWARE_MACOS_PROVISIONING_PROFILE` secret into the
  reusable workflow's `MACOS_PROVISIONING_PROFILE` input and use app ID `dev.otterware.suite`.
  The packager derives the WebAuthn keychain group from the team and app IDs and claims only
  used profile grants. Apple's managed `com.apple.developer.web-browser.public-key-credential`
  capability is pending approval; after approval, regenerate both profiles and update their
  secrets. Associated Domains are optional (`MACOS_PASSKEY_RP_DOMAINS`, comma-separated) and
  unnecessary for browser passkeys; no Clerk key is required. Without a profile, existing
  signing and notarization continue. Otter's policy lives in `scripts/otter/macos-profile.ts`;
  regenerate workflow adaptations with `.github/scripts/otter-adapt-upstream.sh`.
- **Hosted web:** the release stages a Cloudflare Worker version, then promotes it after the
  desktop/CLI release publishes. `scripts/otter/web/` owns its routing and static assets;
  the adaptation script keeps upstream's Vercel path separate. The `Deploy Otter Code web`
  workflow can ship hosting fixes from `main` with an already-published release tag, without
  rebuilding desktop or mobile. Cloudflare manages the `.app` aliases and `.dev` redirects.
  PR previews use the separate `otter-code-web-preview` Worker and immutable version URLs.
- **Relay:** `Deploy T3 Connect relay` runs on every push to `main`. The relay adopts the
  existing `otterware.app` zone and a PlanetScale database with a retain policy. Never run
  `alchemy destroy` against `prod`. Its PlanetScale service token (`PLANETSCALE_API_TOKEN*`)
  needs `delete_production_branch_password` and `delete_branch_password` on the database.
  Alchemy runs migrations as a temporary role and deletes it with `postgres` as successor, which
  hands the new tables to `postgres`. Without those accesses the deletion fails with only a
  warning, the tables stay owned by the expired role, and a later `ALTER TABLE` migration fails
  with `must be owner of table`.
- **iOS** is built and uploaded locally, not in CI:

  ```sh
  cd apps/mobile
  pnpm dlx eas-cli@latest build --platform ios --profile production --local --non-interactive \
    --output ../../../otter-code-builds/otter-code-ios.ipa </dev/null
  xcrun altool --upload-app -f ../../../otter-code-builds/otter-code-ios.ipa -t ios \
    --apiKey <key id> --apiIssuer <issuer id>   # key from API_PRIVATE_KEYS_DIR
  ```

  Use a **release** Xcode; App Store Connect rejects beta toolchains (error 90534). Public build
  config (`T3CODE_ACCOUNTS_URL`, `T3CODE_RELAY_URL`) is stored as EAS environment variables. Don't put
  it in a gitignored `.env.local`: EAS builds from a clean copy of the repo, and the runtime
  fingerprints would not match.

## Moving a machine from T3 Code

`scripts/otter/migrate-from-t3.sh` copies a T3 Code home (V2 preview or T3 Nightly) into
`~/.otter-code`. Threads, projects, settings, secrets, attachments, and the environment ID
come along, so saved connections to that machine keep matching. It never modifies the
source. Run it with `--dry-run` first.

- **Desktop:** quit both apps first (the script refuses while a database is open), then:

  ```sh
  scripts/otter/migrate-from-t3.sh --from ~/.t3/orchestrator-preview-2829
  open -a "Otter Code"
  ```

- **Server with a systemd unit:** install the Otter Code runtime into the new home, then let the
  script stop the old unit, copy, install `otter-code.service`, and restore the old unit if
  anything fails:

  ```sh
  curl -fsSL https://raw.githubusercontent.com/otterware-app/otter-code/main/scripts/install.sh \
    | T3CODE_HOME=~/.otter-code T3CODE_CHANNEL=nightly sh
  scripts/otter/migrate-from-t3.sh --from ~/.t3/orchestrator-preview-2829 \
    --stop-unit t3code-pr2829.service --wait-idle 10 --install-service
  ```

  The installer links the command as `otter-code`, so it never replaces an installed T3 Code's
  `t3`. The script refuses to touch T3 Nightly's `t3code.service`.

Deliberately not copied:

- Desktop client files encrypted with the old app's Keychain key (`connection-catalog.json`,
  `clerk-tokens.json`, `cloud-auth-token.json`). Otter Code can't read them, and its window
  would stay empty.
- The stored T3 Connect link (`secrets/cloud-*`), which points at T3's relay and account.

## T3 Connect

- **Desktop:** Settings → Connections → T3 Connect.
- **Stale link:** if a machine says it is "already linked to a different cloud account", clear the
  old link with `t3 connect logout --base-dir ~/.otter-code`. On the desktop, run the CLI through
  the app binary with `ELECTRON_RUN_AS_NODE=1` and `Contents/Resources/app.asar/apps/server/dist/bin.mjs`.
- **SSH-only hosts:** run `otter-code connect` on the host and approve its connection code at
  Otter Accounts. No SSH callback forwarding is needed. Restart the host service after linking.
- **Account cutover:** old provider tokens and links are not migrated by email. Update the app,
  clear an old link with `otter-code connect logout --base-dir ~/.otter-code`, sign in to Otter
  Accounts and reconnect. Local projects and thread history stay in place.

- **Relay reaching tunnels:** the relay Worker needs the `global_fetch_strictly_public`
  compatibility flag (`infra/relay/src/worker.ts`), because tunnels share the relay's zone.
  Without it, the relay's calls to a tunnel fail with Cloudflare 530 and phones report
  `endpoint_request_failed`.

## Linear agent app

Delegating Linear issues to Otter needs one Linear OAuth app owned by Otter, configured on the relay.
Without it the relay reports Linear as unavailable and clients hide the section.

- Create the app at `linear.app/settings/api/applications/new` with distribution **public**, callback
  URL `https://relay.code.otterware.app/v1/linear/oauth/callback`, webhooks on, webhook URL
  `https://relay.code.otterware.app/v1/linear/webhook`, and the **Agent session events**, **Issues**,
  **Comments**, and **OAuth app revoked** categories. Issues and Comments are what make linked
  issues update right away; without them, machines fall back to polling.
- Store the client ID as the `LINEAR_CLIENT_ID` repository variable, and the client secret and webhook
  signing secret as the `LINEAR_CLIENT_SECRET` and `LINEAR_WEBHOOK_SECRET` secrets in the `production`
  environment. `HOSTED_APP_URL` is optional and defaults to `https://code.otterware.app`.
- The relay generates its own keys for sealing Linear tokens and signing OAuth state. Rotating them
  forces every workspace to reinstall and every user to relink.

## Other traps

- **Electron as Node:** agent shells inside Otter Code can inherit `ELECTRON_RUN_AS_NODE=1`, and
  `open` passes it on, so an app launched from such a shell runs as plain Node and exits. Launch
  it with `env -u ELECTRON_RUN_AS_NODE open -a "Otter Code"`.
- **macOS runners:** macOS jobs run on `macos-15`. On GitHub's `macos-26` image, electron-builder
  below 26.16.1 fails to unlock its signing keychain. Move to `macos-26` in the generated script
  once upstream pins 26.16.1 or later.

The account integration is an Otter-owned boundary. Upstream continues to supply the editor, providers, orchestration and transport; its Clerk dependencies and account screens must not return during a sync. Code uses the shared account IDs through OAuth PKCE on every client, with online session validation at the relay. Keep the OAuth clients and issuer aligned with Otter Accounts when resolving upstream auth changes.
