import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([
  ["code", false],
  ["mail", true],
  ["otterware", true],
] as const)("queues cold-start Mail links only when %s includes Mail", async (profile, accepts) => {
  vi.stubEnv("OTTERWARE_PROFILE", profile);
  vi.resetModules();
  const { receiveMailUrl } = await import("./index.ts");
  const { takePendingMailto } = await import("./mailto.ts");

  expect(receiveMailUrl("mailto:hello@example.com?subject=Hello")).toBe(accepts);
  expect(takePendingMailto()).toEqual(
    accepts ? { to: "hello@example.com", cc: "", subject: "Hello", body: "" } : null,
  );
  expect(takePendingMailto()).toBeNull();
  expect(receiveMailUrl("https://example.com")).toBe(false);
});
