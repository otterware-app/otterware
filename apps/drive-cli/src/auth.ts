import * as NodeTimersPromises from "node:timers/promises";
const { setTimeout: delay } = NodeTimersPromises;

import { DRIVE_CLOUD_ORIGIN } from "@otterware/drive-contracts/constants";
import type { Command } from "commander";
import open from "open";
import pc from "picocolors";
import { pollDeviceLogin, revokeGrant, startDeviceLogin } from "./account";
import { ApiClient } from "./client";
import { clearCredentials, configPath, getProfile, updateProfile } from "./config";
import type { GlobalOptions } from "./output";
import { note, printJson, success } from "./output";

interface LoginOptions {
  apiKey?: string;
  noOpen?: boolean;
  url?: string;
}

function globalOptions(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>();
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authenticate this machine");

  auth
    .command("login")
    .description("Log in using a browser or an API key")
    .option("--api-key <key>", "Use an existing agent API key")
    .option("--url <url>", "Otter Drive application URL")
    .option("--no-open", "Do not open the browser automatically")
    .action(async (options: LoginOptions, command: Command) => {
      const globals = globalOptions(command);
      const { name, profile: storedProfile } = await getProfile(globals.profile);
      const profile = {
        ...storedProfile,
        apiUrl: options.url ?? storedProfile.apiUrl,
      };

      if (options.apiKey) {
        const client = new ApiClient({ ...profile, apiKey: options.apiKey });
        const me = await client.get<unknown>("/api/v1/me");
        await updateProfile(name, {
          apiUrl: profile.apiUrl,
          apiKey: options.apiKey,
          accessToken: undefined,
        });
        if (globals.json) printJson(me);
        else success(`Authenticated profile ${pc.bold(name)} with an API key.`);
        return;
      }

      // This machine's own Otter Account grant; Drive requests go to Otter Cloud with it.
      const code = await startDeviceLogin();
      process.stdout.write(`\nEnter ${pc.bold(pc.cyan(code.userCode))} at:\n`);
      process.stdout.write(`${code.verificationUrl}\n\n`);
      if (options.noOpen !== true) await open(code.verificationUrl);

      const expiresAt = Date.now() + code.expiresIn * 1_000;
      let interval = code.interval * 1_000;
      while (Date.now() < expiresAt) {
        await delay(interval);
        const grant = await pollDeviceLogin(code.deviceCode);
        if (grant === "slow_down") {
          interval += 5_000;
          continue;
        }
        if (!grant) continue;
        await updateProfile(name, {
          apiUrl: options.url ?? DRIVE_CLOUD_ORIGIN,
          accountGrant: grant,
          accessToken: undefined,
          apiKey: undefined,
        });
        if (globals.json) printJson({ success: true, profile: name });
        else success(`Authenticated profile ${pc.bold(name)}.`);
        return;
      }
      throw new Error("The login code expired before it was approved.");
    });

  auth
    .command("status")
    .description("Show the current authenticated identity")
    .action(async (_options: unknown, command: Command) => {
      const globals = globalOptions(command);
      const { name, profile } = await getProfile(globals.profile);
      if (!profile.accessToken && !profile.apiKey && !profile.accountGrant) {
        const status = {
          authenticated: false,
          profile: name,
          apiUrl: profile.apiUrl,
        };
        if (globals.json) printJson(status);
        else note(`Profile ${pc.bold(name)} is not authenticated.`);
        return;
      }
      const me = await new ApiClient(profile).get<unknown>("/api/v1/me");
      if (globals.json) printJson({ profile: name, ...asRecord(me) });
      else {
        success(`Profile ${pc.bold(name)} is authenticated.`);
        printJson(me);
      }
    });

  auth
    .command("logout")
    .description("Sign this machine out and remove its credentials")
    .action(async (_options: unknown, command: Command) => {
      const globals = globalOptions(command);
      const { name, profile } = await getProfile(globals.profile);
      // Ends this machine's sign-in at Otter Accounts too; other devices stay signed in.
      if (profile.accountGrant) await revokeGrant(profile.accountGrant);
      await clearCredentials(name);
      if (globals.json) printJson({ success: true, profile: name });
      else success(`Removed credentials for profile ${pc.bold(name)}.`);
    });

  auth
    .command("config-path")
    .description("Print where credentials are stored")
    .action(async () => {
      note(configPath());
    });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : { value };
}
