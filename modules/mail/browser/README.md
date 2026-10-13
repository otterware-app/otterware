# @otterware/mail-browser

Mail in the in-browser environment (ADR 0008). Its engine runs in a worker that
the environment's worker spawns while the Mail module is on (`src/worker.ts`).
The cache lives in SQLite on its own OPFS pool, Gmail comes from the Otter
Account's connections, and IMAP and SMTP go through Otter Cloud's tunnel with
TLS done in the worker.

A Mail page talks to it like to any environment: the `mail.*` RPCs of
`MailContract` and the `mail.events` stream, through the browser environment's
client (`apps/web/src/otterware/browser/runtime.ts`: `useModuleTarget`,
`browserClient`, `runInBrowser`; Calendar's `browserClient.ts` is a worked
example).

## Page capabilities

Some of Mail's `Platform` needs a window, which a worker does not have. The
engine's calls travel Mail worker → environment worker (`MailPage`) → the page:

| Engine call (`Platform`) | Page request | The page answers              |
| ------------------------ | ------------ | ----------------------------- |
| `userFiles.open`         | `open`       | after showing the file        |
| `userFiles.save`         | `save`       | `saved`, false when cancelled |
| `userFiles.pick`         | `pick`       | `files`, empty when cancelled |
| `notify`                 | `notify`     | nothing                       |
| `setUnreadCount`         | `badge`      | nothing; the latest replays   |

The page subscribes with `mail.page.requests` and answers with
`mail.page.answer` (`MailPageRpcGroup` in `src/page.ts`; both are on the
browser environment's client). Answer with `error` to fail the engine's call
with that message. While no page listens, `open`, `save` and `pick` fail with
"Open Mail in this browser tab to do that", notifications are dropped, and the
unread count is kept for the next page. If the page goes away mid-question,
the waiting call fails the same way.

A Mail page runs `serveMailPage` from `@otterware/mail-browser/page` for as
long as it is open:

```ts
import { browserMailPage, serveMailPage } from "@otterware/mail-browser/page";

const serve = Effect.flatMap(browserClient, (client) =>
  serveMailPage(client, browserMailPage({ onOpenMessage: (target) => openMessage(target) })),
);
// e.g. in an effect: const controller = new AbortController();
// void runInBrowser(serve, controller.signal); return () => controller.abort();
```

`browserMailPage()` is the plain-browser behavior: open in a new tab, save as a
download, pick with a file input, notify with the Notifications API when
permission is already granted (asking for it is the UI's call), and badge with
the App Badging API where it exists. A Mail UI can pass its own
`MailPageHandlers` instead, such as an attachment preview or its own
notification center.

The environment worker serves one page at a time (one tab owns the
environment), and requests go to every subscribed page, so mount
`serveMailPage` once per Mail page, not per component.
