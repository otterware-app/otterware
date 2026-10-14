import { describe, expect, it } from "vite-plus/test";

import { IDLE_TURN, reduceLiveTurn, type LiveTurnAction } from "./liveTurn";

const fold = (actions: ReadonlyArray<LiveTurnAction>) => actions.reduce(reduceLiveTurn, IDLE_TURN);

describe("reduceLiveTurn", () => {
  it("streams a turn, its tool and its approval, then hands over to history", () => {
    const approval = {
      id: "approval:1",
      title: "home_create_project",
      detail: "{}",
      choices: ["once" as const],
    };
    const waiting = fold([
      { _tag: "thread.state", running: false, approvals: [] },
      { _tag: "turn.started" },
      { _tag: "text.delta", text: "Let me " },
      { _tag: "text.delta", text: "check." },
      { _tag: "tool.started", id: "t1", name: "home_create_project", input: { name: "Acme" } },
      { _tag: "approval.requested", ...approval },
    ]);
    expect(waiting.running).toBe(true);
    expect(waiting.text).toBe("Let me check.");
    expect(waiting.approvals).toEqual([approval]);

    const done = fold([
      { _tag: "turn.started" },
      { _tag: "tool.started", id: "t1", name: "home_create_project", input: {} },
      { _tag: "approval.requested", ...approval },
      { _tag: "approval.resolved", id: approval.id },
      { _tag: "tool.completed", id: "t1", output: "{}", isError: false },
      { _tag: "turn.completed", status: "completed", message: null },
    ]);
    // The finished turn stays visible until the history has it.
    expect(done).toMatchObject({ running: false, settling: true, finished: 1, approvals: [] });
    expect(done.tools).toEqual([
      { id: "t1", name: "home_create_project", input: {}, output: "{}", isError: false },
    ]);
    expect(reduceLiveTurn(done, { _tag: "history.loaded" })).toMatchObject({
      settling: false,
      text: "",
      tools: [],
    });
  });

  it("shows approvals a page missed when it subscribes mid-turn", () => {
    const approval = {
      id: "a",
      title: "t",
      detail: null,
      choices: ["once" as const, "deny" as const],
    };
    expect(fold([{ _tag: "thread.state", running: true, approvals: [approval] }])).toMatchObject({
      running: true,
      approvals: [approval],
    });
  });
});
