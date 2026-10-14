/**
 * This browser profile's environment identity: a random id kept in
 * `suite.sqlite`, so it lasts until site data is cleared (ADR 0008). Otter
 * Cloud sees it as the device audience `browser:<id>`.
 */
import { runSuiteMigrations, SuiteSqlClient } from "@otterware/module-kit/runtime";
import type { SuiteMigration } from "@otterware/module-kit/engine";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

/** The browser host's own namespace in `suite_migrations`. */
export const BROWSER_MIGRATIONS: ReadonlyArray<SuiteMigration> = [
  {
    module: "browser",
    id: 1,
    name: "browser_meta",
    run: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE browser_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    }),
  },
];

export class BrowserInstallation extends Context.Service<
  BrowserInstallation,
  { readonly id: string }
>()("@otterware/browser-environment/BrowserInstallation") {}

export const layer = Layer.effect(
  BrowserInstallation,
  Effect.gen(function* () {
    const sql = yield* SuiteSqlClient;
    yield* runSuiteMigrations(BROWSER_MIGRATIONS).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
    );
    const rows = yield* sql<{ readonly value: string }>`
      SELECT value FROM browser_meta WHERE key = 'installation'
    `;
    const existing = rows[0]?.value;
    if (existing !== undefined) return { id: existing };
    const crypto = yield* Crypto.Crypto;
    const id = yield* crypto.randomUUIDv4();
    yield* sql`INSERT INTO browser_meta (key, value) VALUES ('installation', ${id})`;
    return { id };
  }),
);
