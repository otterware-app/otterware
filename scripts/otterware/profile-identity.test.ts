// @effect-diagnostics nodeBuiltinImport:off -- Verify build-time profiles in fresh Node processes.
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const root = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "../..");
const source = `
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DesktopEnvironment from "../apps/desktop/src/app/DesktopEnvironment.ts";
import * as DesktopConfig from "../apps/desktop/src/app/DesktopConfig.ts";
import { resolveUserDataPath } from "../apps/desktop/src/app/DesktopUserData.ts";
import * as NodePath from "node:path";
import { activeProfile } from "../profiles/active.ts";
import { profileAppIdentity, profileIconPath, profileUpdateChannel } from "../profiles/index.ts";
import { resolveDesktopBaseDir, resolveDesktopClientBaseDir } from "../apps/desktop/src/app/DesktopStatePaths.ts";
import { resolveDesktopAppBranding } from "../apps/desktop/src/app/DesktopEnvironment.ts";
import { getDesktopScheme } from "../apps/desktop/src/electron/ElectronProtocol.ts";
import { resolveLinuxDesktopEntryName } from "../apps/desktop/src/app/DesktopEarlyElectronStartup.ts";
import { resolveDesktopProductName } from "./build-desktop-artifact.ts";
const paths = { homeDirectory: "/sandbox", joinPath: NodePath.posix.join, t3Home: Option.none() };
const environment = await Effect.runPromise(DesktopEnvironment.DesktopEnvironment.pipe(Effect.provide(DesktopEnvironment.layer({
  dirname: "/sandbox/repo/apps/desktop/dist-electron", homeDirectory: "/sandbox", platform: "linux", processArch: "x64", appVersion: "1.0.0", appPath: "/sandbox/app.asar", isPackaged: true, resourcesPath: "/sandbox/resources", runningUnderArm64Translation: false,
}).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({})))))));
const userData = await Effect.runPromise(resolveUserDataPath(environment).pipe(Effect.provide(NodeServices.layer)));
console.log("OTTERWARE_IDENTITY_JSON=" + JSON.stringify({
stateDir: environment.stateDir, serverSettings: environment.serverSettingsPath, userData,
identity: profileAppIdentity(activeProfile, false), devIdentity: profileAppIdentity(activeProfile, true),
serverHome: resolveDesktopBaseDir(paths), clientHome: resolveDesktopClientBaseDir(paths),
override: resolveDesktopClientBaseDir({...paths, t3Home: Option.some("/isolated")}),
branding: resolveDesktopAppBranding({isDevelopment: false, appVersion: "1.0.0"}),
product: resolveDesktopProductName("1.0.0"), scheme: getDesktopScheme(false), linuxEntry: resolveLinuxDesktopEntryName(false),
channel: profileUpdateChannel(activeProfile,"nightly"), artwork: profileIconPath(activeProfile,"development","windows.ico")
}));
`;

describe("profile identity at runtime and in build scripts", () => {
  it.each([
    ["otterware", "Otterware", "dev.otterware.suite", "otterware", ".otter-code", ".otterware"],
    ["code", "Otter Code", "dev.otterware.code", "ottercode", ".otter-code", ".otter-code"],
    ["mail", "Otter Mail", "dev.otterware.mail", "ottermail", ".otter-mail", ".otter-mail"],
    [
      "calendar",
      "Otter Calendar",
      "dev.otterware.calendar",
      "ottercalendar",
      ".otter-calendar",
      ".otter-calendar",
    ],
    ["drive", "Otter Drive", "dev.otterware.drive", "otterdrive", ".otter-drive", ".otter-drive"],
  ])(
    "wires %s through desktop and packaging with an isolated explicit home",
    (profile, label, appId, scheme, serverHome, clientHome) => {
      const result = NodeChildProcess.spawnSync(
        process.execPath,
        ["--input-type=module", "-e", source],
        {
          cwd: NodePath.join(root, "scripts"),
          env: { ...process.env, OTTERWARE_PROFILE: profile },
          encoding: "utf8",
          timeout: 20_000,
        },
      );
      expect(result.status, result.stderr).toBe(0);
      const line = result.stdout
        .split("\n")
        .find((value) => value.startsWith("OTTERWARE_IDENTITY_JSON="));
      expect(line).toBeDefined();
      const output = JSON.parse(line!.slice("OTTERWARE_IDENTITY_JSON=".length));
      expect(output).toMatchObject({
        identity: { displayName: label, appId, urlScheme: scheme },
        devIdentity: {
          displayName: `${label} (Dev)`,
          appId: `${appId}.dev`,
          urlScheme: `${scheme}-dev`,
        },
        serverHome: `/sandbox/${serverHome}`,
        stateDir: `/sandbox/${clientHome}/userdata`,
        serverSettings: `/sandbox/${serverHome}/userdata/settings.json`,
        userData:
          profile === "code"
            ? "/sandbox/.config/otter-code"
            : `/sandbox/${clientHome}/userdata/electron`,
        clientHome: `/sandbox/${clientHome}`,
        override: "/isolated",
        branding: { baseName: label, displayName: label },
        product: label,
        scheme,
        linuxEntry: `${appId}.desktop`,
        channel: profile === "code" ? "nightly" : `${profile}-nightly`,
        artwork:
          profile === "code"
            ? "assets/otter-dev/otter-dev-windows.ico"
            : `assets/${profile}/${profile}${profile === "mail" ? "-dev" : ""}-windows.ico`,
      });
    },
  );
});
