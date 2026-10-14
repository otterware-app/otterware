// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { MailSession, MailSessionContext, useMailState } from "./session";
import { useDraftAutosave } from "../main/gmail/use-draft-autosave";

const invoke = vi.fn();
vi.mock("./bridge", () => ({ mailHost: () => ({ invoke }), mailBridge: {} }));
let edit: (value: string) => void;
let show: (value: boolean) => void;
function Composer() {
  const [text, setText] = useMailState("compose:body", "");
  edit = setText;
  useDraftAutosave({
    accountId: "mail@example.test",
    retainKey: "compose:draft",
    signal: text,
    getPayload: () =>
      text
        ? { to: "recipient@example.test", subject: "Test", body: text, bodyHtml: `<b>${text}</b>` }
        : null,
  });
  return <textarea aria-label="Draft" readOnly value={text} />;
}
function Page() {
  const [visible, setVisible] = useState(true);
  show = setVisible;
  return visible ? <Composer /> : null;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.replaceChildren();
});
it("releases the composer DOM and resumes its saved draft without creating a second draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  invoke.mockImplementation(async (channel: string) => {
    if (channel === "gmail:saveDraft")
      return { draftId: "draft-1", messageId: "version-1", threadId: "thread-1" };
    return { messageId: "version-1" };
  });
  const session = new MailSession();
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  await act(async () =>
    root.render(
      <MailSessionContext.Provider value={session}>
        <QueryClientProvider client={session.queryClient}>
          <Page />
        </QueryClientProvider>
      </MailSessionContext.Provider>,
    ),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  await act(async () => {
    edit("First draft");
  });
  // Navigation flushes an edit before its debounce, then releases all composer DOM.
  await act(async () => {
    show(false);
  });
  expect(element.querySelector("textarea")).toBeNull();
  expect(invoke).toHaveBeenCalledWith(
    "gmail:saveDraft",
    expect.objectContaining({ bodyHtml: "<b>First draft</b>", draftId: undefined }),
  );
  await act(async () => {
    show(true);
  });
  expect(element.querySelector("textarea")?.value).toBe("First draft");
  await act(async () => {
    edit("Continued draft");
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(invoke).toHaveBeenLastCalledWith(
    "gmail:saveDraft",
    expect.objectContaining({
      draftId: "draft-1",
      expectMessageId: "version-1",
      body: "Continued draft",
    }),
  );
  await act(async () => root.unmount());
  session.dispose();
});
