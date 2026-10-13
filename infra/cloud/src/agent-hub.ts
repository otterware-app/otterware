import { AgentHub } from "../mail/src/agent-hub.ts";
import type { Env } from "./env.ts";

/** Separate namespace and key; existing Mail chats and sealed keys are left in AgentHub. */
export class CloudAgentHub extends AgentHub {
  constructor(ctx: DurableObjectState, env: Env) {
    // The imported runner only uses the sealing secret. No Mail auth is involved.
    super(ctx, { BETTER_AUTH_SECRET: env.CLOUD_SECRET } as ConstructorParameters<
      typeof AgentHub
    >[1]);
  }
}
