import { describe, expect, it } from "vite-plus/test";
import { expectedPushVersion } from "../src/artifacts";

const report = { title: "Report", versionCount: 4 };

describe("push version guard", () => {
  it("refuses to publish over an existing version without a base version", () => {
    expect(() => expectedPushVersion({}, report)).toThrow(
      "Report is at v4. Pass --if-version 4 if your files are based on it, or --force",
    );
  });

  it("sends the base version, so Drive rejects a push over someone else's newer version", () => {
    expect(expectedPushVersion({ ifVersion: "3" }, report)).toBe(3);
  });

  it("publishes over whatever is current only with --force", () => {
    expect(expectedPushVersion({ force: true }, report)).toBeUndefined();
  });

  it("publishes the first version of a document that has none", () => {
    expect(expectedPushVersion({}, { title: "Draft", versionCount: 0 })).toBe(0);
  });

  it("rejects conflicting or invalid options", () => {
    expect(() => expectedPushVersion({ ifVersion: "3", force: true }, report)).toThrow("not both");
    expect(() => expectedPushVersion({ ifVersion: "latest" }, report)).toThrow(
      "must be a version number",
    );
  });
});
