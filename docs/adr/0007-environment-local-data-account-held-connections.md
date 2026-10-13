# Module data is environment-local; provider connections are held by the Otter Account

Every environment that has Mail or Calendar turned on syncs and stores its own cache, and its
threads use that environment's own `mail_*` and `calendar_*` tools. This is T3 Code's existing
rule (an environment owns its state, `docs/internals/remote.md`) and how Mail already treats
devices. Drive stays a cloud service that every environment calls with an Otter Account token.

Google and Microsoft provider connections belong to the Otter Account: Otter Cloud stores the
encrypted refresh tokens and hands each linked environment short-lived access tokens on
request, generalizing the relay's existing Linear sign-in hand-out (`docs/internals/t3-connect.md`).
An environment with no Otter Account can still connect Google locally (loopback PKCE into its own
secret store). Data that must be the same everywhere, such as Mail projects, views and Home
projects, lives in Otter Cloud rather than in any environment.

We rejected a single home environment that others forward to (needs new server-to-server
forwarding with grants and send deduplication, and remote tools stop whenever that machine
sleeps) and per-environment Google sign-in with no account involvement (the user signs into
Google on every machine and account-wide data drifts apart).

Consequences: refresh tokens leave the user's machines, which likely brings Google's restricted
scope security assessment for Gmail, so start it early; each environment with Mail on syncs its
own copy of the mailbox; the renderer-driven account fan-out (`SuiteAccountProvider`) is deleted.

Google ties a refresh token to the OAuth client that issued it. Account-held connections use the
`otterware` project's "Otterware - Web" client (the one Accounts and Mail web already use, and
which already expects the CASA assessment because web Mail's tokens pass through a server).
Existing desktop grants from the Mac and Calendar desktop clients cannot move into Otter Cloud,
so those users connect their Google account once more at the cutover; local-only connections
keep using the desktop clients.
