/**
 * The compact chat for "this browser" (ADR 0009): OpenRouter, Hermes or
 * OpenClaw with the browser's module tools, approvals and history. Pages
 * without an environment show it where the assistant would be (Home, module
 * side chats); `context` is the page's context, sent with each message.
 */
import type {
  BrowserAgentAccess,
  BrowserAgentKind,
  BrowserAgentMessage,
} from "@otterware/browser-environment/contracts";
import { PlusIcon, SquareIcon, WrenchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import ChatMarkdown from "../../../components/ChatMarkdown";
import { Button } from "../../../components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { cn } from "../../../lib/utils";
import { AgentSetup } from "./AgentSetup";
import type { LiveTool } from "./liveTurn";
import {
  chatCommands,
  describeFailure,
  useAgentModels,
  useAgentThreads,
  useThreadChat,
} from "./useBrowserChat";

const AGENTS: ReadonlyArray<{ readonly id: BrowserAgentKind; readonly label: string }> = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "hermes", label: "Hermes" },
  { id: "openclaw", label: "OpenClaw" },
];

const ACCESS: ReadonlyArray<{ readonly id: BrowserAgentAccess; readonly label: string }> = [
  { id: "read-only", label: "Read only" },
  { id: "approval-required", label: "Ask before changes" },
  { id: "full-access", label: "Full access" },
];

const CHOICE_LABELS = {
  once: "Allow once",
  session: "Allow in this chat",
  deny: "Decline",
} as const;

function ToolRow({ name, output, isError }: Pick<LiveTool, "name" | "output" | "isError">) {
  return (
    <details className="rounded-md border px-2 py-1 text-xs">
      <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
        <WrenchIcon className="size-3" />
        <span className="font-mono">{name}</span>
        {output === null ? (
          <span>· running</span>
        ) : isError ? (
          <span className="text-destructive-foreground">· failed</span>
        ) : null}
      </summary>
      {output === null ? null : (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">
          {output}
        </pre>
      )}
    </details>
  );
}

function Message({ message }: { readonly message: BrowserAgentMessage }) {
  switch (message._tag) {
    case "user":
      return (
        <div className="ml-8 self-end whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2 text-sm">
          {message.text}
        </div>
      );
    case "assistant":
      return <ChatMarkdown text={message.text} cwd={undefined} />;
    case "tool":
      return <ToolRow name={message.name} output={message.output} isError={message.isError} />;
    case "notice":
      return <p className="text-muted-foreground text-xs">{message.text}</p>;
  }
}

export function BrowserChat(props: { readonly context?: string; readonly className?: string }) {
  const { threads, reload } = useAgentThreads();
  // null follows the most recent chat; "new" is an empty one until its first message.
  const [selected, setSelected] = useState<string | null>(null);
  const threadId = selected === "new" ? null : (selected ?? threads[0]?.id ?? null);
  const setThreadId = setSelected;
  const thread = threads.find((candidate) => candidate.id === threadId) ?? null;
  const [agent, setAgent] = useState<BrowserAgentKind>("openrouter");
  const [access, setAccess] = useState<BrowserAgentAccess>("approval-required");
  const [chosenModel, setModel] = useState<string | null>(null);
  const activeAgent = thread?.agent ?? agent;
  const models = useAgentModels(activeAgent);
  const model =
    chosenModel ??
    (models.models.find((entry) => "isDefault" in entry && entry.isDefault) ?? models.models[0])
      ?.slug ??
    null;
  const { history, live } = useThreadChat(threadId);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const scrollKey = `${history.length}:${live.text.length}:${live.tools.length}:${live.approvals.length}`;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    // Follows new content, whichever part grew.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [scrollKey]);

  const send = async () => {
    const text = draft.trim();
    if (text === "" || live.running) return;
    setError(null);
    try {
      let id = threadId;
      if (id === null) {
        if (model === null) throw new Error("Choose a model first.");
        const created = await chatCommands.create({
          agent,
          model,
          access,
          title: text.slice(0, 60),
        });
        id = created.id;
        setThreadId(id);
        reload();
      }
      setDraft("");
      await chatCommands.send(id, text, props.context);
    } catch (cause) {
      setError(describeFailure(cause));
    }
  };

  const showLive = live.running || live.settling;
  const modelLabel = useMemo(
    () => models.models.find((entry) => entry.slug === (thread?.model ?? model))?.name,
    [models.models, model, thread],
  );

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", props.className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          value={activeAgent}
          disabled={thread !== null}
          onValueChange={(value) => {
            if (value === null) return;
            setAgent(value as BrowserAgentKind);
            setModel(null);
          }}
        >
          <SelectTrigger aria-label="Agent" size="sm">
            <SelectValue>{AGENTS.find((entry) => entry.id === activeAgent)?.label}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {AGENTS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        {models.models.length > 0 ? (
          <Select
            value={thread?.model ?? model ?? ""}
            disabled={thread !== null}
            onValueChange={(value) => value !== null && setModel(value)}
          >
            <SelectTrigger aria-label="Model" size="sm">
              <SelectValue>{modelLabel ?? thread?.model ?? "Model"}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {models.models.map((entry) => (
                <SelectItem key={entry.slug} value={entry.slug}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : null}
        <Select
          value={thread?.access ?? access}
          disabled={thread !== null}
          onValueChange={(value) => value !== null && setAccess(value as BrowserAgentAccess)}
        >
          <SelectTrigger aria-label="What the agent may do" size="sm">
            <SelectValue>
              {ACCESS.find((entry) => entry.id === (thread?.access ?? access))?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {ACCESS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        {threads.length > 0 ? (
          <Select
            value={threadId ?? ""}
            onValueChange={(value) => value !== null && setThreadId(value)}
          >
            <SelectTrigger aria-label="Earlier chats" size="sm">
              <SelectValue>{thread?.title ?? "New chat"}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {threads.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.title}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="New chat"
          onClick={() => {
            setThreadId("new");
            setModel(null);
          }}
        >
          <PlusIcon />
        </Button>
      </div>

      {models.error !== null && thread === null ? (
        <AgentSetup agent={activeAgent} reason={models.error} onConnected={models.retry} />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {history.map((message, index) => (
          // History only grows at its end, so positions are stable keys.
          // oxlint-disable-next-line react/no-array-index-key
          <Message key={index} message={message} />
        ))}
        {showLive ? (
          <>
            {live.tools.map((tool) => (
              <ToolRow key={tool.id} name={tool.name} output={tool.output} isError={tool.isError} />
            ))}
            {live.text === "" ? null : (
              <ChatMarkdown text={live.text} cwd={undefined} isStreaming={live.running} />
            )}
          </>
        ) : null}
        <div ref={bottom} />
      </div>

      {live.approvals.map((approval) => (
        <div
          key={approval.id}
          role="group"
          aria-label="Approval"
          className="flex flex-col gap-1.5 rounded-lg border border-warning/32 bg-warning-surface p-2 text-xs"
        >
          <span>
            <span className="font-medium text-warning">Allow </span>
            <span className="font-mono">{approval.title}</span>?
          </span>
          {approval.detail ? (
            <code className="line-clamp-3 break-all text-muted-foreground">{approval.detail}</code>
          ) : null}
          <div className="flex gap-1.5">
            {(["deny", "session", "once"] as const)
              .filter((choice) => approval.choices.includes(choice))
              .map((choice) => (
                <Button
                  key={choice}
                  size="xs"
                  variant={choice === "once" ? "default" : "outline"}
                  onClick={() =>
                    threadId &&
                    void chatCommands
                      .answer(threadId, approval.id, choice)
                      .catch((cause: unknown) => setError(describeFailure(cause)))
                  }
                >
                  {CHOICE_LABELS[choice]}
                </Button>
              ))}
          </div>
        </div>
      ))}

      {error === null ? null : <p className="text-destructive-foreground text-xs">{error}</p>}

      <form
        className="flex items-end gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          aria-label="Message"
          placeholder="Ask about your mail, calendar or projects"
          value={draft}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        {live.running && threadId !== null ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Stop"
            onClick={() => void chatCommands.stop(threadId)}
          >
            <SquareIcon />
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={draft.trim() === ""}>
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
