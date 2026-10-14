import { describe, expect, it } from "vite-plus/test";

import { driveShellPath, parsePlace, withDriveSearch } from "./drivePaths";

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

describe("parsePlace", () => {
  it("names Drive's routes from a path below its root", () => {
    expect(parsePlace("/")).toEqual({ kind: "home" });
    expect(parsePlace("/home")).toEqual({ kind: "home" });
    expect(parsePlace("/settings")).toEqual({ kind: "settings", pane: "folder" });
    expect(parsePlace("/settings/members")).toEqual({ kind: "settings", pane: "members" });
    expect(parsePlace("/s/tok%20en")).toEqual({ kind: "shared-link", token: "tok en" });
    expect(parsePlace("/team/a/plan")).toEqual({
      kind: "document",
      folderSlug: "team",
      slug: "plan",
    });
    expect(parsePlace("/team/a/plan/v3")).toEqual({
      kind: "document",
      folderSlug: "team",
      slug: "plan",
      version: 3,
    });
  });

  it("ignores a version that is not a positive number", () => {
    expect(parsePlace("/team/a/plan/latest")).toEqual({
      kind: "document",
      folderSlug: "team",
      slug: "plan",
    });
    expect(parsePlace("/team/a/plan/v0")).toEqual({
      kind: "document",
      folderSlug: "team",
      slug: "plan",
    });
  });
});

// Project-scoped documents must retain their location when changing a sheet or version.
it("keeps the project path and safely encodes Drive filters for host navigation", () => {
  expect(
    withDriveSearch("/home/projects/p1/drive/team/a/plan/v2", {
      sheet: "Q1 & Q2",
      q: undefined,
      folder: "",
    }),
  ).toBe("/home/projects/p1/drive/team/a/plan/v2?sheet=Q1+%26+Q2");
  expect(withDriveSearch("/drive/home", { q: undefined })).toBe("/drive/home");
});
