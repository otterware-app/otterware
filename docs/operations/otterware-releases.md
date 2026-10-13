# Profile releases and migration

`otterware-release.yml` builds every profile from `profiles/` by default. Push an
`otterware-build-*` tag from the intended main commit, or dispatch it with a comma-separated
`profiles` input. A `channel` suffix selects `channel-<profile>-<suffix>`; main uses
`channel-<profile>`. Each app embeds its own feed and follows its `latest` manifests.

macOS arm64 requires `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`, and the `APPLE_TEAM_ID` variable. All profiles use the same Developer ID.
Code and Otterware optionally use their existing macOS provisioning profiles. Linux x64
produces an AppImage, deb and self-contained server archive. The workflow verifies the
macOS signature/notarization ticket and smoke-tests the server archive before publishing.

`MACOS_PROVISIONING_PROFILE` is base64 of the CMS-signed Developer ID profile for
`dev.otterware.code`; `OTTERWARE_MACOS_PROVISIONING_PROFILE` belongs to `dev.otterware.suite`.
The packager must receive the decoded `.provisionprofile`, not its extracted XML plist.
Mail, Calendar and Drive currently sign without profiles and omit restricted passkey
entitlements. No new Apple profiles are required for those releases. Enabling restricted
passkey entitlements later requires separate Developer ID profiles for `dev.otterware.mail`,
`dev.otterware.calendar` and `dev.otterware.drive`, with the desired capabilities authorized.

Publishing uses `OTTERWARE_RELEASES_TOKEN`, scoped to this repository. The release GitHub App
is not installed here; merely having `RELEASE_APP_*` secrets does not authorize publishing.
Immutable releases are `otterware-<profile>-v<version>`. Rolling manifests reference those
immutable assets; checksums cover the pinned manifests and binaries. Every requested profile
must finish packaging before any profile publishes. No npm, relay or Cloudflare production
publish happens in this workflow.

Release versions start above Mail's existing 0.13.10 train (the migration floor is 0.14.0).
Each version includes its profile before the date, keeping runtime directories distinct
for Code and Otterware even though they share the same home. This matters even when packaging all profiles from Code's lower package version: an installed
Mail app will refuse a lower version. Once the package version passes that floor, the next
patch is used normally.

For a signing/publishing check before cutover, dispatch only `profiles=code`, `channel=test`.
After inspecting the artifacts, delete that run's `channel-code-test` release and tag, and
its immutable test release and tag. Keep the five main feeds unpublished until every module
has merged and the developer's first all-profile build is ready (ADR 0016).

`otterware-web-preview.yml` deploys only new `otterware-next-<profile>` Workers at
`https://<profile>.next.otterware.app`. Dispatch it once the requested modules are on main.
It uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` and never updates today's domains.

Legacy repository migration PRs wait for the developer's go: do not merge them or enable
auto-merge. Ship the bridge only after the new main profile feeds and their runtime archives
are downloadable and signing identities are compatible with the installed legacy apps.
