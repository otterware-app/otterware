/**
 * Mail's page capabilities in the browser: what the engine asks of the window
 * it runs for (Platform's `userFiles`, `notify` and `setUnreadCount`), which a
 * worker cannot do itself. The Mail worker asks the environment worker, which
 * holds `MailPage`; the page subscribes to `mail.page.requests`, does the
 * work, and answers with `mail.page.answer`. See README.md.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

export const MailPickedFile = Schema.Struct({
  name: Schema.String,
  mimeType: Schema.String,
  bytes: Schema.Uint8Array,
});
export type MailPickedFile = typeof MailPickedFile.Type;

export const MailNotification = Schema.Struct({
  title: Schema.String,
  subtitle: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  /** The message to show when the notification is clicked. */
  open: Schema.optional(Schema.Struct({ accountId: Schema.String, messageId: Schema.String })),
});
export type MailNotification = typeof MailNotification.Type;

/** One thing the engine asks of the page. `open`, `save` and `pick` wait for an answer. */
export const MailPageRequest = Schema.Union([
  /** Show a file (an attachment) to the user. */
  Schema.TaggedStruct("open", {
    id: Schema.String,
    name: Schema.String,
    bytes: Schema.Uint8Array,
  }),
  /** Let the user save a file; answer `saved: false` when they cancel. */
  Schema.TaggedStruct("save", {
    id: Schema.String,
    name: Schema.String,
    bytes: Schema.Uint8Array,
  }),
  /** Let the user pick files to attach; answer `files`, empty when they cancel. */
  Schema.TaggedStruct("pick", { id: Schema.String }),
  /** New mail. No answer. */
  Schema.TaggedStruct("notify", { id: Schema.String, notification: MailNotification }),
  /** Total unread in the inbox, for the tab or app badge. No answer; the latest replays on subscribe. */
  Schema.TaggedStruct("badge", { id: Schema.String, count: Schema.Number }),
]);
export type MailPageRequest = typeof MailPageRequest.Type;

export const MailPageAnswer = Schema.Struct({
  id: Schema.String,
  saved: Schema.optional(Schema.Boolean),
  files: Schema.optional(Schema.Array(MailPickedFile)),
  /** Why the page could not do it; the engine's call fails with this. */
  error: Schema.optional(Schema.String),
});
export type MailPageAnswer = typeof MailPageAnswer.Type;

export const MAIL_PAGE_METHODS = {
  requests: "mail.page.requests",
  answer: "mail.page.answer",
} as const;

/** Browser-only: an environment has a desktop or no page for these. */
export const MailPageRpcGroup = RpcGroup.make(
  Rpc.make(MAIL_PAGE_METHODS.requests, {
    payload: Schema.Struct({}),
    success: MailPageRequest,
    stream: true,
  }),
  Rpc.make(MAIL_PAGE_METHODS.answer, { payload: MailPageAnswer }),
);

const NO_PAGE = "Open Mail in this browser tab to do that.";

type Asked = Exclude<MailPageRequest, { _tag: "notify" | "badge" }>;
type Payload<R> = R extends unknown ? Omit<R, "id"> : never;

/** The environment worker's side of the channel, shared by Mail's worker and the RPCs. */
export class MailPage extends Context.Service<
  MailPage,
  {
    /** Asks the page and waits for its answer; fails while no page listens. */
    readonly ask: (request: Payload<Asked>) => Promise<MailPageAnswer>;
    /** Tells the page; dropped while no page listens, except the badge, which replays. */
    readonly tell: (
      request: Payload<Extract<MailPageRequest, { _tag: "notify" | "badge" }>>,
    ) => void;
    readonly requests: Stream.Stream<MailPageRequest>;
    readonly answer: (answer: MailPageAnswer) => Effect.Effect<void>;
  }
>()("@otterware/mail-browser/MailPage") {}

export const layerMailPage = Layer.effect(
  MailPage,
  Effect.gen(function* () {
    const requests = yield* PubSub.unbounded<MailPageRequest>();
    const waiting = new Map<
      string,
      { readonly answer: (answer: MailPageAnswer) => void; readonly fail: (error: Error) => void }
    >();
    let listeners = 0;
    let nextId = 0;
    let badge: MailPageRequest | null = null;
    const publish = (request: MailPageRequest) => Effect.runSync(PubSub.publish(requests, request));

    return MailPage.of({
      ask: (request) => {
        if (listeners === 0) return Promise.reject(new Error(NO_PAGE));
        const id = `page-${++nextId}`;
        return new Promise<MailPageAnswer>((resolve, reject) => {
          waiting.set(id, {
            answer: (answer) =>
              answer.error === undefined ? resolve(answer) : reject(new Error(answer.error)),
            fail: reject,
          });
          publish({ ...request, id } as MailPageRequest);
        });
      },
      tell: (request) => {
        const sent = { ...request, id: `page-${++nextId}` } as MailPageRequest;
        if (sent._tag === "badge") badge = sent;
        if (listeners > 0) publish(sent);
      },
      requests: Stream.unwrap(
        Effect.gen(function* () {
          const subscription = yield* PubSub.subscribe(requests);
          listeners += 1;
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              listeners -= 1;
              // The last page went away: nobody will answer what it was asked.
              if (listeners > 0) return;
              for (const pending of waiting.values()) pending.fail(new Error(NO_PAGE));
              waiting.clear();
            }),
          );
          return Stream.concat(
            Stream.fromIterable(badge === null ? [] : [badge]),
            Stream.fromSubscription(subscription),
          );
        }),
      ),
      answer: (answer) =>
        Effect.sync(() => {
          const pending = waiting.get(answer.id);
          waiting.delete(answer.id);
          pending?.answer(answer);
        }),
    });
  }),
);

/** The RPC handlers for `MailPageRpcGroup`, over the shared `MailPage`. */
export const layerMailPageHandlers = MailPageRpcGroup.toLayer(
  Effect.gen(function* () {
    const page = yield* MailPage;
    return MailPageRpcGroup.of({
      "mail.page.requests": () => page.requests,
      "mail.page.answer": (answer) => page.answer(answer),
    });
  }),
);
