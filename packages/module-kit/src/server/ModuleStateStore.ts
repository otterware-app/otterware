/**
 * Which modules the user turned off on this environment, in `suite.sqlite`
 * (ADR 0010, 0012). A module without a row is on: installing a module turns it
 * on, and a profile that drops a module leaves its row behind harmlessly.
 */
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";

import type { SuiteMigration } from "../engine/ServerModule.ts";

/** The host's own namespace in `suite_migrations`. */
export const HOST_MIGRATIONS: ReadonlyArray<SuiteMigration> = [
  {
    module: "host",
    id: 1,
    name: "suite_modules",
    run: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        CREATE TABLE suite_modules (
          id TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;
    }),
  },
];

export class ModuleStateStore extends Context.Service<
  ModuleStateStore,
  {
    /** Module ids the user turned off. */
    readonly disabled: Effect.Effect<ReadonlySet<string>, SqlError>;
    readonly setEnabled: (id: string, enabled: boolean) => Effect.Effect<void, SqlError>;
  }
>()("@otterware/module-kit/server/ModuleStateStore") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const disabled = sql<{ readonly id: string }>`
    SELECT id FROM suite_modules WHERE enabled = 0
  `.pipe(Effect.map((rows) => new Set(rows.map((row) => row.id))));
  const setEnabled = (id: string, enabled: boolean) =>
    Effect.gen(function* () {
      const updatedAt = DateTime.formatIso(yield* DateTime.now);
      yield* sql`
        INSERT INTO suite_modules (id, enabled, updated_at)
        VALUES (${id}, ${enabled ? 1 : 0}, ${updatedAt})
        ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
      `;
    });
  return ModuleStateStore.of({ disabled, setEnabled });
});

/** Needs `suite.sqlite` as the plain `SqlClient`. */
export const layer = Layer.effect(ModuleStateStore, make);
