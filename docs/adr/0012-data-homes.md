# Data homes: Otterware and Otter Code share ~/.otter-code; standalone apps have their own

The Otterware and Otter Code profiles keep sharing `~/.otter-code` (`statev2.sqlite`, module data
in `suite.sqlite`), so switching between the two apps keeps the same threads and environment
ID. One server runs per home; the existing directory lock and "quit the other app" prompt stay.
The Otterware desktop keeps its own client files in `~/.otterware/userdata`.

Otter Mail, Calendar and Drive standalone profiles each get their own data home and app ID, so
they install and run beside Otterware. Existing Otter Mail desktop installs import their old local
data into the new home on first run; Calendar has no users to migrate.

We rejected a new `~/.otterware` home for the combined app (users would see two sets of threads,
or need an import) and one shared server for every profile (more coupling than wanted between
the standalone apps and the combined one).

Consequence: until no old `otter-code` releases remain in use on a shared home, the shared-home
rule from `OTTERWARE.md` still holds for `statev2.sqlite` and `settings.json`: new state goes into
`suite.sqlite` with namespaced migrations. Once Otter Code ships only from `otterware`, both
profiles run identical server code and the rule can be relaxed.
