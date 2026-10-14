import { expect, it } from "vite-plus/test";
import { isPublicDriveRequest } from "./drive-browser.ts";
it("opens cookie-free Drive requests to remote web clients while provider and cookie paths keep origin checks", () => {
  for (const path of [
    "/v1/cloud/drive-token",
    "/api/v1/artifacts",
    "/api/v1/uploads/id/files/file",
  ]) {
    expect(
      isPublicDriveRequest(
        new Request(`https://cloud.otterware.app${path}`, { method: "OPTIONS" }),
      ),
    ).toBe(true);
    expect(
      isPublicDriveRequest(
        new Request(`https://cloud.otterware.app${path}`, { headers: { cookie: "session=test" } }),
      ),
    ).toBe(false);
  }
  for (const path of [
    "/v1/cloud/token",
    "/v1/cloud/connections",
    "/api/auth/sign-out",
    "/raw/a/id/version/index.html",
  ])
    expect(isPublicDriveRequest(new Request(`https://cloud.otterware.app${path}`))).toBe(false);
});
