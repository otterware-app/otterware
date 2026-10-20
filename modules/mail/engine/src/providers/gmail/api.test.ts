import { describe, expect, it } from "vite-plus/test";
import { errorKind, GmailApiError } from "./api";

describe("Gmail reauthentication status", () => {
  it("distinguishes refused access from quota exhaustion and an offline connection", () => {
    expect(errorKind(new GmailApiError(401, "Unauthorized", "expired"))).toBe("auth");
    expect(errorKind(new GmailApiError(403, "Forbidden", "insufficientPermissions"))).toBe("auth");
    expect(errorKind(new GmailApiError(403, "Forbidden", "userRateLimitExceeded"))).toBe(
      "rateLimit",
    );
    expect(errorKind(new GmailApiError(429, "Too Many Requests", "limited"))).toBe("rateLimit");
    expect(errorKind(new Error("fetch failed"))).toBe("network");
  });
});
