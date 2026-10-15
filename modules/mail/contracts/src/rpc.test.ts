import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { MailEvent, MailOperations } from "./rpc.ts";

const send = Schema.decodeUnknownSync(MailOperations["gmail:sendMessage"].payloadSchema);
const signInImap = Schema.decodeUnknownSync(MailOperations["gmail:signInImap"].payloadSchema);
const event = Schema.decodeUnknownSync(MailEvent);

describe("Mail RPC boundary", () => {
  it("rejects malformed send and mailbox parameters before dispatch", () => {
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
      signInImap({
        accountId: "a",
      }),
    ).toThrow();
  });
  it("refuses arbitrary event channels and malformed event payloads", () => {
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
