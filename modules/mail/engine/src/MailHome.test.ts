import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { MailError } from "@otterware/mail-contracts/rpc";
import { MailRuntime } from "./MailRuntime.ts";
import { mailHomeContributor } from "./MailHome.ts";

const overview = (result: Effect.Effect<unknown, MailError>) =>
  mailHomeContributor.pipe(
    Effect.flatMap((contributor) => contributor.needsYou),
    Effect.provideService(MailRuntime, {
      call: (operation) =>
        operation === "mail:homeItems"
          ? result
          : Effect.die("Home must only read the cached overview"),
      runTool: () => Effect.die("Home must not invoke tools"),
      events: Stream.empty,
    }),
  );
it.effect("keeps mail routes and project-matching facets in the shared Home model", () =>
  Effect.gen(function* () {
    const item = {
      id: "person@example.test/thread",
      module: "mail",
      kind: "unread-mail",
      title: "Review the proposal",
      occurredAt: "2026-10-13T10:00:00.000Z",
      priority: 20,
      actions: [],
      target: { route: "/mail/person%40example.test/INBOX/message" },
      facets: { senders: ["customer@example.test"], labels: ["INBOX", "UNREAD"] },
    };
    expect(yield* overview(Effect.succeed([item]))).toEqual([item]);
  }),
);
it.effect("keeps Home usable when Mail's worker is unavailable or answers invalid data", () =>
  Effect.gen(function* () {
    expect(
      yield* overview(
        Effect.fail(new MailError({ operation: "mail:homeItems", message: "Worker stopped" })),
      ),
    ).toEqual([]);
    expect(yield* overview(Effect.succeed([{ title: "Incomplete cached item" }]))).toEqual([]);
  }),
);
