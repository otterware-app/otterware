import { describe, expect, it } from "vite-plus/test";
import { migratedMailKeybindings } from "./keybindingMigration";
import { renamedLabelCommand, encodeLabelCommand } from "./mailCommands";

describe("Mail shortcut migration", () => {
  it("scopes legacy mail commands and preserves conditions and sequences", () => {
    expect(
      migratedMailKeybindings(
        [{ command: "go.inbox", key: "g i", when: "!editableFocus" }],
        new Set(),
      ),
    ).toEqual([{ command: "mail.go.inbox", key: "g i", when: "app.mail && (!editableFocus)" }]);
  });
  it("keeps host choices and maps chat commands to the shared Assistant", () => {
    expect(
      migratedMailKeybindings(
        [
          { command: "go.inbox", key: "g i" },
          { command: "agent.newTab", key: "mod+t" },
          { command: "agent.sendQueuedNow", key: "mod+enter" },
        ],
        new Set(["mail.go.inbox"]),
      ),
    ).toEqual([
      { command: "assistant.newChat", key: "mod+t" },
      { command: "thread.steerQueuedMessage", key: "mod+enter" },
    ]);
  });
  it("preserves custom label shortcuts with Unicode names", () => {
    expect(
      migratedMailKeybindings([{ command: "label.move:客户/2026", key: "mod+alt+1" }], new Set()),
    ).toEqual([{ command: encodeLabelCommand("客户/2026"), key: "mod+alt+1", when: "app.mail" }]);
  });
});

it("renames label shortcuts and their children without changing unrelated names", () => {
  expect(renamedLabelCommand(encodeLabelCommand("Work/Invoices"), "Work", "客户")).toBe(
    encodeLabelCommand("客户/Invoices"),
  );
  expect(renamedLabelCommand(encodeLabelCommand("Workshops"), "Work", "客户")).toBeNull();
});
