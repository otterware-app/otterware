import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";
import { jsonReply } from "./MailModule.ts";

const encode = Schema.encodeUnknownSync(Schema.toCodecJson(Schema.Unknown));

it("answers engine values the RPC wire accepts, without undefined fields", () => {
  const labels = [{ id: "INBOX", name: "Inbox", unread: 3, color: undefined }];
  expect(() => encode(labels)).toThrow();
  expect(encode(jsonReply(labels))).toEqual([{ id: "INBOX", name: "Inbox", unread: 3 }]);
  expect(encode(jsonReply(undefined))).toBeNull();
});
