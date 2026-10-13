import { describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, type AuthSessionState } from "@t3tools/contracts";
import { CalendarId } from "@otterware/calendar-contracts";
import { EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { createCalendarAtoms } from "./index.ts";

vi.mock("@t3tools/client-runtime/state/session", () => ({
  createEnvironmentSessionAtoms: () => ({ sessionStateAtom: sessions }),
}));
const sessions = Atom.family((_id: EnvironmentId) =>
  Atom.make<AsyncResult.AsyncResult<AuthSessionState>>(AsyncResult.initial()),
);
const grant = (allowed: boolean): AuthSessionState => ({
  authenticated: true,
  auth: {
    policy: "remote-reachable",
    bootstrapMethods: [],
    sessionMethods: [],
    sessionCookieName: "test",
  },
  scopes: allowed ? ["orchestration:operate"] : [],
  permissions: allowed ? ["orchestration:operate"] : [],
});

describe("Calendar destination grants", () => {
  it("blocks read-only and revoked sessions before dispatch, independently per environment", async () => {
    let dispatches = 0;
    const runtime = Atom.runtime(
      Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, {
        run: () => {
          dispatches += 1;
          return Effect.succeed({ undo: [] });
        },
      } as unknown as EnvironmentRegistry.EnvironmentRegistry["Service"]),
    );
    const registry = AtomRegistry.make();
    const client = createCalendarAtoms(runtime);
    const writable = EnvironmentId.make("writable");
    const readonly = EnvironmentId.make("readonly");
    const target = {
      environmentId: readonly,
      input: {
        calendarId: CalendarId.make("cal"),
        title: "Meeting",
        time: { allDay: true as const, start: "2026-10-13", end: "2026-10-14" },
      },
    };
    const unmount = [
      registry.mount(sessions(writable)),
      registry.mount(sessions(readonly)),
      registry.mount(client.permission(writable)),
      registry.mount(client.permission(readonly)),
    ];
    try {
      registry.set(sessions(writable), AsyncResult.success(grant(true)));
      registry.set(sessions(readonly), AsyncResult.success(grant(false)));
      expect(registry.get(client.commands.create.permissionAtom(writable))).toBe(true);
      expect(registry.get(client.commands.create.permissionAtom(readonly))).toBe(false);
      expect((await client.commands.create.run(registry, target))._tag).toBe("Failure");
      expect(dispatches).toBe(0);
      expect(
        (await client.commands.create.run(registry, { ...target, environmentId: writable }))._tag,
      ).toBe("Success");
      expect(dispatches).toBe(1);
      registry.set(sessions(writable), AsyncResult.success(grant(false)));
      expect(
        (await client.commands.create.run(registry, { ...target, environmentId: writable }))._tag,
      ).toBe("Failure");
      expect(dispatches).toBe(1);
    } finally {
      unmount.forEach((stop) => stop());
      registry.dispose();
    }
  });
});
