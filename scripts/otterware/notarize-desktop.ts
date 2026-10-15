// @effect-diagnostics nodeBuiltinImport:off -- Async electron-builder hook runs outside the Effect runtime.
// @effect-diagnostics globalConsole:off -- electron-builder provides no Effect logger runtime.
import { notarize } from "@electron/notarize";
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";
import * as NodeUtil from "node:util";

const run = NodeUtil.promisify(NodeChildProcess.execFile);
const stapleRetryDelays = [15_000, 30_000, 60_000, 120_000];

/** @electron/notarize throws this only after the submission has been accepted. */
const isAcceptedStapleNetworkFailure = (error: unknown) =>
  error instanceof Error &&
  /^Failed to staple your application with code: 68(?:\s|$)/.test(error.message);

/** Retry only the ticket attachment, never another submission or a permanent failure. */
export async function notarizeWithStapleRetry(operations: {
  notarize: () => Promise<void>;
  staple: () => Promise<void>;
  wait: (milliseconds: number) => Promise<unknown>;
}) {
  try {
    await operations.notarize();
    return;
  } catch (error) {
    if (!isAcceptedStapleNetworkFailure(error)) throw error;
  }
  for (const [index, delay] of stapleRetryDelays.entries()) {
    console.info(
      `[notarize] Apple accepted the app; retrying staple after code 68 (${index + 1}/${stapleRetryDelays.length}) in ${delay / 1000}s.`,
    );
    await operations.wait(delay);
    try {
      await operations.staple();
      return;
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === 68) ||
        index === stapleRetryDelays.length - 1
      )
        throw error;
    }
  }
}

/** Called after signing and before electron-builder creates the downloadable artifacts. */
export default async function notarizeDesktop(context: {
  electronPlatformName: string;
  appOutDir: string;
  packager: { appInfo: { productFilename: string } };
}) {
  if (context.electronPlatformName !== "darwin") return;
  const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env;
  if (!APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER)
    throw new Error("Notarization requires APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER");
  const appPath = NodePath.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  await notarizeWithStapleRetry({
    notarize: () =>
      notarize({
        appPath,
        appleApiKey: APPLE_API_KEY,
        appleApiKeyId: APPLE_API_KEY_ID,
        appleApiIssuer: APPLE_API_ISSUER,
      }),
    staple: async () => {
      await run("xcrun", ["stapler", "staple", "-v", NodePath.basename(appPath)], {
        cwd: NodePath.dirname(appPath),
        timeout: 60_000,
      });
    },
    wait: NodeTimersPromises.setTimeout,
  });
}
