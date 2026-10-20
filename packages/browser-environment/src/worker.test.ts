import { assert, it } from "@effect/vitest";
import { ModuleOffError } from "@otterware/module-kit/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { makeBrowserEnvironmentClient } from "./client.ts";
import { BROWSER_ENVIRONMENT_MODULE_IDS } from "./contracts.ts";
import { layerConnected } from "./test/connected.ts";
import { ACCOUNTS_URL, CLOUD_ORIGIN, makeFakeCloud } from "./test/fakeCloud.ts";

const cloud = makeFakeCloud();
const layerConnectedWorker = layerConnected(cloud);

const isModuleOffError = Schema.is(ModuleOffError);

it.layer(layerConnectedWorker, { timeout: 30_000 })(
  "in-browser environment worker protocol",
  (it) => {
    it.effect("serves the host and module RPCs of the profile's browser modules", () =>
      Effect.gen(function* () {
        const client = yield* makeBrowserEnvironmentClient;
        assert.deepStrictEqual(BROWSER_ENVIRONMENT_MODULE_IDS, ["home", "mail", "calendar"]);

        const { modules } = yield* client["modules.list"]({});
        assert.deepStrictEqual(
          modules.map((entry) => [entry.id, entry.state]),
          [
            ["home", "on"],
            // Mail's engine runs in a nested browser worker, which Node does not have.
            ["mail", "failed"],
            ["calendar", "on"],
          ],
        );

        // A streaming RPC: the engine ran its migrations on SQLite in WASM.
        const directory = yield* client["calendar.subscribeDirectory"]({}).pipe(
          Stream.take(1),
          Stream.runHead,
        );
        assert.deepStrictEqual(
          Option.map(directory, (value) => value.accounts),
          Option.some([]),
        );

        const overview = yield* client["home.overview"]({});
        assert.deepStrictEqual(overview.items, []);

        const failure = yield* Effect.flip(client["assistant.ensureProject"]({}));
        assert.strictEqual(failure._tag, "AssistantProjectError");
      }),
    );

    it.effect("turns a module off and on across the port", () =>
      Effect.gen(function* () {
        const client = yield* makeBrowserEnvironmentClient;
        const off = yield* client["modules.setEnabled"]({ id: "calendar", enabled: false });
        assert.strictEqual(off.state, "off");

        const refused = yield* Effect.flip(
          client["calendar.search"]({ query: "standup", limit: 5 }),
        );
        assert.isTrue(isModuleOffError(refused));

        const on = yield* client["modules.setEnabled"]({ id: "calendar", enabled: true });
        assert.strictEqual(on.state, "on");
        const directory = yield* client["calendar.subscribeDirectory"]({}).pipe(
          Stream.take(1),
          Stream.runHead,
        );
        assert.isTrue(Option.isSome(directory));
      }),
    );

    it.effect("keeps Google as this browser's own grant, started at Mail's relay", () =>
      Effect.gen(function* () {
        const client = yield* makeBrowserEnvironmentClient;
        const relay = "https://relay.mail.test";
        cloud.external = (url) =>
          url === `${relay}/v1/gmail/start`
            ? Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth?state=s" })
            : Response.json({ error: "not found" }, { status: 404 });
        yield* client["browser.account.attach"]({
          accessToken: "oauth-ada",
          accountsUrl: ACCOUNTS_URL,
          cloudOrigin: CLOUD_ORIGIN,
          mailRelayUrl: relay,
        });
        const started = yield* client["browser.account.connect"]({
          provider: "google",
          scopes: [],
          returnTo: "https://code.otterware.app/settings/account",
        });
        assert.strictEqual(started.url, "https://accounts.google.com/o/oauth2/v2/auth?state=s");
        // The relay knows the account by its suite session; no Cloud grant is created.
        const asked = cloud.requests.find((request) => request.url === `${relay}/v1/gmail/start`)!;
        assert.strictEqual(asked.headers.get("authorization"), "Bearer session-user-ada");

        yield* client["browser.account.saveGoogle"]({ email: "ada@gmail.test", sealed: "sealed" });
        const saved = yield* client["browser.account.connections"]({});
        assert.deepStrictEqual(
          saved.connections.map((connection) => [connection.id, connection.email]),
          [["browser:google:ada@gmail.test", "ada@gmail.test"]],
        );
        yield* client["browser.account.disconnect"]({
          connectionId: "browser:google:ada@gmail.test",
        });
        const removed = yield* client["browser.account.connections"]({});
        assert.deepStrictEqual(removed.connections, []);
        yield* client["browser.account.detach"]({});
      }),
    );

    it.effect("signs the browser in to Otter Cloud as its own device", () =>
      Effect.gen(function* () {
        const client = yield* makeBrowserEnvironmentClient;
        cloud.cloud = (path) =>
          path === "/v1/cloud/connections"
            ? Response.json({
                connections: [
                  {
                    id: "google-ada",
                    provider: "google",
                    email: "ada@example.com",
                    scopes: ["calendar"],
                    updatedAt: 1,
                  },
                ],
              })
            : Response.json({ error: "not found" }, { status: 404 });

        const refused = yield* Effect.flip(client["browser.account.connections"]({}));
        assert.strictEqual(refused.reason, "signed-out");
        const channel = cloud.sockets.length;

        const state = yield* client["browser.account.attach"]({
          accessToken: "oauth-ada",
          accountsUrl: ACCOUNTS_URL,
          cloudOrigin: CLOUD_ORIGIN,
        });
        assert.deepStrictEqual(state, { status: "connected", userId: "user-ada", message: null });

        // Google is this browser's own grant; the account's Cloud-held ones are not read.
        const { connections } = yield* client["browser.account.connections"]({});
        assert.deepStrictEqual(connections, []);
        assert.isFalse(cloud.requests.some((request) => request.url.endsWith("/connections")));
        // The channel opens with this browser's own Cloud audience.
        yield* Effect.promise(() => cloud.socket(channel));
        const listed = cloud.requests.findLast((request) =>
          request.url.endsWith("/channel-ticket"),
        )!;
        const audience = listed.headers.get("x-otter-audience")!;
        assert.match(audience, /^browser:[0-9a-f-]{36}$/);
        assert.strictEqual(listed.headers.get("authorization"), `Bearer cloud-${audience}`);

        const watched = yield* client["browser.account.watch"]({}).pipe(
          Stream.take(1),
          Stream.runCollect,
        );
        assert.deepStrictEqual(
          [...watched].map((entry) => entry.status),
          ["connected"],
        );

        // An expired sign-in signs the browser out instead of keeping a dead client.
        const expired = yield* Effect.flip(
          client["browser.account.attach"]({
            accessToken: "oauth-revoked",
            accountsUrl: ACCOUNTS_URL,
            cloudOrigin: CLOUD_ORIGIN,
          }),
        );
        assert.strictEqual(expired.reason, "signed-out");
        const after = yield* Effect.flip(client["browser.account.connections"]({}));
        assert.strictEqual(after.reason, "signed-out");
      }),
    );
  },
);
