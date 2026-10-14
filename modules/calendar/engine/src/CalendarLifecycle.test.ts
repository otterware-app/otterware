import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { HostLayer, ModuleRuntime, SuiteDatabase } from "@otterware/module-kit/server";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { CalendarModule } from "./CalendarModule.ts";
import { CalendarService } from "./CalendarService.ts";
import * as CalendarServiceLive from "./CalendarServiceLive.ts";
import * as GoogleAuthUnavailable from "./GoogleAuthUnavailable.ts";

const module = {
  ...CalendarModule,
  layer: CalendarServiceLive.layerWith({ autoSync: false, demoLatency: false }).pipe(
    Layer.provide(GoogleAuthUnavailable.layer),
  ),
};
const layer = HostLayer.layerRuntime([module]).pipe(
  Layer.provideMerge(SuiteDatabase.layerMemory),
  Layer.provide(NodeServices.layer),
);

it.effect(
  "turns Calendar off and on without losing accounts, preferences or environment settings",
  () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.UTC(2026, 9, 13, 12));
      const runtime = yield* ModuleRuntime.ModuleRuntime;
      const opened = Option.getOrThrow(yield* runtime.openModule("calendar"));
      const calendar = Context.getUnsafe(opened.context, CalendarService);
      yield* calendar.addDemo({ size: "standard" });
      yield* calendar.sync({});
      yield* calendar.updatePreferences({
        weekStartsOn: 0,
        notificationRules: [{ enabled: true, minutesBefore: 10 }],
      });
      yield* calendar.updateEnvironmentPreferences({
        syncWindow: { pastWeeks: 3, futureWeeks: 6 },
      });
      const initial = yield* calendar.getDirectory;
      expect(initial.accounts.length).toBeGreaterThan(0);
      expect(opened.homeContributor).not.toBeNull();
      const snapshots = yield* Queue.unbounded<void>();
      const subscription = yield* calendar.directory.pipe(
        Stream.runForEach(() => Queue.offer(snapshots, undefined)),
        Effect.forkScoped,
      );
      yield* Queue.take(snapshots);
      yield* runtime.setEnabled("calendar", false);
      expect(runtime.isOnSync("calendar")).toBe(false);
      yield* Fiber.await(subscription);
      expect(Option.isNone(yield* runtime.openModule("calendar"))).toBe(true);
      yield* runtime.setEnabled("calendar", true);
      const reopened = Option.getOrThrow(yield* runtime.openModule("calendar"));
      const restored = yield* Context.getUnsafe(reopened.context, CalendarService).getDirectory;
      expect(restored.accounts.map((account) => account.accountId)).toEqual(
        initial.accounts.map((account) => account.accountId),
      );
      expect(restored.preferences.weekStartsOn).toBe(0);
      expect(restored.preferences.notificationRules).toEqual([
        { enabled: true, minutesBefore: 10 },
      ]);
      expect(restored.environmentPreferences.syncWindow).toEqual({ pastWeeks: 3, futureWeeks: 6 });
    }).pipe(Effect.provide(layer)),
);
