import { describe, expect, it } from "vite-plus/test";

import { parsePlace, readSearch, resolvePath } from "./router";

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

describe("resolvePath", () => {
  const location = { pathname: "/team/a/plan", search: "?folder=f1&sheet=Q1" };

  it("fills a route template's params", () => {
    expect(
      resolvePath(
        {
          to: "/$folderSlug/a/$slug/$version",
          params: { folderSlug: "my team", slug: "x", version: "v2" },
        },
        location,
      ),
    ).toBe("/my%20team/a/x/v2");
  });

  it("derives the query from the current one, dropping cleared keys", () => {
    expect(
      resolvePath(
        { to: "/home", search: (current) => ({ ...current, sheet: undefined }) },
        location,
      ),
    ).toBe("/home?folder=f1");
    expect(resolvePath({ to: ".", search: { view: "shared" } }, location)).toBe(
      "/team/a/plan?view=shared",
    );
    expect(readSearch("?q=a%20b&view=recent")).toEqual({ q: "a b", view: "recent" });
  });
});
