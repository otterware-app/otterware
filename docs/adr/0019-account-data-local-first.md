# Account-wide data and account-scoped settings are local-first and synced

Mail projects and views, Home projects, and account-scoped settings (ADR 0011) are always stored
locally, in `suite.sqlite` on an environment or browser SQLite in the in-browser environment, and
synced through Otter Cloud when the user is signed in, last write wins per record. They work
offline and without an Otter Account.

We rejected keeping them only in Otter Cloud (these features would be off without an account or
while offline).

Refines ADR 0007 and ADR 0011, which said such data "lives in Otter Cloud": Otter Cloud is the
sync hub and the copy of record for new devices, not the only copy.
