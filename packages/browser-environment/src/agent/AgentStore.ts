/**
 * The light agent loop's data in `suite.sqlite`, namespaced `browser_agent_*`:
 * the user's Hermes and OpenClaw servers, threads, and each thread's history
 * as the chat shows it. Credentials stay in this browser profile, sealed
 * with its non-extractable key (`BrowserSecrets.ts`).
 */
import { runSuiteMigrations, SuiteSqlClient } from "@otterware/module-kit/runtime";
import type { SuiteMigration } from "@otterware/module-kit/engine";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";

import { BrowserSecrets } from "../BrowserSecrets.ts";
import {
  type BrowserAgentAccess,
  type BrowserAgentKind,
  BrowserAgentMessage,
  type BrowserAgentThread,
} from "./contracts.ts";

export const AGENT_MIGRATIONS: ReadonlyArray<SuiteMigration> = [
  {
    module: "browser-agent",
    id: 1,
    name: "servers_threads_messages",
    run: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        CREATE TABLE browser_agent_servers (
          agent TEXT PRIMARY KEY,
          base_url TEXT NOT NULL,
          secret TEXT NOT NULL
        )
      `;
      yield* sql`
        CREATE TABLE browser_agent_threads (
          id TEXT PRIMARY KEY,
          agent TEXT NOT NULL,
          model TEXT NOT NULL,
          access TEXT NOT NULL,
          title TEXT NOT NULL,
          native_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `;
      yield* sql`
        CREATE TABLE browser_agent_messages (
          thread_id TEXT NOT NULL REFERENCES browser_agent_threads (id) ON DELETE CASCADE,
          seq INTEGER NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (thread_id, seq)
        )
      `;
    }),
  },
];

export interface AgentServer {
  readonly baseUrl: string;
  readonly secret: string;
}

/** A thread as stored; `running` is the loop's to add. */
export type StoredThread = Omit<BrowserAgentThread, "running"> & {
  readonly nativeId: string | null;
};

interface ThreadRow {
  readonly id: string;
  readonly agent: string;
  readonly model: string;
  readonly access: string;
  readonly title: string;
  readonly native_id: string | null;
  readonly created_at: number;
  readonly updated_at: number;
}

const toThread = (row: ThreadRow): StoredThread => ({
  id: row.id,
  agent: row.agent as BrowserAgentKind,
  model: row.model,
  access: row.access as BrowserAgentAccess,
  title: row.title,
  nativeId: row.native_id,
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
});

const MessageJson = Schema.fromJsonString(BrowserAgentMessage);
const encodeMessage = Schema.encodeEffect(MessageJson);
const decodeMessage = Schema.decodeEffect(MessageJson);

export class AgentStore extends Context.Service<
  AgentStore,
  {
    readonly server: (agent: "hermes" | "openclaw") => Effect.Effect<AgentServer, SqlError>;
    readonly saveServer: (
      agent: "hermes" | "openclaw",
      server: AgentServer,
    ) => Effect.Effect<void, SqlError>;
    readonly threads: Effect.Effect<ReadonlyArray<StoredThread>, SqlError>;
    readonly thread: (id: string) => Effect.Effect<Option.Option<StoredThread>, SqlError>;
    readonly createThread: (
      thread: Omit<StoredThread, "nativeId" | "createdAt" | "updatedAt">,
    ) => Effect.Effect<StoredThread, SqlError>;
    readonly setNativeId: (id: string, nativeId: string) => Effect.Effect<void, SqlError>;
    readonly deleteThread: (id: string) => Effect.Effect<void, SqlError>;
    readonly messages: (
      threadId: string,
    ) => Effect.Effect<ReadonlyArray<BrowserAgentMessage>, SqlError | Schema.SchemaError>;
    readonly append: (
      threadId: string,
      message: BrowserAgentMessage,
    ) => Effect.Effect<void, SqlError | Schema.SchemaError>;
  }
>()("@otterware/browser-environment/agent/AgentStore") {}

export const layer = Layer.effect(
  AgentStore,
  Effect.gen(function* () {
    const sql = yield* SuiteSqlClient;
    const secrets = yield* BrowserSecrets;
    yield* runSuiteMigrations(AGENT_MIGRATIONS).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
    );

    const server = (agent: "hermes" | "openclaw") =>
      Effect.gen(function* () {
        const rows = yield* sql<{ readonly base_url: string; readonly secret: string }>`
          SELECT base_url, secret FROM browser_agent_servers WHERE agent = ${agent}
        `;
        return {
          baseUrl: rows[0]?.base_url ?? "",
          secret: yield* secrets.open(rows[0]?.secret ?? ""),
        } satisfies AgentServer;
      });

    const thread = (id: string) =>
      Effect.map(sql<ThreadRow>`SELECT * FROM browser_agent_threads WHERE id = ${id}`, (rows) =>
        Option.map(Option.fromNullishOr(rows[0]), toThread),
      );

    return AgentStore.of({
      server,
      saveServer: (agent, { baseUrl, secret }) =>
        Effect.flatMap(
          secrets.seal(secret),
          (sealed) => sql`
            INSERT INTO browser_agent_servers (agent, base_url, secret)
            VALUES (${agent}, ${baseUrl}, ${sealed})
            ON CONFLICT (agent) DO UPDATE SET base_url = excluded.base_url, secret = excluded.secret
          `,
        ).pipe(Effect.asVoid),
      threads: Effect.map(
        sql<ThreadRow>`SELECT * FROM browser_agent_threads ORDER BY updated_at DESC`,
        (rows) => rows.map(toThread),
      ),
      thread,
      createThread: (input) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          yield* sql`
            INSERT INTO browser_agent_threads
              (id, agent, model, access, title, native_id, created_at, updated_at)
            VALUES (${input.id}, ${input.agent}, ${input.model}, ${input.access}, ${input.title},
              NULL, ${now}, ${now})
          `;
          return { ...input, nativeId: null, createdAt: now, updatedAt: now };
        }),
      setNativeId: (id, nativeId) =>
        sql`UPDATE browser_agent_threads SET native_id = ${nativeId} WHERE id = ${id}`.pipe(
          Effect.asVoid,
        ),
      deleteThread: (id) =>
        Effect.gen(function* () {
          yield* sql`DELETE FROM browser_agent_messages WHERE thread_id = ${id}`;
          yield* sql`DELETE FROM browser_agent_threads WHERE id = ${id}`;
        }).pipe(sql.withTransaction),
      messages: (threadId) =>
        sql<{ readonly value: string }>`
          SELECT value FROM browser_agent_messages WHERE thread_id = ${threadId} ORDER BY seq
        `.pipe(Effect.flatMap((rows) => Effect.forEach(rows, (row) => decodeMessage(row.value)))),
      append: (threadId, message) =>
        Effect.gen(function* () {
          const value = yield* encodeMessage(message);
          const now = yield* Clock.currentTimeMillis;
          yield* sql`
            INSERT INTO browser_agent_messages (thread_id, seq, value)
            SELECT ${threadId}, COALESCE(MAX(seq), 0) + 1, ${value}
            FROM browser_agent_messages WHERE thread_id = ${threadId}
          `;
          yield* sql`UPDATE browser_agent_threads SET updated_at = ${now} WHERE id = ${threadId}`;
        }).pipe(sql.withTransaction),
    });
  }),
);
