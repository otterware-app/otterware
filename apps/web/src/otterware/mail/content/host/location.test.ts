import { describe, expect, it } from "vite-plus/test";
import { mailLocationPath, parseMailLocation } from "./location";

describe("host Mail locations", () => {
  it.each([
    {
      mailbox: "a+work@example.com",
      label: "folder/with spaces",
      messageId: "id/42",
      account: "a+work@example.com",
      focusId: "message/1",
    },
    {
      mailbox: "__combined__",
      label: "__inbox__",
      messageId: "thread42",
      account: "work@example.com",
      focusId: null,
    },
    {
      mailbox: "__projects__",
      label: "contract/42",
      messageId: "thread42",
      account: "work@example.com",
      focusId: null,
    },
    { mailbox: "v_custom", label: "all", messageId: null, account: null, focusId: null },
  ])("round trips a selected message and its owning account", (location) => {
    const restored = parseMailLocation(mailLocationPath(location));
    expect(restored).toEqual({
      ...location,
      account: location.account === location.mailbox ? null : location.account,
    });
  });
  it("rejects malformed paths and does not consume host settings", () => {
    expect(parseMailLocation("/%broken/INBOX")).toBeNull();
    expect(parseMailLocation("/settings/reading")).toBeNull();
    expect(parseMailLocation("/")).toBeNull();
  });
});
