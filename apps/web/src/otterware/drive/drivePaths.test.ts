import { describe, expect, it } from "vite-plus/test";

import { driveShellPath } from "./drivePaths";

describe("driveShellPath", () => {
  it("opens document links on the shell's Drive page", () => {
    expect(driveShellPath("https://drive.otterware.app/team/a/plan")).toBe("/drive/team/a/plan");
    expect(driveShellPath("https://drive.otterware.app/team/a/plan/v3?sheet=Q1")).toBe(
      "/drive/team/a/plan/v3?sheet=Q1",
    );
  });

  it("opens share links and folders, and refuses other sites", () => {
    expect(driveShellPath("https://drive.otterware.app/s/abc")).toBe("/drive/s/abc");
    expect(driveShellPath("https://drive.otterware.app/home?folder=f1")).toBe(
      "/drive/home?folder=f1",
    );
    expect(driveShellPath("https://example.com/team/a/plan")).toBeNull();
  });
});
