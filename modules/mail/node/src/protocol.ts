import type { ModuleToolCallerScope } from "@otterware/module-kit/engine";
import type { ChannelEvent } from "@otterware/otter-cloud-client";
import type { MailEvent } from "@otterware/mail-contracts/rpc";
export type WorkerOptions = {
  stateDir: string;
  profile: string;
  legacyHome?: string | undefined;
  accountId?: string | undefined;
  gmailPushTopic?: string | undefined;
  googleClientId?: string | undefined;
  googleClientSecret?: string | undefined;
};
export type ToWorker =
  | { type: "call"; id: number; operation: string; input: unknown }
  | { type: "tool"; id: number; name: string; input: unknown; caller: ModuleToolCallerScope }
  | { type: "hostResult"; id: number; value?: unknown; error?: string }
  | { type: "cloudEvent"; event: ChannelEvent };
export type FromWorker =
  | { type: "ready" }
  | { type: "fatal"; error: string }
  | { type: "result"; id: number; value?: unknown; error?: string }
  | { type: "event"; event: MailEvent }
  | { type: "host"; id: number; operation: string; args: unknown[] };
