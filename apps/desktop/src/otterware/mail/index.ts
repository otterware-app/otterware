// @effect-diagnostics nodeBuiltinImport:off -- Client OS integration, never an environment operation.
import * as NodeFS from "node:fs";
import { writeAttachment } from "./files.ts";
import { appleTranslator } from "./translation.ts";
import { app, BrowserWindow, webContents, shell, nativeImage } from "electron";
import * as NodePath from "node:path";
import {
  desktopMethod,
  MODULE_DESKTOP_EVENT,
  type createDesktopRegistry,
} from "@otterware/module-kit/desktop";
import * as Schema from "effect/Schema";
import { activeProfile } from "@otterware/profiles/active";
import { parseMailtoUrl, setPendingMailto, takePendingMailto, hasPendingMailto } from "./mailto.ts";
import { setModuleNotificationBadge } from "../../ipc/methods/notificationBadge.ts";
import { linuxLogin, setLinuxLogin } from "./login.ts";
import * as mac from "./mac/mail-apps.ts";
import * as linux from "./linux/mail-apps.ts";

const empty = Schema.NullOr(Schema.Struct({}));
const profileHasMail = activeProfile.modules.includes("mail");
let send: (() => void) | undefined;
/** Called before Electron is ready too; the renderer pulls this target after it mounts. */
export function receiveMailUrl(raw: string | undefined): boolean {
  if (!profileHasMail || !raw) return false;
  const target = parseMailtoUrl(raw);
  if (!target) return false;
  setPendingMailto(target);
  send?.();
  return true;
}
export function installMailDesktop(
  registry: ReturnType<typeof createDesktopRegistry>,
  options: {
    platform: NodeJS.Platform;
    configHome: string;
    executable: string;
    isPackaged: boolean;
    translatorPath: string;
  },
) {
  if (!profileHasMail) return () => {};
  const { platform } = options;
  const translation =
    platform === "darwin" && NodeFS.existsSync(options.translatorPath)
      ? appleTranslator(options.translatorPath)
      : null;
  const temporaryFiles = new Set<() => Promise<void>>();
  const attachment = Schema.Struct({
    name: Schema.String.check(Schema.isMaxLength(1024)),
    base64: Schema.String.check(
      Schema.isMaxLength(140 * 1024 * 1024),
      Schema.isPattern(/^[a-zA-Z0-9+/_-]*={0,2}$/),
    ),
    drag: Schema.Boolean,
  });
  const loginFile = NodePath.join(
    options.configHome,
    "autostart",
    `${activeProfile.brand.slug}.desktop`,
  );
  const settings = async () => ({
    launchAtLogin:
      platform === "linux" ? await linuxLogin(loginFile) : app.getLoginItemSettings().openAtLogin,
  });
  const mailApps =
    platform === "darwin"
      ? { listMailApps: mac.listMailApps, setDefaultMailApp: mac.setDefaultMailApp }
      : platform === "linux"
        ? { listMailApps: linux.listMailApps, setDefaultMailApp: linux.setDefaultMailApp }
        : null;
  const stop = registry.register("mail", {
    "file:open": desktopMethod(attachment, async (input, context) => {
      const saved = await writeAttachment(app.getPath("temp"), input);
      temporaryFiles.add(saved.remove);
      if (input.drag) {
        const contents = webContents.fromId(context.senderId);
        if (!contents || contents.isDestroyed()) throw new Error("The Mail window closed.");
        let icon = await app.getFileIcon(saved.file, { size: "normal" });
        if (icon.isEmpty())
          icon = nativeImage.createFromBuffer(
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5RkAAAAASUVORK5CYII=",
              "base64",
            ),
          );
        contents.startDrag({ file: saved.file, icon });
      } else {
        const error = await shell.openPath(saved.file);
        if (error) throw new Error(error);
      }
      return { ok: true };
    }),
    "translation:detect": desktopMethod(
      Schema.Struct({ text: Schema.String.check(Schema.isMaxLength(4000)) }),
      ({ text }) => {
        if (!translation) throw new Error("On-device translation is unavailable.");
        return translation.detect(text);
      },
    ),
    "translation:translate": desktopMethod(
      Schema.Struct({
        segments: Schema.Array(Schema.String.check(Schema.isMaxLength(100000))).check(
          Schema.isMaxLength(2000),
        ),
        source: Schema.String.check(Schema.isPattern(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)),
        target: Schema.String.check(Schema.isPattern(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)),
      }),
      ({ segments, source, target }) => {
        if (!translation) throw new Error("On-device translation is unavailable.");
        if (segments.reduce((sum, text) => sum + text.length, 0) > 1000000)
          throw new Error("This message is too large to translate.");
        return translation.translate(segments, source, target);
      },
    ),
    "app:capabilities": desktopMethod(empty, () => ({
      platform,
      launchAtLogin: options.isPackaged,
      defaultMailApp: options.isPackaged && activeProfile.id === "mail",
      dockBadge: true,
      translation: translation !== null,
      dragOut: true,
      openFiles: true,
    })),
    "app:hasPendingMailto": desktopMethod(empty, (_input, context) => {
      send = () => {
        const contents = webContents.fromId(context.senderId);
        if (!contents || contents.isDestroyed()) return;
        contents.send(MODULE_DESKTOP_EVENT, {
          module: "mail",
          event: "compose:mailto",
          payload: null,
        });
        const window = BrowserWindow.fromWebContents(contents);
        if (window?.isMinimized()) window.restore();
        window?.show();
        window?.focus();
      };
      return hasPendingMailto();
    }),
    "app:takePendingMailto": desktopMethod(empty, takePendingMailto),
    "app:getDefaultMailStatus": desktopMethod(empty, () => ({
      isDefault: app.isDefaultProtocolClient("mailto"),
    })),
    "app:listMailApps": desktopMethod(empty, async () =>
      mailApps
        ? mailApps.listMailApps()
        : {
            apps: [
              {
                id: activeProfile.brand.appId,
                name: activeProfile.brand.productName,
                path: app.getPath("exe"),
              },
            ],
            defaultId: app.isDefaultProtocolClient("mailto") ? activeProfile.brand.appId : null,
          },
    ),
    "app:setDefaultMailApp": desktopMethod(
      Schema.NullOr(Schema.Struct({ id: Schema.optional(Schema.String) })),
      async (input) => {
        if (!options.isPackaged || activeProfile.id !== "mail")
          throw new Error("Use an installed Otter Mail app to register the mailto handler.");
        if (input?.id && input.id !== activeProfile.brand.appId) {
          if (!mailApps || !(await mailApps.listMailApps()).apps.some((app) => app.id === input.id))
            throw new Error("Choose an installed mail app.");
          await mailApps.setDefaultMailApp(input.id);
          return { ok: true };
        }
        return { ok: app.setAsDefaultProtocolClient("mailto") };
      },
    ),
    "app:settings": desktopMethod(empty, settings),
    "app:setLogin": desktopMethod(
      Schema.Struct({ enabled: Schema.Boolean }),
      async ({ enabled }) => {
        if (!options.isPackaged) throw new Error("Open at login is available in an installed app.");
        if (platform === "linux")
          await setLinuxLogin(
            loginFile,
            options.executable,
            activeProfile.brand.productName,
            enabled,
          );
        else app.setLoginItemSettings({ openAtLogin: enabled });
        return settings();
      },
    ),
    "app:badge": desktopMethod(
      Schema.Struct({
        count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 })),
        image: Schema.NullOr(
          Schema.String.check(
            Schema.isMaxLength(16384),
            Schema.isPattern(/^data:image\/png;base64,[a-z0-9+/]+={0,2}$/i),
          ),
        ),
      }),
      ({ count, image }) => setModuleNotificationBadge(platform, "mail", { count, image }),
    ),
  });
  return () => {
    send = undefined;
    stop();
    for (const remove of temporaryFiles) void remove().catch(() => {});
    setModuleNotificationBadge(platform, "mail", { count: 0, image: null });
  };
}
