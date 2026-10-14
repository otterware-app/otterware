import { useEffect } from "react";
import { useAtomValue } from "@effect/atom-react";
import { EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useAtomCommand } from "~/state/use-atom-command";
import { serverEnvironment, primaryServerKeybindingsAtom } from "~/state/server";
import type { MailWebHost } from "./content/host/bridge";
import { storageFor } from "./content/host/storage";
import { migratedMailKeybindings } from "./keybindingMigration";

const LegacyFile = Schema.Struct({
  rules: Schema.NullOr(
    Schema.Array(
      Schema.Struct({
        key: Schema.String,
        command: Schema.String,
        when: Schema.optional(Schema.String),
      }),
    ),
  ),
});
const decodeLegacyFile = Schema.decodeUnknownSync(LegacyFile);
export function MailKeybindingMigration({ host }: { host: MailWebHost }) {
  const upsert = useAtomCommand(serverEnvironment.upsertKeybinding, { reportFailure: false });
  const existing = useAtomValue(primaryServerKeybindingsAtom);
  useEffect(() => {
    if (host.environmentId.startsWith("browser:") || host.canWrite?.() === false) return;
    const storage = storageFor(host.environmentId);
    if (storage.getItem("host-keybindings-migrated") === "1") return;
    let cancelled = false;
    void (async () => {
      const file = decodeLegacyFile(await host.invoke("keybindings:read"));
      const rules = migratedMailKeybindings(
        file.rules ?? [],
        new Set(existing.map((rule) => rule.command)),
      );
      for (const input of rules) {
        if (cancelled) return;
        const result = await upsert({
          environmentId: EnvironmentId.make(host.environmentId),
          input,
        });
        if (result._tag !== "Success") return;
      }
      if (!cancelled) storage.setItem("host-keybindings-migrated", "1");
    })().catch((error) => console.warn("Mail shortcut migration will retry", error));
    return () => {
      cancelled = true;
    };
  }, [host, upsert, existing]);
  return null;
}
