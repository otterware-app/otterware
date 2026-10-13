import { PROFILES } from "@otterware/profiles";
import { describe, expect, it } from "vite-plus/test";

import {
  composeContracts,
  OTTERWARE_RPC_AGGREGATES,
  OTTERWARE_RPC_SUPERSET_SCOPES,
} from "./contracts.ts";

describe("composeContracts", () => {
  it("serves only the active profile's modules while the host RPCs stay", () => {
    const code = composeContracts(PROFILES.code);
    expect(code.moduleIds).toEqual([]);
    expect([...code.group.requests.keys()]).toEqual([
      "modules.list",
      "modules.setEnabled",
      "assistant.ensureProject",
    ]);

    const calendar = composeContracts(PROFILES.calendar);
    expect(calendar.moduleIds).toEqual(["calendar"]);
    expect([...calendar.group.requests.keys()]).toContain("calendar.subscribeWeek");
    expect([...calendar.group.requests.keys()]).not.toContain("home.overview");

    const mail = composeContracts(PROFILES.mail);
    expect(mail.moduleIds).toEqual(["mail"]);
    expect([...mail.group.requests.keys()]).toContain("mail.gmail.listAccounts");
    expect([...mail.group.requests.keys()]).not.toContain("calendar.subscribeWeek");
    expect(mail.scopes["mail.gmail.sendMessage"]).toBe("orchestration:operate");

    const drive = composeContracts(PROFILES.drive);
    expect(drive.moduleIds).toEqual(["drive"]);
    expect([...drive.group.requests.keys()]).toContain("drive.uploadFile");
    expect([...drive.group.requests.keys()]).not.toContain("calendar.subscribeWeek");

    const otterware = composeContracts(PROFILES.otterware);
    expect(otterware.moduleIds).toEqual(["home", "mail", "calendar", "drive"]);
    expect([...otterware.group.requests.keys()]).toContain("home.overview");
    expect(otterware.scopes["home.overview"]).toBe("orchestration:read");
  });

  it("labels every known method for instrumentation and authorization", () => {
    for (const tag of Object.keys(OTTERWARE_RPC_SUPERSET_SCOPES)) {
      expect(OTTERWARE_RPC_AGGREGATES[tag as keyof typeof OTTERWARE_RPC_AGGREGATES]).toBe(
        tag.startsWith("home.")
          ? "module.home"
          : tag.startsWith("calendar.")
            ? "module.calendar"
            : tag.startsWith("mail.")
              ? "module.mail"
              : tag.startsWith("drive.")
                ? "module.drive"
                : "host",
      );
    }
  });
});
