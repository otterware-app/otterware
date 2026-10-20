Mail's renderer was imported from `otterware-app/otter-mail` at `e1f8aaa201cc7dfb596083249485590e8eb9602d`. The retained content now lives in `apps/web/src/otterware/mail/content` so it can use host UI components; this package declares the module registration.

Latest reviewed source: `otterware-app/otter-mail@c2132ef1d2d4d293e8b2a3dac1813f75501b6b23`.
Portable Mail renderer changes in the host shell are selectively ported; see [the source audit](../../../docs/operations/source-sync.md) for boundaries and exclusions.

Portable Mail behavior is ported through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d`; the newer standalone workspace replacement (#158) is intentionally excluded in favor of the host.
