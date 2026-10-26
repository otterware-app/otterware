import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { runSuiteMigrations, SuiteDatabase } from "@otterware/module-kit/server";
import type { SyncRecord, SyncedRecord } from "@otterware/otter-cloud-client";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HomeProjectRules, HomeViewFilter } from "@otterware/home-contracts";
import * as TestClock from "effect/testing/TestClock";

import { HomeAccount, type HomeSyncAccount } from "./HomeAccount.ts";
import * as HomeStore from "./HomeStore.ts";
import * as HomeSync from "./HomeSync.ts";

/** Otter Cloud's account data, as `infra/cloud/src/sync.ts` keeps it: the newest write wins. */
const makeCloud = () => {
  const records = new Map<string, SyncedRecord>();
  let revision = 0;
  const newer = (incoming: SyncRecord, kept: SyncedRecord | undefined) =>
    kept === undefined ||
    incoming.modifiedAt > kept.modifiedAt ||
    (incoming.modifiedAt === kept.modifiedAt && incoming.mutationId > kept.mutationId);
  const account: HomeSyncAccount = {
    accountId: "user-ada",
    push: async (incoming) => ({
      records: incoming.map((record) => {
        const kept = records.get(record.id);
        if (!newer(record, kept)) return kept!;
        const stored = { ...record, revision: ++revision };
        records.set(record.id, stored);
        return stored;
      }),
    }),
    pull: async (cursor) => ({
      records: [...records.values()]
        .filter((record) => record.revision > cursor)
        .sort((a, b) => a.revision - b.revision),
      cursor: revision,
      hasMore: false,
    }),
  };
  return { account, records };
};

const cloud = makeCloud();
const rules = Schema.decodeSync(HomeProjectRules)({});
const filter = Schema.decodeSync(HomeViewFilter)({});

/** One device: its own suite.sqlite, signed in to the same account. */
const layerDevice = HomeSync.layer.pipe(
  Layer.provideMerge(HomeStore.layer),
  Layer.provideMerge(
    Layer.effectDiscard(runSuiteMigrations(HomeStore.HOME_MIGRATIONS)).pipe(
      Layer.provideMerge(SuiteDatabase.layerSqlClient),
    ),
  ),
  Layer.provide(
    Layer.succeed(HomeAccount, {
      current: Effect.succeedSome(cloud.account),
      changes: Stream.never,
    }),
  ),
  Layer.provide(SuiteDatabase.layerMemory),
  Layer.provide(NodeServices.layer),
);

const device = Effect.gen(function* () {
  const context = yield* Layer.build(layerDevice);
  return {
    store: Context.get(context, HomeStore.HomeStore),
    sync: Context.get(context, HomeSync.HomeSync).sync,
  };
});

const names = (store: HomeStore.HomeStore["Service"]) =>
  Effect.map(store.listProjects, (projects) => projects.map((project) => project.name).sort());

it.effect("syncs projects and views between devices, newest write winning", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.UTC(2026, 9, 13, 10));
    const laptop = yield* device;
    const browser = yield* device;

    // Made before the first sign-in on this device: adopted by the account.
    const acme = yield* laptop.store.saveProject({ name: "Acme", color: "blue", rules });
    yield* laptop.store.saveView({ name: "Urgent", filter });
    yield* laptop.sync;
    yield* browser.sync;
    assert.deepStrictEqual(yield* names(browser.store), ["Acme"]);
    assert.deepStrictEqual(
      (yield* browser.store.listViews).map((view) => view.name),
      ["Urgent"],
    );

    // Edits on both: the later one wins on both devices.
    yield* TestClock.adjust("1 minute");
    yield* laptop.store.saveProject({ id: acme.id, name: "Acme Inc", color: "blue", rules });
    yield* TestClock.adjust("1 minute");
    yield* browser.store.saveProject({ id: acme.id, name: "ACME", color: "red", rules });
    yield* laptop.sync;
    yield* browser.sync;
    yield* laptop.sync;
    assert.deepStrictEqual(yield* names(laptop.store), ["ACME"]);
    assert.deepStrictEqual(yield* names(browser.store), ["ACME"]);

    // A deletion travels as a tombstone.
    yield* TestClock.adjust("1 minute");
    yield* browser.store.deleteProject(acme.id);
    yield* browser.sync;
    yield* laptop.sync;
    assert.deepStrictEqual(yield* names(laptop.store), []);
    assert.strictEqual(cloud.records.get(`project:${acme.id}`)?.value, null);
  }).pipe(Effect.scoped),
);
