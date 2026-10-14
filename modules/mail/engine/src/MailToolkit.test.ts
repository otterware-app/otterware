import { expect, it } from "vite-plus/test";
import { agentTools, runAgentTool, type ToolCaller } from "./services/agent/tools/index.ts";
import { MailToolkit } from "./MailToolkit.ts";
import { toolTier } from "@otterware/module-kit/contracts";

const caller = (access: "read-only" | "safe" | "full-access"): ToolCaller => ({
  access: () => access,
  mode: () => "full-access",
  turn: () => null,
});
it("keeps read, reversible and external effects separate for every agent transport", async () => {
  expect(toolTier(MailToolkit.tools.mail_list_accounts!)).toBe("read-only");
  expect(toolTier(MailToolkit.tools.mail_save_draft!)).toBe("safe");
  expect(toolTier(MailToolkit.tools.mail_send_email!)).toBe("full");
  expect(agentTools(caller("read-only")).some((t) => t.name === "save_draft")).toBe(false);
  expect(agentTools(caller("safe")).some((t) => t.name === "save_draft")).toBe(true);
  // Refusal happens before provider access, even when a caller bypasses tools/list.
  expect((await runAgentTool(caller("safe"), "send_email", {})).isError).toBe(true);
  expect((await runAgentTool(caller("read-only"), "save_draft", {})).isError).toBe(true);
});
