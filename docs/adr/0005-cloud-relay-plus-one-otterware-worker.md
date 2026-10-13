# Cloud: the upstream relay plus one consolidated Otterware Worker

`infra/relay` (Code relay and T3 Connect) stays upstream-shaped, because it is upstream code and
edits there conflict on every daily rebase. Otter Accounts, the Drive API and Mail's relay
(push, preferences, projects, the IMAP TCP tunnel) merge into one Otterware Worker under `infra/cloud`, consolidated
as part of moving them into `otterware`, not as a later step.

- Public hostnames do not change (`accounts.`, `drive.`, `relay.mail.otterware.app`), so shipped
  clients keep working; the Worker routes by hostname and path.
- `usercontent.otterware.app` stays a separate hostname so uploaded content cannot read
  first-party cookies.
- Otter Cloud owns `drive.` and `usercontent.` and serves the Drive profile's static web assets, as
  the Drive Worker (already named `otterware`) does today.
- Moving custom domains and Durable Object classes (`UserHub`, `AgentHub`) between Workers is not
  atomic and needs `transferred_classes` migrations: W3 includes an ops runbook for it.
- The existing D1 databases start as separate bindings of the one Worker; merging them is a
  later, optional data migration.

We rejected keeping four Workers (four deploy pipelines and auth integrations for one product)
and folding the Code relay in too (permanent rebase conflicts in upstream-owned `infra/relay`).
