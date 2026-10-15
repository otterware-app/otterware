import { describe, expect, it, vi } from "vite-plus/test";
import { notarizeWithStapleRetry } from "./notarize-desktop.ts";

const acceptedFailure = () =>
  new Error("Failed to staple your application with code: 68\nCloudKit network error");
const stapleFailure = (code: number) => Object.assign(new Error("stapler failed"), { code });

describe("notarization staple recovery", () => {
  it("waits for the ticket and recovers without resubmitting", async () => {
    const operations = {
      notarize: vi.fn().mockRejectedValue(acceptedFailure()),
      staple: vi.fn().mockRejectedValueOnce(stapleFailure(68)).mockResolvedValue(undefined),
      wait: vi.fn().mockResolvedValue(undefined),
    };
    await notarizeWithStapleRetry(operations);
    expect(operations.notarize).toHaveBeenCalledTimes(1);
    expect(operations.staple).toHaveBeenCalledTimes(2);
    expect(operations.wait.mock.calls.map(([delay]) => delay)).toEqual([15_000, 30_000]);
  });

  it("does not staple again after normal success", async () => {
    const operations = {
      notarize: vi.fn().mockResolvedValue(undefined),
      staple: vi.fn(),
      wait: vi.fn(),
    };
    await notarizeWithStapleRetry(operations);
    expect(operations.staple).not.toHaveBeenCalled();
    expect(operations.wait).not.toHaveBeenCalled();
  });

  it.each([
    new Error("notarytool rejected the app"),
    new Error("Failed to staple your application with code: 65"),
  ])("preserves permanent failures", async (error) => {
    const operations = {
      notarize: vi.fn().mockRejectedValue(error),
      staple: vi.fn(),
      wait: vi.fn(),
    };
    await expect(notarizeWithStapleRetry(operations)).rejects.toBe(error);
    expect(operations.staple).not.toHaveBeenCalled();
  });

  it.each([65, 68])(
    "fails after permanent staple errors or bounded network retries (%s)",
    async (code) => {
      const error = stapleFailure(code);
      const operations = {
        notarize: vi.fn().mockRejectedValue(acceptedFailure()),
        staple: vi.fn().mockRejectedValue(error),
        wait: vi.fn().mockResolvedValue(undefined),
      };
      await expect(notarizeWithStapleRetry(operations)).rejects.toBe(error);
      expect(operations.staple).toHaveBeenCalledTimes(code === 68 ? 4 : 1);
      expect(operations.notarize).toHaveBeenCalledTimes(1);
    },
  );
});
