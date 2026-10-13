/**
 * The page's side of Mail's page capabilities (README.md): subscribe to what
 * Mail's engine asks, do it in the window, answer. `browserMailPage()` does it
 * the way a plain browser can; a Mail UI can pass its own handlers (a dialog
 * for attachments, its own notification center) instead.
 */
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type { MailNotification, MailPageAnswer, MailPageRequest, MailPickedFile } from "./page.ts";

export type { MailNotification, MailPickedFile } from "./page.ts";

export interface MailPageHandlers {
  readonly open: (name: string, bytes: Uint8Array) => Promise<void>;
  /** False when the user cancelled. */
  readonly save: (name: string, bytes: Uint8Array) => Promise<boolean>;
  /** Empty when the user cancelled. */
  readonly pick: () => Promise<ReadonlyArray<MailPickedFile>>;
  readonly notify: (notification: MailNotification) => void;
  readonly badge: (count: number) => void;
}

/** The two RPCs of `MailPageRpcGroup`, as any client of the browser environment has them. */
export interface MailPageClient<E> {
  readonly "mail.page.requests": (input: {}) => Stream.Stream<MailPageRequest, E>;
  readonly "mail.page.answer": (answer: MailPageAnswer) => Effect.Effect<void, E>;
}

const answerFor = async (
  request: MailPageRequest,
  handlers: MailPageHandlers,
): Promise<MailPageAnswer | null> => {
  try {
    switch (request._tag) {
      case "open":
        await handlers.open(request.name, request.bytes);
        return { id: request.id };
      case "save":
        return { id: request.id, saved: await handlers.save(request.name, request.bytes) };
      case "pick":
        return { id: request.id, files: [...(await handlers.pick())] };
      case "notify":
        handlers.notify(request.notification);
        return null;
      case "badge":
        handlers.badge(request.count);
        return null;
    }
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
};

/** Serves Mail's requests for as long as it runs; run it while a Mail page is open. */
export const serveMailPage = <E>(client: MailPageClient<E>, handlers: MailPageHandlers) =>
  client["mail.page.requests"]({}).pipe(
    Stream.runForEach((request) =>
      Effect.flatMap(
        Effect.promise(() => answerFor(request, handlers)),
        (answer) => (answer === null ? Effect.void : client["mail.page.answer"](answer)),
      ),
    ),
  );

const download = (name: string, bytes: Uint8Array, open: boolean) => {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  const link = document.createElement("a");
  link.href = url;
  if (open) link.target = "_blank";
  else link.download = name;
  link.rel = "noopener";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/**
 * Plain-browser handlers: open in a new tab, save as a download, pick with a
 * file input, notify with the Notifications API (only when already
 * permitted), badge with the App Badging API where it exists.
 */
export function browserMailPage(
  options: {
    /** Clicking a notification; the Mail UI shows the message. */
    readonly onOpenMessage?: (target: { accountId: string; messageId: string }) => void;
  } = {},
): MailPageHandlers {
  return {
    open: async (name, bytes) => download(name, bytes, true),
    save: async (name, bytes) => {
      download(name, bytes, false);
      return true;
    },
    pick: () =>
      new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.addEventListener("cancel", () => resolve([]), { once: true });
        input.addEventListener(
          "change",
          () =>
            void Promise.all(
              [...(input.files ?? [])].map(async (file) => ({
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                bytes: new Uint8Array(await file.arrayBuffer()),
              })),
            ).then(resolve),
          { once: true },
        );
        input.click();
      }),
    notify: (notification) => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const shown = new Notification(notification.title, {
        body: [notification.subtitle, notification.body].filter(Boolean).join("\n"),
      });
      const target = notification.open;
      if (target && options.onOpenMessage) {
        const onOpenMessage = options.onOpenMessage;
        shown.addEventListener("click", () => {
          window.focus();
          onOpenMessage(target);
        });
      }
    },
    badge: (count) => {
      const badging = navigator as Navigator & {
        setAppBadge?: (count: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };
      void (count > 0 ? badging.setAppBadge?.(count) : badging.clearAppBadge?.())?.catch(() => {});
    },
  };
}
