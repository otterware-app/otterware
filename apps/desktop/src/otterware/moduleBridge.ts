import { createDesktopRegistry, MODULE_DESKTOP_REQUEST } from "@otterware/module-kit/desktop";
import { ipcMain } from "electron";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ElectronWindow } from "../electron/ElectronWindow.ts";

const moduleDesktopRegistry = createDesktopRegistry();

export const installModuleDesktopBridge = Effect.gen(function* () {
  const windows = yield* ElectronWindow;
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
