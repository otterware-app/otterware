/**
 * Connects an API agent for this browser: the user's Hermes or OpenClaw
 * server (its key sealed in this browser), or an OpenRouter key sealed in
 * Otter Cloud, which runs OpenRouter turns.
 */
import type { BrowserAgentKind } from "@otterware/browser-environment/contracts";
import { useState } from "react";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { callBrowser, describeFailure } from "./useBrowserChat";

const COPY = {
  openrouter: {
    title: "Connect OpenRouter",
    description: "Your key is sealed in Otter Cloud, which runs OpenRouter chats.",
    url: null,
    secret: "OpenRouter key (sk-or-…)",
  },
  hermes: {
    title: "Connect Hermes",
    description: "Your Hermes API server must allow this site's address (CORS).",
    url: "https://hermes.example.com:8642",
    secret: "API_SERVER_KEY",
  },
  openclaw: {
    title: "Connect OpenClaw",
    description: "Your OpenClaw gateway must allow this site's address (CORS).",
    url: "https://openclaw.example.com:18789",
    secret: "Gateway token",
  },
} as const;

export function AgentSetup(props: {
  readonly agent: BrowserAgentKind;
  readonly reason: string;
  readonly onConnected: () => void;
}) {
  const copy = COPY[props.agent];
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (props.agent === "openrouter")
        await callBrowser((client) =>
          client["browser.agent.openRouter.connect"]({ apiKey: secret }),
        );
      else if (props.agent === "hermes")
        await callBrowser((client) =>
          client["browser.agent.configure"]({ agent: "hermes", baseUrl: url, apiKey: secret }),
        );
      else
        await callBrowser((client) =>
          client["browser.agent.configure"]({ agent: "openclaw", baseUrl: url, token: secret }),
        );
      setSecret("");
      props.onConnected();
    } catch (cause) {
      setError(describeFailure(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border p-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="font-medium">{copy.title}</div>
      <p className="text-muted-foreground text-xs">{props.reason}</p>
      <p className="text-muted-foreground text-xs">{copy.description}</p>
      {copy.url === null ? null : (
        <Input
          aria-label="Server address"
          placeholder={copy.url}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      )}
      <Input
        aria-label={copy.secret}
        type="password"
        placeholder={copy.secret}
        value={secret}
        onChange={(event) => setSecret(event.target.value)}
      />
      {error === null ? null : <p className="text-destructive-foreground text-xs">{error}</p>}
      <div>
        <Button
          type="submit"
          size="sm"
          disabled={saving || secret === "" || (copy.url !== null && url === "")}
        >
          {saving ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </form>
  );
}
