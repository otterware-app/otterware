Imported once from `otterware-app/otter-mail` at `e1f8aaa201cc7dfb596083249485590e8eb9602d`.

Mail owns this source here (ADR 0003). The host owns agent runtimes; Mail keeps its tool implementations and portable Platform seam.

Outlook provider: Otter Mail snapshot in `otterware-app/otter-code` at `979de26201` (`vendor/otter-mail/packages/core/src/providers/outlook`). Its tokens and push target are supplied by the host Platform; it does not open a second Otter Account session.

Latest reviewed source: `otterware-app/otter-mail@c2132ef1d2d4d293e8b2a3dac1813f75501b6b23`.
Portable provider, sync-health, draft and legacy-client changes are selectively ported; see [the source audit](../../../docs/operations/source-sync.md) for boundaries and exclusions.

Portable Mail behavior is ported through `aac5128d0fe8dc2c0f744549a3cdedeaee8b082d`; the newer standalone workspace replacement (#158) is intentionally excluded in favor of the host.
