# One cutover: all five profiles ship together, old repos only ease the move

No build of `otterware`'s own source ships, not even internally, until the first releases of all five
profiles (Otterware, Otter Code, Otter Mail, Calendar, Drive) go out together. The work happens
in parallel streams on `otterware` `main` before then.

New releases must work on a clean machine with no old app ever installed. Compatibility with
old installs is a convenience layered on top, delivered from the old repositories:

1. Before the cutover, the old repos ship ordinary transition updates where they make the
   switch easier (for example, which repository and channel an app listens to for updates, or
   which relay it uses).
2. At the cutover, the five profiles get their first `otterware` releases.
3. Then each old repo ships one agreed migration release that hands its installs over.

The old `otterware` branch's channel builds keep publishing into the renamed repository's
Releases until the cutover (ADR 0017); they are builds of `otter-code`'s branch, not of this repo.

This is proportionate to who uses what today: few Otter Mail desktop users, one Otter Code user
who updates often, no Calendar users, and Drive is web only (a deploy, not an update).

Supersedes the incremental milestones Fable and Astra proposed, and refines ADR 0003 (old repos
are frozen for features but still ship these transition and migration releases) and ADR 0015
(the bridge release is the Otter Code migration release).
