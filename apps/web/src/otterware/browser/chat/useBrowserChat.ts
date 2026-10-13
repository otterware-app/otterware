/**
 * The browser chat's data: threads, one thread's history and its live turn,
 * and the commands, all answered by this browser's environment (ADR 0009).
 */
import type {
  BrowserAgentAccess,
  BrowserAgentKind,
  BrowserAgentMessage,
  BrowserAgentThread,
} from "@otterware/browser-environment/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { useCallback, useEffect, useReducer, useState } from "react";

import { browserClient, runInBrowser } from "../runtime";
import { IDLE_TURN, reduceLiveTurn } from "./liveTurn";

type Client = Effect.Success<typeof browserClient>;

/** Runs one call on this browser's environment; failures come back as their message. */
export const callBrowser = <A, E>(run: (client: Client) => Effect.Effect<A, E>) =>
  runInBrowser(Effect.flatMap(browserClient, run)).catch((cause: unknown) => {
    throw new Error(describeFailure(cause));
  });

export function describeFailure(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  const tagged = /"message":"([^"]+)"/.exec(text);
  return tagged?.[1] ?? text;
}

export function useAgentThreads() {
  const [threads, setThreads] = useState<ReadonlyArray<BrowserAgentThread>>([]);
  const reload = useCallback(
    () =>
      void callBrowser((client) => client["browser.agent.threads"]({})).then(
        (result) => setThreads(result.threads),
        () => {},
      ),
    [],
  );
  useEffect(reload, [reload]);
  return { threads, reload };
}

export function useAgentModels(agent: BrowserAgentKind) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly models: ReadonlyArray<{ readonly slug: string; readonly name: string }>;
    readonly error: string | null;
  } | null>(null);
  const key = `${agent}:${attempt}`;
  useEffect(() => {
    let active = true;
    void callBrowser((client) => client["browser.agent.models"]({ agent })).then(
      (loaded) => active && setResult({ key, models: loaded.models, error: null }),
      (error: unknown) => active && setResult({ key, models: [], error: describeFailure(error) }),
    );
    return () => {
      active = false;
    };
  }, [agent, key]);
  const current = result?.key === key ? result : null;
  return {
    models: current?.models ?? [],
    error: current?.error ?? null,
    loading: current === null,
    retry: () => setAttempt((count) => count + 1),
  };
}

/** A thread's settled history and its running turn, kept live while mounted. */
export function useThreadChat(threadId: string | null) {
  const [loaded, setLoaded] = useState<{
    readonly threadId: string;
    readonly messages: ReadonlyArray<BrowserAgentMessage>;
  } | null>(null);
  const [live, dispatch] = useReducer(reduceLiveTurn, IDLE_TURN);

  useEffect(() => {
    if (threadId === null) return;
    const controller = new AbortController();
    void runInBrowser(
      Effect.flatMap(browserClient, (client) =>
        client["browser.agent.events"]({ threadId }).pipe(
          Stream.runForEach((event) => Effect.sync(() => dispatch(event))),
        ),
      ),
      controller.signal,
    ).catch(() => {});
    return () => controller.abort();
  }, [threadId]);

  const { finished } = live;
  useEffect(() => {
    if (threadId === null) return;
    let active = true;
    void callBrowser((client) => client["browser.agent.messages"]({ threadId })).then(
      (result) => {
        if (!active) return;
        setLoaded({ threadId, messages: result.messages });
        dispatch({ _tag: "history.loaded" });
      },
      () => {},
    );
    return () => {
      active = false;
    };
    // `finished` reloads the history after each turn.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [threadId, finished]);

  const history = loaded !== null && loaded.threadId === threadId ? loaded.messages : [];
  return { history, live };
}

export const chatCommands = {
  create: (input: {
    readonly agent: BrowserAgentKind;
    readonly model: string;
    readonly access: BrowserAgentAccess;
    readonly title?: string;
  }) => callBrowser((client) => client["browser.agent.createThread"](input)),
  send: (threadId: string, text: string, context?: string) =>
    callBrowser((client) =>
      client["browser.agent.send"]({ threadId, text, ...(context ? { context } : {}) }),
    ),
  stop: (threadId: string) => callBrowser((client) => client["browser.agent.stop"]({ threadId })),
  answer: (threadId: string, approvalId: string, choice: "once" | "session" | "deny") =>
    callBrowser((client) => client["browser.agent.answer"]({ threadId, approvalId, choice })),
  remove: (threadId: string) =>
    callBrowser((client) => client["browser.agent.deleteThread"]({ threadId })),
};
