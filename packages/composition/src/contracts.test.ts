import { PROFILES } from "@otterware/profiles";
import { describe, expect, it } from "vite-plus/test";

import { composeContracts } from "./contracts.ts";

describe("composeContracts", () => {
  it("serves only the active profile's modules while the host RPCs stay", () => {
    const code = composeContracts(PROFILES.code);
    expect(code.moduleIds).toEqual([]);
    expect([...code.group.requests.keys()]).toContain("modules.list");
    expect([...code.group.requests.keys()].some((tag) => tag.startsWith("mail."))).toBe(false);

    expect(code.scopes["account.session.signIn"]).toBe("settings:write");
    expect(code.scopes["account.connections.list"]).toBe("orchestration:read");

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
});
