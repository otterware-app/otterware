/**
 * The running turn of a browser chat, folded from `browser.agent.events`:
 * streaming text, tool calls and waiting approvals. History has the settled
 * form; when a turn ends this keeps showing it until the history is reloaded.
 */
import type {
  BrowserAgentApproval,
  BrowserAgentEvent,
} from "@otterware/browser-environment/contracts";

export interface LiveTool {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly output: string | null;
  readonly isError: boolean;
}

export interface LiveTurn {
  readonly running: boolean;
  readonly text: string;
  readonly tools: ReadonlyArray<LiveTool>;
  readonly approvals: ReadonlyArray<BrowserAgentApproval>;
  /** Counts finished turns, so the history reloads after each. */
  readonly finished: number;
  /** Shown until the history has the settled turn. */
  readonly settling: boolean;
}

export const IDLE_TURN: LiveTurn = {
  running: false,
  text: "",
  tools: [],
  approvals: [],
  finished: 0,
  settling: false,
};

export type LiveTurnAction = BrowserAgentEvent | { readonly _tag: "history.loaded" };

export function reduceLiveTurn(state: LiveTurn, action: LiveTurnAction): LiveTurn {
  switch (action._tag) {
    case "thread.state":
      return { ...state, running: action.running, approvals: action.approvals };
    case "turn.started":
      return { ...state, running: true, settling: false, text: "", tools: [], approvals: [] };
    case "text.delta":
      return { ...state, text: state.text + action.text };
    case "tool.started":
      return {
        ...state,
        tools: [
          ...state.tools,
          { id: action.id, name: action.name, input: action.input, output: null, isError: false },
        ],
      };
    case "tool.completed":
      return {
        ...state,
        tools: state.tools.map((tool) =>
          tool.id === action.id
            ? { ...tool, output: action.output, isError: action.isError }
            : tool,
        ),
      };
    case "approval.requested":
      return {
        ...state,
        approvals: [
          ...state.approvals.filter((approval) => approval.id !== action.id),
          { id: action.id, title: action.title, detail: action.detail, choices: action.choices },
        ],
      };
    case "approval.resolved":
      return {
        ...state,
        approvals: state.approvals.filter((approval) => approval.id !== action.id),
      };
    case "turn.completed":
      return {
        ...state,
        running: false,
        approvals: [],
        finished: state.finished + 1,
        settling: true,
      };
    case "history.loaded":
      return state.settling ? { ...state, settling: false, text: "", tools: [] } : state;
  }
}
