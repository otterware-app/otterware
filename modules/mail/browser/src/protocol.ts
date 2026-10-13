import type { ModuleToolCallerScope } from "@otterware/module-kit/engine";
import type { ChannelEvent } from "@otterware/otter-cloud-client";
import type { MailEvent } from "@otterware/mail-contracts/rpc";

/** What the Mail worker starts with. */
export type WorkerOptions = {
  /** The Otter Account the worker serves; none while this browser is signed out. */
  accountId?: string | undefined;
  /** Otter Cloud's origin, for Mail's TCP tunnel. */
  cloudOrigin?: string | undefined;
};

/** Environment worker → Mail worker. */
export type ToWorker =
  | { type: "start"; options: WorkerOptions }
  | { type: "call"; id: number; operation: string; input: unknown }
  | { type: "tool"; id: number; name: string; input: unknown; caller: ModuleToolCallerScope }
  | { type: "hostResult"; id: number; value?: unknown; error?: string }
  | { type: "cloudEvent"; event: ChannelEvent };

/** Mail worker → environment worker. */
export type FromWorker =
  | { type: "ready" }
  | { type: "fatal"; error: string }
  | { type: "result"; id: number; value?: unknown; error?: string }
  | { type: "event"; event: MailEvent }
  | { type: "host"; id: number; operation: string; args: unknown[] };
