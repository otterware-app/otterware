import * as NodeCrypto from "node:crypto";
import { expect, it, vi } from "vite-plus/test";
import { localGoogleAuth } from "./googleAuth.ts";

vi.mock("@otterware/mail-engine", async (original) => {
  const engine = await original<typeof import("@otterware/mail-engine")>();
  return { ...engine, accountStore: { addAccount: async () => {} } };
});

it("validates OAuth state and exchanges a PKCE grant through the local-only fallback", async () => {
  const realFetch = globalThis.fetch;
  const set = vi.fn(async () => {});
  let challenge = "";
  const fakeFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/token")) {
      const body = init?.body as URLSearchParams;
      expect(body.get("code")).toBe("code");
      expect(
        NodeCrypto.createHash("sha256").update(body.get("code_verifier")!).digest("base64url"),
      ).toBe(challenge);
      return Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 3600 });
    }
    return Response.json({ email: "local@example.test", name: "Local" });
  });
  const auth = localGoogleAuth({
    clientId: "test-client",
    secrets: { get: async () => null, set, delete: async () => {} },
    authorize: async (value) => {
      const request = new URL(value);
      challenge = request.searchParams.get("code_challenge")!;
      expect(request.searchParams.get("code_challenge_method")).toBe("S256");
      const callback = new URL(request.searchParams.get("redirect_uri")!);
      callback.searchParams.set("code", "code");
      callback.searchParams.set("state", "invalid");
      expect((await realFetch(callback)).status).toBe(400);
      callback.searchParams.set("state", request.searchParams.get("state")!);
      expect((await realFetch(callback)).status).toBe(200);
    },
  });
  try {
    await auth.load();
    expect((await auth.addAccount()).id).toBe("local@example.test");
    expect(await auth.getAccessToken("local@example.test")).toBe("access");
    expect(set).toHaveBeenCalledWith("google-tokens", expect.stringContaining("refresh"));
    await auth.removeTokens("local@example.test");
    expect(auth.isSignedIn("local@example.test")).toBe(false);
  } finally {
    fakeFetch.mockRestore();
  }
});

it("settles cancellation during the host consent handoff", async () => {
  const auth = localGoogleAuth({
    clientId: "test-client",
    secrets: { get: async () => null, set: async () => {}, delete: async () => {} },
    authorize: async () => {
      auth.cancelSignIn();
    },
  });
  await expect(auth.addAccount()).rejects.toThrow();
});
