# Every module ships as a standalone app, on desktop and web

`otterware` builds these app profiles, each as a desktop app and a web app:

| Profile    | Modules              | Replaces                                      |
| ---------- | -------------------- | --------------------------------------------- |
| Otterware  | all, each toggleable | `otterware-releases` channel builds           |
| Otter Code | Code                 | `otter-code` desktop, web, npm CLI            |
| Otter Mail | Mail                 | `otter-mail` DMG/.deb and mail.otterware.app  |
| Calendar   | Calendar             | `otter-calendar` nightly and its web app      |
| Drive      | Drive                | drive.otterware.app web app (CLI stays a CLI) |

A profile is a build-time choice of modules, branding, app ID, data home and update feed; one
codebase, one host. Existing installs of each replaced app must update in place to its profile
build before the old repository is archived. Mobile is out of scope for now.

In the Otterware profile, Code is shown or hidden like the others but is not a scoped module
(ADR 0004, 0010): hiding it never stops agent infrastructure.

Consequence: no module may assume another module is present, including Code (see ADR 0004), and
the host shell must look complete with a single module.
