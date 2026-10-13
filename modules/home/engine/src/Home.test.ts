// @effect-diagnostics globalDate:off -- Fixtures build ISO times relative to the test clock.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { HomeProjectRules } from "@otterware/home-contracts";
import { HomeActionError, type HomeItem } from "@otterware/module-kit/contracts";
import { type HomeContributor, HomeContributors } from "@otterware/module-kit/engine";
import { runSuiteMigrations, SuiteDatabase } from "@otterware/module-kit/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as Home from "./Home.ts";
import * as HomeStore from "./HomeStore.ts";

const decodeRules = Schema.decodeUnknownSync(HomeProjectRules);
const recently = () => new Date(Date.now() - 60_000).toISOString();

const homeItem = (overrides: Partial<HomeItem> & Pick<HomeItem, "id" | "module">) =>
  ({
    kind: "thing",
    title: overrides.id,
    occurredAt: recently(),
    priority: 50,
    actions: [],
    target: { route: "/home" },
    ...overrides,
  }) satisfies HomeItem;

const performed: Array<string> = [];

const contributors: ReadonlyArray<HomeContributor> = [
  {
    module: "mail",
    needsYou: Effect.sync(() => [
      homeItem({
        id: "mail-1",
        module: "mail",
        priority: 80,
        waitingOnYou: true,
        facets: { senders: ["eva@acme.com"] },
      }),
      // Contributors speak for their own module only.
      homeItem({ id: "spoofed", module: "code", priority: 99 }),
    ]),
    performAction: (itemId, actionId) =>
      itemId === "mail-1"
        ? Effect.sync(() => void performed.push(`${itemId}:${actionId}`))
        : Effect.fail(new HomeActionError({ module: "mail", itemId, actionId })),
  },
  {
    module: "calendar",
    needsYou: Effect.succeed([homeItem({ id: "cal-1", module: "calendar", priority: 60 })]),
    today: Effect.succeed([
      {
        id: "ev-1",
        title: "Acme weekly",
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 7_200_000).toISOString(),
        allDay: false,
        target: { route: "/calendar" },
      },
    ]),
  },
  { module: "drive", needsYou: Effect.die("drive is down") },
  {
    module: "code",
    needsYou: Effect.succeed([
      homeItem({ id: "code-1", module: "code", priority: 95, facets: { codeProjectId: "c-1" } }),
    ]),
    // The host's contributor also reports agent activity.
    activity: Effect.succeed({
      agents: { running: 2, waiting: 1, recentlyFinished: 3 },
      activeThreadsByCodeProject: { "c-1": 5 },
      mergedPullRequests: [],
    }),
  },
];

const layerStore = HomeStore.layer.pipe(
  Layer.provideMerge(
    Layer.effectDiscard(runSuiteMigrations(HomeStore.HOME_MIGRATIONS)).pipe(
      Layer.provideMerge(SuiteDatabase.layerSqlClient),
    ),
  ),
  Layer.provide(SuiteDatabase.layerMemory),
  Layer.provide(NodeServices.layer),
);

const layer = Home.layer.pipe(
  Layer.provideMerge(layerStore),
  Layer.provide(Layer.succeed(HomeContributors, { current: Effect.succeed(contributors) })),
);

it.layer(layer)("Home", (it) => {
  describe("overview", () => {
    it.effect("merges and ranks every contributor, reporting the ones that failed", () =>
      Effect.gen(function* () {
        const home = yield* Home.Home;
        const overview = yield* home.overview({});
        assert.deepStrictEqual(
          overview.items.map((item) => item.id),
          ["code-1", "mail-1", "cal-1"],
        );
        assert.deepStrictEqual(
          overview.contributors.map((status) => [status.module, status.ok, status.itemCount]),
          [
            ["mail", true, 2],
            ["calendar", true, 1],
            ["drive", false, 0],
            ["code", true, 1],
          ],
        );
        assert.deepStrictEqual(
          overview.today.map((event) => event.id),
          ["ev-1"],
        );
        assert.deepStrictEqual(overview.agents, { running: 2, waiting: 1, recentlyFinished: 3 });
      }),
    );

    it.effect("files items under projects and narrows to a project or a view", () =>
      Effect.gen(function* () {
        const home = yield* Home.Home;
        const store = yield* HomeStore.HomeStore;
        const acme = yield* home.createProject({
          name: "Acme",
          rules: decodeRules({
            code: { projectIds: ["c-1"] },
            mail: { domains: ["acme.com"] },
            calendar: { keywords: ["acme"] },
          }),
        });
        assert.strictEqual(acme.color, Home.defaultProjectColor("Acme"));

        const overview = yield* home.overview({});
        const summary = overview.projects.find((entry) => entry.project.id === acme.id);
        assert.deepStrictEqual(summary?.counts, { code: 5, mail: 1, calendar: 1 });

        const scoped = yield* home.overview({ projectId: acme.id });
        assert.deepStrictEqual(
          scoped.items.map((item) => item.id),
          ["code-1", "mail-1"],
        );
        assert.deepStrictEqual(
          scoped.today.map((event) => event.id),
          ["ev-1"],
        );

        const view = yield* store.saveView({
          name: "Waiting on me",
          filter: {
            modules: [],
            projectIds: [],
            kinds: [],
            timeRange: "any",
            waitingOnMe: true,
          },
        });
        const waiting = yield* home.overview({ viewId: view.id });
        assert.deepStrictEqual(
          waiting.items.map((item) => item.id),
          ["mail-1"],
        );

        const renamed = yield* home.updateProject({ id: acme.id, name: "Acme GmbH" });
        assert.strictEqual(renamed.name, "Acme GmbH");
        assert.deepStrictEqual(renamed.rules, acme.rules);

        const missing = yield* home.overview({ projectId: "nope" }).pipe(Effect.flip);
        assert.strictEqual(missing._tag, "HomeNotFoundError");

        yield* store.deleteProject(acme.id);
        yield* store.deleteView(view.id);
        const after = yield* home.overview({});
        assert.deepStrictEqual(after.projects, []);
        assert.deepStrictEqual(after.views, []);
      }),
    );
  });

  it.effect("routes actions to the item's module and reports unknown modules", () =>
    Effect.gen(function* () {
      const home = yield* Home.Home;
      yield* home.performAction({ module: "mail", itemId: "mail-1", actionId: "archive" });
      assert.deepStrictEqual(performed, ["mail-1:archive"]);
      const failed = yield* home
        .performAction({ module: "mail", itemId: "gone", actionId: "archive" })
        .pipe(Effect.flip);
      assert.strictEqual(failed._tag, "HomeActionError");
      const noContributor = yield* home
        .performAction({ module: "calendar", itemId: "cal-1", actionId: "accept" })
        .pipe(Effect.flip);
      assert.strictEqual(noContributor._tag, "HomeNotFoundError");
    }),
  );
});
