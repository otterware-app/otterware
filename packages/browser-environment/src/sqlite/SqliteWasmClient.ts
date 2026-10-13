/**
 * Effect's `SqlClient` over one SQLite in WASM database (`@sqlite.org/sqlite-wasm`'s
 * synchronous `oo1` API), the in-browser environment's `suite.sqlite` (ADR 0008).
 * The worker opens the database on OPFS (`opfs.ts`); tests open it in memory.
 * Calls run synchronously in the worker, serialized by one semaphore the way
 * `@t3tools/shared/nodeSqliteClient` serializes its single connection.
 *
 * @module SqliteWasmClient
 */
import type { BindingSpec, Database, PreparedStatement, SqlValue } from "@sqlite.org/sqlite-wasm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { identity } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as Reactivity from "effect/reactivity/Reactivity";
import * as Client from "effect/sql/SqlClient";
import type { Connection } from "effect/sql/SqlConnection";
import { classifySqliteError, SqlError } from "effect/sql/SqlError";
import * as Statement from "effect/sql/Statement";

/** Prepared statements kept per connection; the oldest is finalized beyond this. */
const STATEMENT_CACHE_SIZE = 200;

/** `sqlite-wasm` reports the result code as `resultCode`; `classifySqliteError` reads `errno`. */
const failure = (cause: unknown, message: string, operation: string) => {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "resultCode" in cause &&
    typeof cause.resultCode === "number" &&
    !("errno" in cause)
  ) {
    Object.assign(cause, { errno: cause.resultCode });
  }
  return new SqlError({ reason: classifySqliteError(cause, { message, operation }) });
};

const bindable = (params: ReadonlyArray<unknown>): BindingSpec =>
  params.map((value) => (typeof value === "boolean" ? (value ? 1 : 0) : value)) as BindingSpec;

const makeConnection = (db: Database): Connection => {
  const statements = new Map<string, PreparedStatement>();
  const prepare = (sql: string) => {
    const cached = statements.get(sql);
    if (cached !== undefined) {
      // Most recently used last, so the oldest is evicted first.
      statements.delete(sql);
      statements.set(sql, cached);
      return cached;
    }
    const statement = db.prepare(sql);
    statements.set(sql, statement);
    if (statements.size > STATEMENT_CACHE_SIZE) {
      const [oldest, evicted] = statements.entries().next().value!;
      statements.delete(oldest);
      evicted.finalize();
    }
    return statement;
  };
  const run = <Row>(
    sql: string,
    params: ReadonlyArray<unknown>,
    read: (s: PreparedStatement) => Row,
  ) =>
    Effect.try({
      try: () => {
        const statement = prepare(sql);
        try {
          if (params.length > 0) statement.bind(bindable(params));
          const rows: Array<Row> = [];
          if (statement.columnCount === 0) {
            statement.step();
            return rows;
          }
          while (statement.step()) rows.push(read(statement));
          return rows;
        } finally {
          statement.reset(true);
        }
      },
      catch: (cause) => failure(cause, "Failed to execute statement", "execute"),
    });
  const objects = (sql: string, params: ReadonlyArray<unknown>) =>
    run(sql, params, (statement) => statement.get({}) as Record<string, SqlValue>);
  const arrays = (sql: string, params: ReadonlyArray<unknown>) =>
    run(sql, params, (statement) => statement.get([]) as ReadonlyArray<SqlValue>);
  return identity<Connection>({
    execute: (sql, params, rowTransform) =>
      rowTransform ? Effect.map(objects(sql, params), rowTransform) : objects(sql, params),
    executeRaw: (sql, params) =>
      Effect.map(arrays(sql, params), (rows) =>
        rows.length > 0 ? rows : [{ changes: db.changes() }],
      ),
    executeValues: (sql, params) => arrays(sql, params),
    executeValuesUnprepared: (sql, params) => arrays(sql, params ?? []),
    executeUnprepared: (sql, params, rowTransform) =>
      rowTransform
        ? Effect.map(objects(sql, params ?? []), rowTransform)
        : objects(sql, params ?? []),
    executeStream: () => Stream.die(new Error("SQLite in WASM does not stream rows.")),
  });
};

/** A `SqlClient` over `db`; closing the scope finalizes its statements, not the database. */
export const make = Effect.fn("SqliteWasmClient.make")(function* (db: Database) {
  const connection = makeConnection(db);
  const semaphore = yield* Semaphore.make(1);
  const acquirer = semaphore.withPermits(1)(Effect.succeed(connection));
  const transactionAcquirer = Effect.uninterruptibleMask((restore) => {
    const fiber = Fiber.getCurrent()!;
    const scope = Context.getUnsafe(fiber.context, Scope.Scope);
    return Effect.as(
      Effect.tap(restore(semaphore.take(1)), () => Scope.addFinalizer(scope, semaphore.release(1))),
      connection,
    );
  });
  return yield* Client.make({
    acquirer,
    compiler: Statement.makeCompilerSqlite(),
    transactionAcquirer,
    spanAttributes: [["db.system.name", "sqlite"]],
  });
});

export const layer = (db: Database): Layer.Layer<Client.SqlClient, SqlError> =>
  Layer.effect(Client.SqlClient, make(db)).pipe(Layer.provide(Reactivity.layer));
