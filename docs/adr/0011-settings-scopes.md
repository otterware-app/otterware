# One Settings screen; module preferences sync through the Otter Account

Settings is one screen. The host owns Account, Connections (provider connections), Agents,
Appearance and Modules; each module contributes its own sections, search entries and icons
through the module registry, never by editing the host's settings files.

Every setting declares one scope, and the screen shows it:

| Scope       | Stored in                      | Examples                                                         |
| ----------- | ------------------------------ | ---------------------------------------------------------------- |
| Account     | Otter Cloud, synced everywhere | signatures, mail layout, default calendar, themes, notifications |
| Environment | that environment's server      | module on/off, sync depth, local folders, provider instances     |
| Client      | the device                     | rail visibility, window and panel sizes                          |

Account scope is the default for module preferences, as Otter Mail's preferences sync today.
Environments without an Otter Account fall back to storing account-scoped preferences locally.

We rejected per-environment preferences (a new server starts at defaults) and per-device
preferences (each browser and desktop drifts).
