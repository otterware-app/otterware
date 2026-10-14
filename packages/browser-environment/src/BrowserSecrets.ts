/**
 * Credentials this browser keeps (Hermes and OpenClaw keys), sealed at rest
 * with AES-GCM under the platform's non-extractable key: the app can use it,
 * no script can read it out, so a copy of the site's files alone does not
 * give the credentials away. Values saved in plain text by earlier builds
 * still open, and are sealed the next time they are saved.
 *
 * @module BrowserSecrets
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { BrowserPlatform } from "./BrowserPlatform.ts";

const SEALED = "aes-gcm:";

const toBase64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export class BrowserSecrets extends Context.Service<
  BrowserSecrets,
  {
    readonly seal: (value: string) => Effect.Effect<string>;
    /** The stored value's text; empty when it cannot be opened (its key is gone). */
    readonly open: (stored: string) => Effect.Effect<string>;
  }
>()("@otterware/browser-environment/BrowserSecrets") {}

export const layer = Layer.effect(
  BrowserSecrets,
  Effect.gen(function* () {
    const platform = yield* BrowserPlatform;
    const key = yield* Effect.cached(Effect.promise(() => platform.secretKey()));
    return BrowserSecrets.of({
      seal: (value) =>
        value === ""
          ? Effect.succeed("")
          : Effect.flatMap(key, (cryptoKey) =>
              Effect.promise(async () => {
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const sealed = new Uint8Array(
                  await crypto.subtle.encrypt(
                    { name: "AES-GCM", iv },
                    cryptoKey,
                    new TextEncoder().encode(value),
                  ),
                );
                const out = new Uint8Array(iv.length + sealed.length);
                out.set(iv);
                out.set(sealed, iv.length);
                return SEALED + toBase64(out);
              }),
            ),
      open: (stored) =>
        !stored.startsWith(SEALED)
          ? Effect.succeed(stored)
          : Effect.flatMap(key, (cryptoKey) =>
              Effect.promise(async () => {
                const bytes = fromBase64(stored.slice(SEALED.length));
                try {
                  return new TextDecoder().decode(
                    await crypto.subtle.decrypt(
                      { name: "AES-GCM", iv: bytes.subarray(0, 12) },
                      cryptoKey,
                      bytes.subarray(12),
                    ),
                  );
                } catch {
                  return "";
                }
              }),
            ),
    });
  }),
);

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.addEventListener("success", () => resolve(req.result));
    req.addEventListener("error", () => reject(req.error));
  });

/** The browser's key: made once per origin, kept in IndexedDB, never extractable. */
export async function loadIndexedDbKey(): Promise<CryptoKey> {
  const open = indexedDB.open("otterware-browser-secrets", 1);
  open.addEventListener("upgradeneeded", () => open.result.createObjectStore("keys"));
  const db = await request(open);
  const stored = () =>
    request<CryptoKey | undefined>(db.transaction("keys").objectStore("keys").get("key"));
  try {
    const existing = await stored();
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    // `add`: should another context have just made one, theirs stays and is used.
    const added = await request(
      db.transaction("keys", "readwrite").objectStore("keys").add(key, "key"),
    )
      .then(() => true)
      .catch(() => false);
    return added ? key : ((await stored()) ?? key);
  } finally {
    db.close();
  }
}
