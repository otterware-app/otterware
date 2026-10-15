Imported once from `otterware-app/otter-mail` at `e1f8aaa201cc7dfb596083249485590e8eb9602d`.

Mail owns this source here (ADR 0003). The host owns agent runtimes; Mail keeps its tool implementations and portable Platform seam.

Outlook provider: Otter Mail snapshot in `otterware-app/otter-code` at `979de26201` (`vendor/otter-mail/packages/core/src/providers/outlook`). Its tokens and push target are supplied by the host Platform; it does not open a second Otter Account session.
