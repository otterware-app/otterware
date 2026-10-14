# Modules render on the shell; a standalone app is one module on

A module contributes to the host's own shell; it never brings its own. The host draws the rail,
sidebar, header, settings screen, command palette and keybindings with Otter Code's components,
and keeps module data in client stores above the router, the same way it keeps threads. A module
contributes data, never frames:

| Surface     | Host draws                                | Module contributes                                                                    |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Rail        | Home, app switcher, pins, foot            | its spaces (Code: projects; Mail: accounts and views; Calendar: views; Drive: drives) |
| Sidebar     | the sidebar and its rows                  | rows for the active space                                                             |
| Header      | the page header                           | actions                                                                               |
| Page        | the content frame                         | the content, built from `components/ui`                                               |
| Data        | client stores that outlive a route        | store definitions and RPC                                                             |
| Settings    | the screen, groups, rows, search          | pages with a grouped and a standalone placement                                       |
| Keybindings | one `keybindings.json`, the `app` context | commands named `<module>.<command>`                                                   |
| Account     | Otter Account, Connections, Agents        | nothing of its own                                                                    |

A module has no React root, router, theme engine, sidebar, account screen or agent settings of
its own. Its look survives as a built-in theme in Appearance.

In the Otterware profile the rail is Home, then the switcher for the modules that are on, then
the active module's spaces, then pins (any space or sidebar row, Account scope). A standalone
profile is the same app with one module on: its rail is that module's original rail, and its
settings are a flat list in the original order, with no group headers and no Modules page.

We rejected mounting each standalone app inside a page (the first integration): it rebuilt
routers and caches on every visit, so pages flashed, and every module looked and behaved
differently from the host. This supersedes "modules with their own UI keep it" in
`docs/internals/modules.md`.
