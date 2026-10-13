/**
 * Cross-app projects and saved views, in `suite.sqlite` (module `home`). Rules
 * and filters are stored as JSON and decoded leniently: a row written by a
 * newer build keeps working with the fields this build knows.
 */
import { ProjectIconColor } from "@t3tools/contracts";
import {
  HomeNotFoundError,
  HomeProject,
  type HomeProjectInput,
  HomeProjectRules,
  HomeStoreError,
  HomeView,
  HomeViewFilter,
  type HomeViewInput,
} from "@otterware/home-contracts";
import type { SuiteMigration } from "@otterware/module-kit/engine";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Clock from "effect/Clock";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

export const HOME_MIGRATIONS: ReadonlyArray<SuiteMigration> = [
  {
    module: "home",
    id: 1,
    name: "suite_projects_and_views",
    run: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        CREATE TABLE suite_projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          icon TEXT,
          rules_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;
      yield* sql`
        CREATE TABLE suite_views (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT,
          filter_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;
    }),
  },
  {
    module: "home",
    id: 2,
    name: "account_sync",
    run: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // Local edits not yet in Otter Cloud; a null value is a deletion.
      yield* sql`
        CREATE TABLE home_sync_outbox (
          record_id TEXT PRIMARY KEY,
          value TEXT,
          modified_at INTEGER NOT NULL,
          mutation_id TEXT NOT NULL
        )
      `;
      yield* sql`
        CREATE TABLE home_sync_cursors (account_id TEXT PRIMARY KEY, cursor INTEGER NOT NULL)
      `;
    }),
  },
];

/** Home's records in Otter Cloud's `home.projects` collection: projects and views. */
export const HOME_SYNC_COLLECTION = "home.projects";
const HomeSyncValue = Schema.Union([
  Schema.TaggedStruct("project", { project: HomeProject }),
  Schema.TaggedStruct("view", { view: HomeView }),
]);
type HomeSyncValue = typeof HomeSyncValue.Type;
const encodeSyncValue = Schema.encodeEffect(Schema.fromJsonString(HomeSyncValue));
const decodeSyncValue = Schema.decodeUnknownEffect(HomeSyncValue);
const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown));

/** A local change ready to push. */
export interface HomeOutgoing {
  readonly id: string;
  readonly value: unknown;
  readonly modifiedAt: number;
  readonly mutationId: string;
}

/** A record from Otter Cloud: the newest write wins, a null value deletes. */
export interface HomeIncoming {
  readonly id: string;
  readonly value: unknown;
  readonly modifiedAt: number;
}

interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string | null;
  readonly rules_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ViewRow {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly filter_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

const decodeRules = Schema.decodeUnknownEffect(Schema.fromJsonString(HomeProjectRules));
const decodeFilter = Schema.decodeUnknownEffect(Schema.fromJsonString(HomeViewFilter));
const encodeRules = Schema.encodeEffect(Schema.fromJsonString(HomeProjectRules));
const encodeFilter = Schema.encodeEffect(Schema.fromJsonString(HomeViewFilter));
const decodeColor = Schema.decodeUnknownEffect(ProjectIconColor);

export class HomeStore extends Context.Service<
  HomeStore,
  {
    readonly listProjects: Effect.Effect<ReadonlyArray<HomeProject>, HomeStoreError>;
    readonly listViews: Effect.Effect<ReadonlyArray<HomeView>, HomeStoreError>;
    /** Creates the project when `input.id` is absent, else replaces it. */
    readonly saveProject: (
      input: HomeProjectInput,
    ) => Effect.Effect<HomeProject, HomeNotFoundError | HomeStoreError>;
    readonly deleteProject: (id: string) => Effect.Effect<void, HomeStoreError>;
    readonly saveView: (
      input: HomeViewInput,
    ) => Effect.Effect<HomeView, HomeNotFoundError | HomeStoreError>;
    readonly deleteView: (id: string) => Effect.Effect<void, HomeStoreError>;
    /** Every local write, for the account sync to push soon. */
    readonly writes: Stream.Stream<void>;
    /** Queues every project and view, for an account's first sync on this device. */
    readonly adoptAll: Effect.Effect<void, HomeStoreError>;
    readonly outgoing: (
      limit: number,
    ) => Effect.Effect<ReadonlyArray<HomeOutgoing>, HomeStoreError>;
    /** Drops pushed changes that were not edited again meanwhile. */
    readonly acknowledge: (
      changes: ReadonlyArray<HomeOutgoing>,
    ) => Effect.Effect<void, HomeStoreError>;
    /** Applies records from Otter Cloud where they are newer than this device's. */
    readonly applyIncoming: (
      records: ReadonlyArray<HomeIncoming>,
    ) => Effect.Effect<void, HomeStoreError>;
    readonly cursor: (accountId: string) => Effect.Effect<number | null, HomeStoreError>;
    readonly saveCursor: (accountId: string, cursor: number) => Effect.Effect<void, HomeStoreError>;
  }
>()("@otterware/home-engine/HomeStore") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const writes = yield* PubSub.sliding<void>(1);

  const storeError = (operation: string) => (cause: unknown) =>
    new HomeStoreError({ operation, cause });

  const toProject = (row: ProjectRow) =>
    Effect.gen(function* () {
      const rules = yield* decodeRules(row.rules_json).pipe(
        Effect.catch(() => decodeRules("{}")),
        Effect.orDie,
      );
      const color = yield* decodeColor(row.color).pipe(
        Effect.orElseSucceed((): ProjectIconColor => "gray"),
      );
      return {
        id: row.id,
        name: row.name,
        color,
        ...(row.icon === null ? {} : { icon: row.icon }),
        rules,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } satisfies HomeProject;
    });

  const toView = (row: ViewRow) =>
    Effect.gen(function* () {
      const filter = yield* decodeFilter(row.filter_json).pipe(
        Effect.catch(() => decodeFilter("{}")),
        Effect.orDie,
      );
      return {
        id: row.id,
        name: row.name,
        ...(row.icon === null ? {} : { icon: row.icon }),
        filter,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } satisfies HomeView;
    });

  const now = Effect.map(DateTime.now, DateTime.formatIso);
  const newId = (prefix: string) =>
    crypto.randomUUIDv4.pipe(
      Effect.map((id) => `${prefix}_${id.replaceAll("-", "").slice(0, 16)}`),
      Effect.mapError(storeError("allocate an id")),
    );

  /** Queues a change for Otter Cloud; the newest change of a record replaces older ones. */
  const enqueue = (id: string, value: HomeSyncValue | null, modifiedAt: number) =>
    Effect.gen(function* () {
      const json = value === null ? null : yield* encodeSyncValue(value);
      const mutationId = yield* crypto.randomUUIDv4;
      yield* sql`
        INSERT INTO home_sync_outbox (record_id, value, modified_at, mutation_id)
        VALUES (${id}, ${json}, ${modifiedAt}, ${mutationId})
        ON CONFLICT (record_id) DO UPDATE SET value = excluded.value,
          modified_at = excluded.modified_at, mutation_id = excluded.mutation_id
      `;
      yield* PubSub.publish(writes, undefined);
    }).pipe(Effect.mapError(storeError("queue a change for sync")));
  const enqueueProject = (project: HomeProject) =>
    enqueue(`project:${project.id}`, { _tag: "project", project }, Date.parse(project.updatedAt));
  const enqueueView = (view: HomeView) =>
    enqueue(`view:${view.id}`, { _tag: "view", view }, Date.parse(view.updatedAt));
  const enqueueDeletion = (id: string) =>
    Effect.flatMap(Clock.currentTimeMillis, (now) => enqueue(id, null, now));

  const listProjects = sql<ProjectRow>`
    SELECT id, name, color, icon, rules_json, created_at, updated_at
    FROM suite_projects ORDER BY created_at, id
  `.pipe(
    Effect.mapError(storeError("list projects")),
    Effect.flatMap((rows) => Effect.forEach(rows, toProject)),
  );

  const listViews = sql<ViewRow>`
    SELECT id, name, icon, filter_json, created_at, updated_at
    FROM suite_views ORDER BY created_at, id
  `.pipe(
    Effect.mapError(storeError("list views")),
    Effect.flatMap((rows) => Effect.forEach(rows, toView)),
  );

  const saveProjectLocally = Effect.fn("HomeStore.saveProject")(function* (
    input: HomeProjectInput,
  ) {
    const timestamp = yield* now;
    const rulesJson = yield* encodeRules(input.rules).pipe(
      Effect.mapError(storeError("encode project rules")),
    );
    const name = input.name.trim();
    const icon = input.icon ?? null;
    if (input.id === undefined) {
      const id = yield* newId("proj");
      yield* sql`
        INSERT INTO suite_projects (id, name, color, icon, rules_json, created_at, updated_at)
        VALUES (${id}, ${name}, ${input.color}, ${icon}, ${rulesJson}, ${timestamp}, ${timestamp})
      `.pipe(Effect.mapError(storeError("create a project")));
      return {
        id,
        name,
        color: input.color,
        ...(input.icon ? { icon: input.icon } : {}),
        rules: input.rules,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }
    const rows = yield* sql<ProjectRow>`
      UPDATE suite_projects
      SET name = ${name}, color = ${input.color}, icon = ${icon},
          rules_json = ${rulesJson}, updated_at = ${timestamp}
      WHERE id = ${input.id}
      RETURNING id, name, color, icon, rules_json, created_at, updated_at
    `.pipe(Effect.mapError(storeError("update a project")));
    const row = rows[0];
    if (row === undefined) {
      return yield* new HomeNotFoundError({ entity: "project", id: input.id });
    }
    return yield* toProject(row);
  });

  const saveProject: HomeStore["Service"]["saveProject"] = (input) =>
    saveProjectLocally(input).pipe(Effect.tap(enqueueProject));

  const deleteProject: HomeStore["Service"]["deleteProject"] = (id) =>
    sql`DELETE FROM suite_projects WHERE id = ${id}`.pipe(
      Effect.asVoid,
      Effect.mapError(storeError("delete a project")),
      Effect.andThen(enqueueDeletion(`project:${id}`)),
    );

  const saveViewLocally = Effect.fn("HomeStore.saveView")(function* (input: HomeViewInput) {
    const timestamp = yield* now;
    const filterJson = yield* encodeFilter(input.filter).pipe(
      Effect.mapError(storeError("encode the view filter")),
    );
    const name = input.name.trim();
    const icon = input.icon ?? null;
    if (input.id === undefined) {
      const id = yield* newId("view");
      yield* sql`
          INSERT INTO suite_views (id, name, icon, filter_json, created_at, updated_at)
          VALUES (${id}, ${name}, ${icon}, ${filterJson}, ${timestamp}, ${timestamp})
        `.pipe(Effect.mapError(storeError("create a view")));
      return {
        id,
        name,
        ...(input.icon ? { icon: input.icon } : {}),
        filter: input.filter,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }
    const rows = yield* sql<ViewRow>`
        UPDATE suite_views
        SET name = ${name}, icon = ${icon}, filter_json = ${filterJson}, updated_at = ${timestamp}
        WHERE id = ${input.id}
        RETURNING id, name, icon, filter_json, created_at, updated_at
      `.pipe(Effect.mapError(storeError("update a view")));
    const row = rows[0];
    if (row === undefined) {
      return yield* new HomeNotFoundError({ entity: "view", id: input.id });
    }
    return yield* toView(row);
  });

  const saveView: HomeStore["Service"]["saveView"] = (input) =>
    saveViewLocally(input).pipe(Effect.tap(enqueueView));

  const deleteView: HomeStore["Service"]["deleteView"] = (id) =>
    sql`DELETE FROM suite_views WHERE id = ${id}`.pipe(
      Effect.asVoid,
      Effect.mapError(storeError("delete a view")),
      Effect.andThen(enqueueDeletion(`view:${id}`)),
    );

  const adoptAll = Effect.gen(function* () {
    for (const project of yield* listProjects) yield* enqueueProject(project);
    for (const view of yield* listViews) yield* enqueueView(view);
  });

  const outgoing = (limit: number) =>
    sql<{
      readonly record_id: string;
      readonly value: string | null;
      readonly modified_at: number;
      readonly mutation_id: string;
    }>`
      SELECT record_id, value, modified_at, mutation_id FROM home_sync_outbox
      ORDER BY modified_at LIMIT ${limit}
    `.pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) =>
          Effect.gen(function* () {
            const value = row.value === null ? null : yield* decodeJson(row.value);
            return {
              id: row.record_id,
              value,
              modifiedAt: Number(row.modified_at),
              mutationId: row.mutation_id,
            } satisfies HomeOutgoing;
          }),
        ),
      ),
      Effect.mapError(storeError("read changes to sync")),
    );

  const acknowledge = (changes: ReadonlyArray<HomeOutgoing>) =>
    Effect.forEach(
      changes,
      (change) =>
        sql`
          DELETE FROM home_sync_outbox
          WHERE record_id = ${change.id} AND mutation_id = ${change.mutationId}
        `,
      { discard: true },
    ).pipe(Effect.mapError(storeError("acknowledge synced changes")));

  const localUpdatedAt = (table: "project" | "view", id: string) =>
    Effect.map(
      table === "project"
        ? sql<{
            readonly updated_at: string;
          }>`SELECT updated_at FROM suite_projects WHERE id = ${id}`
        : sql<{ readonly updated_at: string }>`SELECT updated_at FROM suite_views WHERE id = ${id}`,
      (rows) => (rows[0] === undefined ? null : Date.parse(rows[0].updated_at)),
    );

  const applyOne = (record: HomeIncoming) =>
    Effect.gen(function* () {
      const [kind, ...rest] = record.id.split(":");
      const id = rest.join(":");
      if ((kind !== "project" && kind !== "view") || id === "") return;
      const pending = yield* sql<{ readonly modified_at: number }>`
        SELECT modified_at FROM home_sync_outbox WHERE record_id = ${record.id}
      `;
      // A newer edit here is still to be pushed, and wins there too.
      if (pending[0] !== undefined && Number(pending[0].modified_at) >= record.modifiedAt) return;
      yield* sql`DELETE FROM home_sync_outbox WHERE record_id = ${record.id}`;
      const local = yield* localUpdatedAt(kind, id);
      if (record.value === null) {
        if (local !== null && local <= record.modifiedAt) {
          if (kind === "project") yield* sql`DELETE FROM suite_projects WHERE id = ${id}`;
          else yield* sql`DELETE FROM suite_views WHERE id = ${id}`;
        }
        return;
      }
      if (local !== null && local >= record.modifiedAt) return;
      const value = yield* decodeSyncValue(record.value).pipe(Effect.option);
      if (value._tag === "None") return;
      if (value.value._tag === "project") {
        const project = value.value.project;
        const rulesJson = yield* encodeRules(project.rules);
        yield* sql`
          INSERT INTO suite_projects (id, name, color, icon, rules_json, created_at, updated_at)
          VALUES (${id}, ${project.name}, ${project.color}, ${project.icon ?? null}, ${rulesJson},
            ${project.createdAt}, ${project.updatedAt})
          ON CONFLICT (id) DO UPDATE SET name = excluded.name, color = excluded.color,
            icon = excluded.icon, rules_json = excluded.rules_json, updated_at = excluded.updated_at
        `;
      } else {
        const view = value.value.view;
        const filterJson = yield* encodeFilter(view.filter);
        yield* sql`
          INSERT INTO suite_views (id, name, icon, filter_json, created_at, updated_at)
          VALUES (${id}, ${view.name}, ${view.icon ?? null}, ${filterJson}, ${view.createdAt},
            ${view.updatedAt})
          ON CONFLICT (id) DO UPDATE SET name = excluded.name, icon = excluded.icon,
            filter_json = excluded.filter_json, updated_at = excluded.updated_at
        `;
      }
    });

  const applyIncoming = (records: ReadonlyArray<HomeIncoming>) =>
    Effect.forEach(records, applyOne, { discard: true }).pipe(
      sql.withTransaction,
      Effect.mapError(storeError("apply synced changes")),
    );

  const cursor = (accountId: string) =>
    sql<{ readonly cursor: number }>`
      SELECT cursor FROM home_sync_cursors WHERE account_id = ${accountId}
    `.pipe(
      Effect.map((rows) => (rows[0] === undefined ? null : Number(rows[0].cursor))),
      Effect.mapError(storeError("read the sync cursor")),
    );

  const saveCursor = (accountId: string, value: number) =>
    sql`
      INSERT INTO home_sync_cursors (account_id, cursor) VALUES (${accountId}, ${value})
      ON CONFLICT (account_id) DO UPDATE SET cursor = excluded.cursor
    `.pipe(Effect.asVoid, Effect.mapError(storeError("save the sync cursor")));

  return HomeStore.of({
    listProjects,
    listViews,
    saveProject,
    deleteProject,
    saveView,
    deleteView,
    writes: Stream.fromPubSub(writes),
    adoptAll,
    outgoing,
    acknowledge,
    applyIncoming,
    cursor,
    saveCursor,
  });
});

/** `SqlClient` is `suite.sqlite`, which the module runtime provides to every module layer. */
export const layer = Layer.effect(HomeStore, make);
