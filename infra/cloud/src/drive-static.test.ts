import { describe, expect, it } from "vite-plus/test";
import { driveStaticRequest, driveStaticRedirect } from "./drive-static.ts";
describe("Drive static profile", () => {
  it("serves the standalone shell and version/share links", () => {
    for (const path of [
      "/drive",
      "/drive/d/document",
      "/account/callback",
      "/folder/a/document",
      "/folder/a/document/v2",
      "/s/share",
      "/home",
      "/settings",
      "/settings/account",
      "/settings/drive/sharing",
    ])
      expect(
        new URL(driveStaticRequest(new Request(`https://cloud.otterware.app${path}`))!.url)
          .pathname,
      ).toBe("/drive/index.html");
    const asset = new Request("https://cloud.otterware.app/drive/assets/editor.js");
    expect(driveStaticRequest(asset)).toBe(asset);
  });
  it("keeps API misses, mutations and uploaded content outside the SPA", () => {
    for (const path of [
      "/api/v1/missing",
      "/api/auth/missing",
      "/v1/cloud/missing",
      "/raw/a/id/version/index.html",
      "/unknown",
    ])
      expect(driveStaticRequest(new Request(`https://cloud.otterware.app${path}`))).toBeNull();
    expect(
      driveStaticRequest(new Request("https://cloud.otterware.app/drive", { method: "POST" })),
    ).toBeNull();
  });
});

it("keeps legacy document, version and folder links on the host Drive route", () => {
  for (const path of ["/home?folder=team", "/team/a/plan/v2", "/s/shared"]) {
    const response = driveStaticRedirect(new Request(`https://drive.otterware.app${path}`));
    expect(response?.headers.get("location")).toBe(`https://drive.otterware.app/drive${path}`);
  }
  expect(driveStaticRedirect(new Request("https://drive.otterware.app/drive/home"))).toBeNull();
  expect(
    new URL(driveStaticRequest(new Request("https://drive.otterware.app/favicon.svg"))!.url)
      .pathname,
  ).toBe("/drive/favicon.svg");
});
