# Module data is environment-local; Google accounts are linked to the Otter Account

Every environment that has Mail or Calendar turned on syncs and stores its own cache, and its
threads use that environment's own `mail_*` and `calendar_*` tools. This is T3 Code's existing
rule (an environment owns its state, `docs/internals/remote.md`) and how Mail already treats
devices. Drive stays a cloud service that every environment calls with an Otter Account token.

The Otter Account holds the list of Google accounts linked to it, the same on every device
(synced account settings, `packages/module-kit/src/account/linked.ts`). It never holds their
tokens: each device authorizes the linked accounts itself, with one consent for Mail, Calendar
and contacts, and keeps the refresh token in its own secret store (`DeviceGoogle`). Authorizing
an account on a device links it; unlinking it anywhere removes it from every device. Data that
must be the same everywhere, such as Mail projects, views and Home projects, lives in Otter
Cloud rather than in any environment.

We rejected a single home environment that others forward to (needs new server-to-server
forwarding with grants and send deduplication, and remote tools stop whenever that machine
sleeps), per-environment Google sign-in with no account involvement (each machine ends up with a
different set of accounts), and refresh tokens held in Otter Cloud (they would leave the user's
machines, which brings Google's restricted-scope security assessment for Gmail).

Consequences: each device asks for Google consent once per linked account; each environment
with Mail on syncs its own copy of the mailbox. Google ties a refresh token to the OAuth client
that issued it, so devices use the desktop client; Calendar's earlier sign-ins from that client
become linked accounts with Calendar-only access until the user allows Mail access.
