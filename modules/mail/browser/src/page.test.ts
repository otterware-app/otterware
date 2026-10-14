import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

import { layerMailPage, MailPage } from "./page.ts";
import { serveMailPage, type MailPageHandlers } from "./pageClient.ts";

const file = { name: "a.txt", mimeType: "text/plain", bytes: new Uint8Array([104, 105]) };

const handlers = (log: Array<string>): MailPageHandlers => ({
  open: async (name) => void log.push(`open ${name}`),
  save: async (name) => name !== "cancel.pdf",
  pick: async () => [file],
  notify: (notification) => void log.push(`notify ${notification.title}`),
  badge: (count) => void log.push(`badge ${count}`),
});

it.layer(layerMailPage)("Mail's page capabilities", (it) => {
  it.effect("relays the engine's file, notification and badge requests to the page", () =>
    Effect.gen(function* () {
      const page = yield* MailPage;
      // Before any page listens: asks fail, the badge is kept for the page to come.
      const unanswered = yield* Effect.flip(Effect.tryPromise(() => page.ask({ _tag: "pick" })));
      assert.include(String(unanswered.cause), "Open Mail in this browser tab");
      page.tell({ _tag: "badge", count: 3 });

      const log: Array<string> = [];
      const client = {
        "mail.page.requests": () => page.requests,
        "mail.page.answer": page.answer,
      };
      const served = yield* Effect.forkScoped(serveMailPage(client, handlers(log)));
      yield* Effect.yieldNow;

      const opened = yield* Effect.promise(() =>
        page.ask({ _tag: "open", name: "invoice.pdf", bytes: new Uint8Array() }),
      );
      assert.isUndefined(opened.error);
      assert.strictEqual(
        (yield* Effect.promise(() =>
          page.ask({ _tag: "save", name: "cancel.pdf", bytes: new Uint8Array() }),
        )).saved,
        false,
      );
      assert.deepStrictEqual((yield* Effect.promise(() => page.ask({ _tag: "pick" }))).files, [
        file,
      ]);
      page.tell({ _tag: "notify", notification: { title: "New mail" } });
      page.tell({ _tag: "badge", count: 4 });
      yield* Effect.yieldNow;
      assert.deepStrictEqual(log, ["badge 3", "open invoice.pdf", "notify New mail", "badge 4"]);

      // The page goes away mid-question: the engine's call fails instead of waiting forever.
      const slow = { ...handlers(log), pick: () => new Promise<never>(() => {}) };
      yield* Fiber.interrupt(served);
      const slowPage = yield* Effect.forkScoped(serveMailPage(client, slow));
      yield* Effect.yieldNow;
      const asked = yield* Effect.forkScoped(
        Effect.promise(() => page.ask({ _tag: "pick" }).catch((error: Error) => error.message)),
      );
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(slowPage);
      assert.include(yield* Fiber.join(asked), "Open Mail in this browser tab");
    }).pipe(Effect.scoped),
  );
});
