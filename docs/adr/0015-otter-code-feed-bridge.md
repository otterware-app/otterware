# Otter Code moves to otterware's feeds through one bridge release

`otterware-releases` is renamed to `otterware` and receives the source, so existing Otterware
channel installs keep their feed through GitHub's rename redirect. Otter Code installs, the
`otter-code` npm CLI and fleet launchers update from `otterware-app/otter-code`'s releases today:
one final release there switches them to `otterware`'s Otter Code channel, and `otter-code`
is archived once that bridge has rolled out. npm `otter-code` publishes from `otterware`.

Each app profile has its own channels on `otterware` releases, using the per-channel feed
scheme `otterware-releases` already uses.

We rejected keeping `otter-code` as a permanent release mirror (the repository never goes away)
and renaming `otter-code` itself (moves the Otterware channel feeds instead).
