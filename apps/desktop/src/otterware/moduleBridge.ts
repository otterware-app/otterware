import * as HostProcess from "@t3tools/shared/HostProcess";
import { DesktopEnvironment } from "../app/DesktopEnvironment.ts";
import { installMailDesktop } from "./mail/index.ts";
import { createDesktopRegistry, MODULE_DESKTOP_REQUEST } from "@otterware/module-kit/desktop";
import { app, ipcMain } from "electron";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ElectronWindow } from "../electron/ElectronWindow.ts";

const moduleDesktopRegistry = createDesktopRegistry();

export const installModuleDesktopBridge = Effect.gen(function* () {
  const windows = yield* ElectronWindow;
  const environment = yield* DesktopEnvironment;
  const env = yield* HostProcess.Environment;
  yield* Effect.acquireRelease(
    Effect.sync(() =>
      installMailDesktop(moduleDesktopRegistry, {
        platform: environment.platform,
        isPackaged: environment.isPackaged,
        configHome:
          env.XDG_CONFIG_HOME || environment.path.join(environment.homeDirectory, ".config"),
        executable: Option.getOrUndefined(environment.appImagePath) ?? app.getPath("exe"),
      }),
    ),
    (stop) => Effect.sync(stop),
  );
  const context = yield* Effect.context<never>();
  const run = Effect.runPromiseWith(context);
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      ipcMain.handle(MODULE_DESKTOP_REQUEST, async (event, request: unknown) => {
        const window = await run(windows.main);
        if (
          Option.isNone(window) ||
          window.value.webContents.id !== event.sender.id ||
          event.senderFrame !== event.sender.mainFrame
        ) {
          throw new Error("Module desktop requests require the host window.");
        }
        return moduleDesktopRegistry.invoke(request, { senderId: event.sender.id });
      });
    }),
    () => Effect.sync(() => ipcMain.removeHandler(MODULE_DESKTOP_REQUEST)),
  );
});
