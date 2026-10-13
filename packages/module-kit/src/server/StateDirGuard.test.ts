import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

import { acquireWriterLock, ensureSoleWriter, type RecordedServer } from "./StateDirGuard.ts";

const OTHER_PID = 424_242;
const OWN_PID = 1_000;

const guard = (input: {
  readonly recorded: RecordedServer | null;
  readonly alivePids: ReadonlyArray<number>;
  readonly listeningPorts: ReadonlyArray<number>;
}) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.flatMap(fs.makeTempDirectoryScoped(), (stateDir) =>
      ensureSoleWriter({
        stateDir,
        readRecordedServer: Effect.succeed(Option.fromNullishOr(input.recorded)),
        isProcessAlive: (pid) => input.alivePids.includes(pid),
        hasListenerOnHost: (port) => Effect.succeed(input.listeningPorts.includes(port)),
        ownPid: OWN_PID,
        exitGraceAttempts: 0,
      }).pipe(Effect.map(() => stateDir)),
    ),
  );

const recorded = (pid: number, port = 4_321): RecordedServer => ({
  pid,
  port,
  origin: `http://127.0.0.1:${port}`,
});

it.layer(NodeServices.layer)("StateDirGuard", (it) => {
  it.effect("refuses to start while another live, listening server owns the state dir", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        guard({ recorded: recorded(OTHER_PID), alivePids: [OTHER_PID], listeningPorts: [4_321] }),
      );
      if (error._tag !== "StateDirInUseError") throw new Error(`unexpected ${error._tag}`);
      assert.strictEqual(error.pid, OTHER_PID);
      assert.include(error.message, `(pid ${OTHER_PID}) is using`);
    }),
  );

  it.effect("starts when there is no runtime record", () =>
    guard({ recorded: null, alivePids: [OTHER_PID], listeningPorts: [4_321] }),
  );

  it.effect("ignores a stale record whose pid is dead", () =>
    guard({ recorded: recorded(OTHER_PID), alivePids: [], listeningPorts: [4_321] }),
  );

  it.effect("ignores a reused pid with nothing listening on the recorded port", () =>
    guard({ recorded: recorded(OTHER_PID), alivePids: [OTHER_PID], listeningPorts: [] }),
  );

  it.effect("ignores its own pid", () =>
    guard({ recorded: recorded(OWN_PID), alivePids: [OWN_PID], listeningPorts: [4_321] }),
  );

  it.effect(
    "atomically excludes simultaneous starts before a runtime record exists and releases on exit",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const stateDir = yield* fs.makeTempDirectoryScoped();
        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* acquireWriterLock({ stateDir });
            const error = yield* Effect.flip(Effect.scoped(acquireWriterLock({ stateDir })));
            if (error._tag !== "StateDirInUseError") throw new Error(`unexpected ${error._tag}`);
            assert.strictEqual(error.pid, 0);
          }),
        );
        yield* Effect.scoped(acquireWriterLock({ stateDir }));
      }),
  );
});
