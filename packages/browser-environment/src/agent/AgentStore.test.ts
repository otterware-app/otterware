import { assert, it } from "@effect/vitest";
import { SuiteSqlClient } from "@otterware/module-kit/runtime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { BrowserPlatform } from "../BrowserPlatform.ts";
import * as BrowserSecrets from "../BrowserSecrets.ts";
import { makeFakeCloud } from "../test/fakeCloud.ts";
import { layerSuiteMemory } from "../test/suiteMemory.ts";
import { AgentStore, layer } from "./AgentStore.ts";

const layerStore = layer.pipe(
  Layer.provide(BrowserSecrets.layer),
  Layer.provide(Layer.succeed(BrowserPlatform, makeFakeCloud().platform)),
  Layer.provideMerge(layerSuiteMemory),
);

it.layer(layerStore)("AgentStore", (it) => {
  it.effect("keeps agent credentials sealed at rest", () =>
    Effect.gen(function* () {
      const store = yield* AgentStore;
      const sql = yield* SuiteSqlClient;
      yield* store.saveServer("hermes", { baseUrl: "https://hermes.example", secret: "sk-hermes" });

      const [row] = yield* sql<{ readonly secret: string }>`
        SELECT secret FROM browser_agent_servers WHERE agent = 'hermes'
      `;
      assert.match(row!.secret, /^aes-gcm:/);
      assert.notInclude(row!.secret, "sk-hermes");
      assert.deepStrictEqual(yield* store.server("hermes"), {
        baseUrl: "https://hermes.example",
        secret: "sk-hermes",
      });

      // A credential saved in plain text by an earlier build still opens.
      yield* sql`UPDATE browser_agent_servers SET secret = 'plain' WHERE agent = 'hermes'`;
      assert.strictEqual((yield* store.server("hermes")).secret, "plain");
    }),
  );
});
