// @effect-diagnostics nodeBuiltinImport:off -- Client OS integration, never an environment operation.
import { app, BrowserWindow, webContents } from "electron";
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
  },
) {
  if (!profileHasMail) return () => {};
  const { platform } = options;
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
    "app:capabilities": desktopMethod(empty, () => ({
      platform,
      launchAtLogin: options.isPackaged,
      defaultMailApp: options.isPackaged && activeProfile.id === "mail",
      dockBadge: true,
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
    setModuleNotificationBadge(platform, "mail", { count: 0, image: null });
  };
}
