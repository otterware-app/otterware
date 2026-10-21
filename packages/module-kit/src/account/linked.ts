// @effect-diagnostics globalDate:off cryptoRandomUUID:off -- Promise-based port; sync records carry wall-clock times and client mutation IDs.
import type { Connection, SyncedRecord } from "@otterware/otter-cloud-client";
import type { ConnectedAccount, DeviceProviders } from "./index.ts";

/** Synced account setting per linked Google account; its value is null once unlinked. */
const PREFIX = "linked-account:google:";

/** A Google account linked to the Otter Account, with this device's grant for it, if any. */
export interface LinkedAccount {
  readonly provider: "google";
  readonly email: string;
  /** Null until the account is authorized on this device. */
  readonly connection: Connection | null;
}

interface Link {
  readonly linked: boolean;
  readonly modifiedAt: number;
}

/**
 * The Google accounts linked to an Otter Account: one list on the account, the same on every
 * device. Tokens never join it; each device authorizes the accounts itself (`DeviceProviders`).
 *
 * A grant made on this device links its account. An account unlinked anywhere after this device
 * authorized it is forgotten here too, so the list stays the one source of truth.
 */
export function makeLinkedAccounts(account: ConnectedAccount, devices: DeviceProviders) {
  const links = new Map<string, Link>();
  let cursor = 0;
  let running: Promise<void> | null = null;
  let again = false;
  const accept = (records: ReadonlyArray<SyncedRecord>) => {
    for (const record of records) {
      if (record.collection !== "settings" || !record.id.startsWith(PREFIX)) continue;
      const email = record.id.slice(PREFIX.length);
      const known = links.get(email);
      if (known && known.modifiedAt > record.modifiedAt) continue;
      links.set(email, { linked: record.value !== null, modifiedAt: record.modifiedAt });
    }
  };
  const write = async (email: string, linked: boolean) => {
    const written = await account.push([
      {
        collection: "settings",
        id: `${PREFIX}${email}`,
        value: linked ? { email } : null,
        modifiedAt: Date.now(),
        mutationId: crypto.randomUUID(),
      },
    ]);
    accept(written.records);
  };
  const pass = async () => {
    for (let pages = 0; pages < 100; pages++) {
      const page = await account.pull(cursor);
      accept(page.records);
      cursor = page.cursor;
      if (!page.hasMore) break;
    }
    for (const grant of await devices.connections()) {
      const email = grant.email.toLowerCase();
      const link = links.get(email);
      if (link?.linked) continue;
      if (link && link.modifiedAt > grant.updatedAt) await devices.disconnect(grant.id);
      else await write(email, true);
    }
  };
  /** Pulls the list and links or forgets this device's grants; concurrent calls share a pass. */
  const sync = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = pass().finally(() => {
      running = null;
      if (again) {
        again = false;
        void sync().catch(() => {});
      }
    });
    return running;
  };
  return {
    sync,
    list: async (): Promise<ReadonlyArray<LinkedAccount>> => {
      await sync();
      const grants = new Map(
        (await devices.connections()).map((grant) => [grant.email.toLowerCase(), grant]),
      );
      return [...links]
        .filter(([, link]) => link.linked)
        .map(([email]) => ({
          provider: "google" as const,
          email,
          connection: grants.get(email) ?? null,
        }))
        .toSorted((a, b) => a.email.localeCompare(b.email));
    },
    /** Removes the account from the Otter Account and so from every device, this one first. */
    unlink: async (email: string) => {
      const key = email.toLowerCase();
      for (const grant of await devices.connections())
        if (grant.email.toLowerCase() === key) await devices.disconnect(grant.id);
      await write(key, false);
    },
  };
}
