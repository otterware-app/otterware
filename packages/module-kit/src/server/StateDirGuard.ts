/**
 * One writer per data home (ADR 0012). Otterware and Otter Code share
 * `~/.otter-code`; two servers on one statev2.sqlite would both run the
 * scheduler, provider sessions and effect worker, so agent work would run
 * twice. A server refuses to start while the data home's runtime record names
 * another live server that is still listening, and holds an atomic directory
 * lock from before database initialization until shutdown.
 *
 * Handoffs stay safe: the service launcher terminates the old child and waits
 * for its exit before starting an update trial, `node --watch` waits for exit
 * before restarting, and a server clears its runtime record on shutdown. A
 * record left by a crash names a dead pid (or a reused pid with nothing on the
 * recorded port) and is ignored. Older releases that do not take the lock
 * must be quit by hand; the desktop app recognises the refusal marker and
 * asks the user instead of restarting the backend in a loop.
 */
import { lock } from "proper-lockfile";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

/** Printed to stderr, followed by `{"pid":N,"stateDir":"..."}`, when startup is refused. */
export const STATE_DIR_IN_USE_MARKER = "OTTERWARE_STATE_DIR_IN_USE";

const encodeMarkerDetail = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Struct({ pid: Schema.Int, stateDir: Schema.String })),
);

export class StateDirInUseError extends Schema.TaggedError<StateDirInUseError>()(
  "StateDirInUseError",
  { pid: Schema.Int, stateDir: Schema.String },
) {
  override get message(): string {
    if (this.pid === 0)
      return `Another server is starting or using ${this.stateDir}. Quit it first.`;
    return `Another server (pid ${this.pid}) is using ${this.stateDir}. Quit it first.`;
  }
}

/** What the data home's runtime record says about the server that wrote it. */
export interface RecordedServer {
  readonly pid: number;
  readonly port: number;
  /** The origin the server advertised; its host is probed for a listener. */
  readonly origin: string;
}

export interface StateDirGuardInput {
  readonly stateDir: string;
  /** Reads the runtime record; none when the file is absent or unreadable. */
  readonly readRecordedServer: Effect.Effect<Option.Option<RecordedServer>>;
  readonly isProcessAlive: (pid: number) => boolean;
  readonly hasListenerOnHost: (port: number, host: string) => Effect.Effect<boolean>;
  readonly ownPid: number;
  /** How long a conflicting server gets to finish exiting (restart races). */
  readonly exitGraceAttempts?: number;
}

const probeHost = (origin: string) => {
  try {
    const hostname = new URL(origin).hostname;
    return hostname.length > 0 ? hostname.replace(/^\[(.*)\]$/, "$1") : "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
};

const writeMarker = (error: StateDirInUseError) =>
  encodeMarkerDetail({ pid: error.pid, stateDir: error.stateDir }).pipe(
    Effect.orDie,
    Effect.flatMap((detail) =>
      Effect.sync(() => process.stderr.write(`${STATE_DIR_IN_USE_MARKER} ${detail}\n`)),
    ),
  );

/** The live server recorded for this state dir, if it is not this process. */
const findOtherServer = Effect.fn("StateDirGuard.findOtherServer")(function* (
  input: StateDirGuardInput,
) {
  const recorded = yield* input.readRecordedServer;
  if (Option.isNone(recorded)) return Option.none<RecordedServer>();
  const { pid } = recorded.value;
  if (pid <= 0 || pid === input.ownPid || !input.isProcessAlive(pid)) return Option.none();
  // A pid can be reused after a crash or reboot; a server that owns the state
  // dir is also listening on the port it recorded.
  const listening = yield* input.hasListenerOnHost(
    recorded.value.port,
    probeHost(recorded.value.origin),
  );
  return listening ? recorded : Option.none();
});

/** Held from before database initialization until the server's scope closes. */
export const acquireWriterLock = Effect.fn("StateDirGuard.acquireWriterLock")(function* (input: {
  readonly stateDir: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(input.stateDir, { recursive: true });
  yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        // The directory itself is the lock key; proper-lockfile creates a
        // sibling `.lock` directory atomically and keeps its mtime fresh.
        lock(input.stateDir, { realpath: true, stale: 10_000, update: 2_000, retries: 0 }),
      catch: () => new StateDirInUseError({ pid: 0, stateDir: input.stateDir }),
    }).pipe(Effect.tapError(writeMarker)),
    (release) => Effect.promise(() => release()).pipe(Effect.ignore),
  );
});

/** Fails with `StateDirInUseError` while another live server owns `stateDir`. */
export const ensureSoleWriter = Effect.fn("StateDirGuard.ensureSoleWriter")(function* (
  input: StateDirGuardInput,
) {
  const result = yield* findOtherServer(input).pipe(
    Effect.flatMap((found) =>
      Option.isSome(found)
        ? Effect.fail(new StateDirInUseError({ pid: found.value.pid, stateDir: input.stateDir }))
        : Effect.void,
    ),
    Effect.retry({
      times: input.exitGraceAttempts ?? 12,
      schedule: Schedule.spaced("250 millis"),
    }),
    Effect.result,
  );
  if (result._tag === "Success") return;
  yield* writeMarker(result.failure);
  return yield* result.failure;
});
