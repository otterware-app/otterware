# The otterware repo is the T3 Code fork; Otter Code becomes a build of it

`otterware` tracks `pingdotgg/t3code` directly and replaces `otterware-app/otter-code` as the
fork. Otter Code ships as the Code-only app profile of `otterware`, and the `otter-code`
repository is archived once its releases come from here.

We rejected layering `otterware` on `otter-code` (two chained syncs, every upstream change
crosses two repos) and keeping two independent forks (the same upstream conflicts resolved twice,
and Code fixes landing in only one).

Consequence: the Otter Code identity (`dev.otterware.code`, `~/.otter-code`, `otter-code` on npm,
its update feed and relay) must keep working from this repo, so existing installs update in place.
