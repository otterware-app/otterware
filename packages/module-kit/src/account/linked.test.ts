// @effect-diagnostics globalDate:off cryptoRandomUUID:off -- Fixture models synced records.
import type { Connection, SyncRecord, SyncedRecord } from "@otterware/otter-cloud-client";
import { describe, expect, it } from "vite-plus/test";
import type { ConnectedAccount, DeviceProviders } from "./index.ts";
import { makeLinkedAccounts } from "./linked.ts";

/** The account's synced settings, shared by every device, with last-writer-wins records. */
const cloud = () => {
  const records: SyncedRecord[] = [];
  const write = (record: SyncRecord) => {
    const at = records.findIndex(
      (each) => each.collection === record.collection && each.id === record.id,
    );
    if (at >= 0 && records[at]!.modifiedAt > record.modifiedAt) return records[at]!;
    if (at >= 0) records.splice(at, 1);
    const saved = { ...record, revision: (records.at(-1)?.revision ?? 0) + 1 };
    records.push(saved);
    return saved;
  };
  const account = {
    push: async (pushed: readonly SyncRecord[]) => ({ records: pushed.map(write) }),
    pull: async (cursor = 0) => {
      const page = records.filter((record) => record.revision > cursor);
      return { records: page, cursor: page.at(-1)?.revision ?? cursor, hasMore: false };
    },
  } as unknown as ConnectedAccount;
  return { account, write };
};
const device = (...emails: string[]) => {
  const grants = new Map<string, Connection>(
    emails.map((email) => [
      `device:google:${email}`,
      { id: `device:google:${email}`, provider: "google", email, scopes: [], updatedAt: 1_000 },
    ]),
  );
  const devices = {
    connections: async () => [...grants.values()],
    disconnect: async (id: string) => {
      grants.delete(id);
    },
  } as unknown as DeviceProviders;
  return { devices, grants };
};
const link = (email: string, linked: boolean, modifiedAt: number): SyncRecord => ({
  collection: "settings",
  id: `linked-account:google:${email}`,
  value: linked ? { email } : null,
  modifiedAt,
  mutationId: crypto.randomUUID(),
});

describe("linked Google accounts", () => {
  it("links this device's grants and lists accounts other devices linked", async () => {
    const { account, write } = cloud();
    write(link("work@example.test", true, 500));
    const mac = device("me@example.test");
    const links = makeLinkedAccounts(account, mac.devices);
    expect(await links.list()).toEqual([
      expect.objectContaining({ email: "me@example.test", connection: expect.any(Object) }),
      { provider: "google", email: "work@example.test", connection: null },
    ]);
    // A second device sees the account the first one linked, ready to authorize.
    const laptop = makeLinkedAccounts(account, device().devices);
    expect((await laptop.list()).map((each) => [each.email, each.connection])).toEqual([
      ["me@example.test", null],
      ["work@example.test", null],
    ]);
  });
  it("forgets a grant here once its account is unlinked on another device", async () => {
    const { account, write } = cloud();
    const mac = device("me@example.test");
    const links = makeLinkedAccounts(account, mac.devices);
    await links.sync();
    write(link("me@example.test", false, Date.UTC(2100, 0, 1)));
    expect(await links.list()).toEqual([]);
    expect(mac.grants.size).toBe(0);
  });
  it("relinks an account authorized again after it was unlinked", async () => {
    const { account, write } = cloud();
    write(link("me@example.test", false, 500));
    const links = makeLinkedAccounts(account, device("me@example.test").devices);
    expect((await links.list()).map((each) => each.email)).toEqual(["me@example.test"]);
  });
  it("unlinks an account from the Otter Account and this device", async () => {
    const { account } = cloud();
    const mac = device("me@example.test");
    const links = makeLinkedAccounts(account, mac.devices);
    await links.sync();
    await links.unlink("Me@Example.test");
    expect(mac.grants.size).toBe(0);
    expect(await makeLinkedAccounts(account, device().devices).list()).toEqual([]);
  });
});
