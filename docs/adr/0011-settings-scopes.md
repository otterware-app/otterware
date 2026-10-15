# One Settings screen; module preferences sync through the Otter Account

Settings is one screen built from the host's settings components. The host owns the App pages:
General, Appearance, Keybindings, Account, Connections, Agents, Browser, Integrations, Scheduled
tasks, Diagnostics and Modules. Each module contributes its own pages through the module
registry, never by editing the host's settings files (ADR 0020).

Every module page declares two placements: its own page under the module's group when more than
one module is on (`Mail › Reading`), and the page it merges into in a standalone app
(`Appearance`). Group headers appear only when more than one module is on, so a standalone app
keeps its flat list. Settings two apps shared become one row (one Google sign-in in Connections,
one Agents page, one time format).

Every setting declares one scope, and the screen shows it:

| Scope       | Stored in                      | Examples                                                     |
| ----------- | ------------------------------ | ------------------------------------------------------------ |
| Account     | Otter Cloud, synced everywhere | signatures, mail layout, default calendar, themes, rail pins |
| Environment | that environment's server      | module on/off, sync depth, local folders, provider instances |
| Client      | the device                     | window and panel sizes                                       |

Account scope is the default for module preferences, as Otter Mail's preferences sync today.
Environments without an Otter Account fall back to storing account-scoped preferences locally.

We rejected per-environment preferences (a new server starts at defaults) and per-device
preferences (each browser and desktop drifts).
