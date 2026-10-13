# Drive boundary

`@otterware/drive-contracts` exports the Effect schemas, `DriveContract`, `DRIVE_METHODS`,
`DriveToolkit` and scoped `DriveSettings`. `@otterware/drive-contracts/api` exports the existing
Drive REST API's Zod schemas and types. The web layer imports these contracts, never engine
internals. RPC names start with `drive.`; their payload and result schemas are the authority.

The browser uses `DriveClient` from `@otterware/otter-cloud-client/drive`, constructed with an
async callback returning the current `OtterAccountSession.accessToken` (or null on sign-out).
It calls Otter Cloud directly, with no environment, WebSocket, local database, or engine layer.
`clearSession()` drops its short-lived capability cache. Requests also re-read the account
callback, so signing out or switching accounts invalidates the previous capability.

Accounts `/v1/auth/suite/session` exchanges the refreshed OAuth access token; Cloud
`/v1/cloud/drive-token` issues a short-lived `otterware:drive` capability. Browser requests omit
cookies. API requests carry bearer authorization, `x-otter-audience` and, when resolving a slug
or creating a document in a folder, `x-otterdrive-folder`. The dedicated Drive token and API
routes accept these cookie-free clients from local or remote app origins; provider connection
routes retain their separate origin checks.

Updates always publish immutable versions. Supply the inspected current version (`ifVersion`
in the RPC/tools, `expectedCurrentVersion` in REST upload manifests). A 409 is a conflict,
never a reason to retry blindly. Edited multi-file documents pass `baseVersion` to retain
unchanged files. Sharing is explicit; inspect access first and re-read after a partial failure.
`DriveClient.preview` accepts only `https://usercontent.otterware.app` preview/session URLs;
uploaded HTML must stay on that origin. Its returned `resourceBaseUrl` is the isolated base
for version entry files, not a Drive app page.

Thread links, viewed versions and Home snapshots are environment-local in `suite.sqlite`.
They require the module RPC/tools and are unavailable in the standalone browser. W2 wires a
refreshed account through the engine's `DriveAccountSession.current` port; the Node module
factory accepts that layer. The default provider is disconnected until that host seam lands.
The temporary `drive.syncAccount` RPC accepts an access token in memory and never a refresh token.

Cloud's static hosting pipeline expects the separate `@otterware/drive-web` package to build
`modules/drive/web/dist/index.html`, with asset base `/drive/`. It copies that output to
`infra/cloud/public/drive`; Cloud serves `/drive`, document/version URLs, share URLs, and
`/account/callback` from that shell. The API-only stage skips this build while the web package
is absent. The web package must keep its generated `dist/` ignored and supply its own sign-in
callback handling.
