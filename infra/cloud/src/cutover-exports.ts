import { MailIdentity as AccountsIdentity } from "../accounts/src/worker.ts";
import { IdentityLifecycle as MailLifecycle } from "../mail/src/worker.ts";
import { UserHub as MailUserHub } from "../mail/src/user-hub.ts";
import { AgentHub as MailAgentHub } from "../mail/src/agent-hub.ts";
import { accountsEnv, mailEnv } from "./legacy.ts";
import type { Env } from "./env.ts";

// These keep the public RPC/class names for cutover. The parallel config does not transfer them.
export class MailIdentity extends AccountsIdentity {
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, accountsEnv(env));
  }
}
export class IdentityLifecycle extends MailLifecycle {
  private readonly cloud: Env;
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, mailEnv(env));
    this.cloud = env;
  }
  override async disconnect(userId: string, sessionId?: string) {
    await super.disconnect(userId, sessionId);
    await this.cloud.ENVIRONMENT_HUB.get(this.cloud.ENVIRONMENT_HUB.idFromName(userId)).disconnect(
      sessionId,
    );
    await this.cloud.CLOUD_AGENT_HUB.get(this.cloud.CLOUD_AGENT_HUB.idFromName(userId)).disconnect(
      sessionId,
    );
  }
  override async deleteUser(userId: string) {
    await this.disconnect(userId);
    await super.deleteUser(userId);
    await this.cloud.ACCOUNT_DATA.batch([
      this.cloud.ACCOUNT_DATA.prepare("DELETE FROM provider_connection WHERE user_id=?").bind(
        userId,
      ),
      this.cloud.ACCOUNT_DATA.prepare("DELETE FROM provider_oauth_state WHERE user_id=?").bind(
        userId,
      ),
      this.cloud.ACCOUNT_DATA.prepare("DELETE FROM sync_record WHERE user_id=?").bind(userId),
    ]);
    await this.cloud.CLOUD_AGENT_HUB.get(
      this.cloud.CLOUD_AGENT_HUB.idFromName(userId),
    ).deleteUser();
  }
}
export class UserHub extends MailUserHub {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, mailEnv(env));
  }
}
export class AgentHub extends MailAgentHub {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, mailEnv(env));
  }
}
