/**
 * The in-browser environment's databases, in the origin private file system.
 * The "SAH pool" VFS needs no cross-origin isolation, but one tab at a time
 * owns a pool: the worker that opens it is this browser profile's environment
 * (ADR 0008), and clearing site data clears it.
 *
 * @module opfs
 */
import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import { SqlError, UnknownError } from "effect/sql/SqlError";

/** The pool every database of this environment lives in. */
export const OPFS_POOL = "otterware";

export interface OpfsDatabases {
  /** Opens (or creates) `name` in the pool, closed with the scope. */
  readonly open: (name: string) => Effect.Effect<Database, SqlError, Scope.Scope>;
}

const openFailed = (cause: unknown, message: string) =>
  new SqlError({ reason: new UnknownError({ cause, message, operation: "open" }) });

/** Installs the pool once; databases are files inside it. */
export const openOpfsDatabases = Effect.fn("opfs.open")(function* (pool: string = OPFS_POOL) {
  const sqlite3 = yield* Effect.tryPromise({
    try: () => sqlite3InitModule(),
    catch: (cause) => openFailed(cause, "Could not load SQLite."),
  });
  const vfs = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => sqlite3.installOpfsSAHPoolVfs({ name: pool }),
      catch: (cause) =>
        openFailed(
          cause,
          "Could not open this browser's storage. Another tab may already run the app.",
        ),
    }),
    (vfs) => Effect.sync(() => vfs.pauseVfs()),
  );
  const databases: OpfsDatabases = {
    open: (name) =>
      Effect.acquireRelease(
        Effect.try({
          try: () => new vfs.OpfsSAHPoolDb(`/${name}`),
          catch: (cause) => openFailed(cause, `Could not open ${name}.`),
        }),
        (db) => Effect.sync(() => db.close()),
      ),
  };
  return databases;
});
