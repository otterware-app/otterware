import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { MailContract, MailEvent, MailOperations } from "./rpc.ts";

describe("Mail RPC boundary", () => {
  it("rejects malformed send and mailbox parameters before dispatch", () => {
    const send = Schema.decodeUnknownSync(MailOperations["gmail:sendMessage"].payloadSchema);
    expect(() => send({ accountId: "a", to: 123, subject: "test", body: "text" })).toThrow();
    expect(() =>
      send({
        accountId: "a",
        to: "b",
        subject: "test",
        body: "text",
        attachments: [{ name: "file" }],
      }),
    ).toThrow();
    expect(send({ accountId: "a", to: "b", subject: "test", body: "text" }).to).toBe("b");
    expect(() =>
      Schema.decodeUnknownSync(MailOperations["gmail:signInImap"].payloadSchema)({
        accountId: "a",
      }),
    ).toThrow();
  });
  it("authorizes each named method and refuses arbitrary event channels", () => {
    expect(Object.keys(MailContract.scopes)).toHaveLength(106);
    expect(Object.keys(MailContract.scopes).some((name) => /invoke/.test(name))).toBe(false);
    const event = Schema.decodeUnknownSync(MailEvent);
    expect(() => event({ channel: "agent:send", params: {} })).toThrow();
    expect(() =>
      event({ channel: "gmail:send-failed", params: { subject: "Hi", savedToDrafts: "yes" } }),
    ).toThrow();
    expect(
      event({ channel: "gmail:send-failed", params: { subject: "Hi", savedToDrafts: true } })
        .channel,
    ).toBe("gmail:send-failed");
  });
});
