import { compileResolvedKeybindingsConfig } from "@t3tools/shared/keybindings";
import { describe, expect, it } from "vite-plus/test";

import {
  applyKeybindingCommandAliases,
  appWhenContext,
  keybindingCommandApp,
  mergeShellKeybindings,
  shellDefaultKeybindings,
} from "./keybindings.ts";

const mail = {
  id: "mail",
  commands: [
    { id: "mail.archive", title: "Archive", searchTerms: [], defaultKey: "e" },
    { id: "mail.compose", title: "Compose", searchTerms: [], defaultKey: "c", when: "!editing" },
    { id: "mail.open", title: "Open", searchTerms: [] },
  ],
} as const;

describe("shell keybindings", () => {
  it("scopes module defaults to their app and adds app switching only when combined", () => {
    const combined = shellDefaultKeybindings({ kind: "combined", modules: [mail] });
    expect(combined.map((rule) => rule.command)).toEqual([
      "app.switch.1",
      "app.switch.2",
      "app.switch.3",
      "app.switch.4",
      "assistant.toggle",
      "assistant.newChat",
      "assistant.previousChat",
      "mail.archive",
      "mail.compose",
    ]);
    expect(combined.find((rule) => rule.command === "mail.archive")?.when).toBe("app.mail");
    expect(combined.find((rule) => rule.command === "mail.compose")?.when).toBe(
      "app.mail && (!editing)",
    );
    const standalone = shellDefaultKeybindings({ kind: "standalone", modules: [mail] });
    expect(standalone.some((rule) => rule.command.startsWith("app.switch"))).toBe(false);
    expect(shellDefaultKeybindings({ kind: "code", modules: [] })).toEqual([]);
  });

  it("lets a custom rule replace a shell default for the same command", () => {
    const custom = compileResolvedKeybindingsConfig([
      { key: "mod+shift+e", command: "mail.archive" },
    ]);
    const merged = mergeShellKeybindings(
      custom,
      shellDefaultKeybindings({ kind: "standalone", modules: [mail] }),
    );
    expect(merged.map((rule) => rule.command)).toEqual([
      "assistant.toggle",
      "assistant.newChat",
      "assistant.previousChat",
      "mail.compose",
      "mail.archive",
    ]);
  });

  it("renames aliased commands and drops ones that no longer exist", () => {
    const rules = [
      { key: "g i", command: "go.inbox" },
      { key: "e", command: "archive" },
      { key: "mod+k", command: "commandPalette.toggle" },
    ];
    expect(
      applyKeybindingCommandAliases(rules, { "go.inbox": "mail.go.inbox", archive: "nowhere" }),
    ).toEqual([
      { key: "g i", command: "mail.go.inbox" },
      { key: "mod+k", command: "commandPalette.toggle" },
    ]);
  });

  it("maps commands to chips and apps to when-variables", () => {
    expect(keybindingCommandApp("app.switch.2", ["mail"])).toBe("global");
    expect(keybindingCommandApp("commandPalette.toggle", ["mail"])).toBe("global");
    expect(keybindingCommandApp("mail.archive", ["mail"])).toBe("mail");
    expect(keybindingCommandApp("thread.next", ["mail"])).toBe("code");
    expect(appWhenContext("mail", ["code", "mail", "drive"])).toEqual({
      "app.code": false,
      "app.mail": true,
      "app.drive": false,
    });
  });
});
