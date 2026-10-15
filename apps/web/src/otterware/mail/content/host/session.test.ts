// @vitest-environment jsdom
// @vitest-environment jsdom
// @vitest-environment jsdom
// @vitest-environment jsdom
// @vitest-environment jsdom
// @vitest-environment jsdom
// @vitest-environment jsdom
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { QueryObserver } from "@tanstack/react-query";
import { MailSession } from "./session";
const sessions: MailSession[] = [];
const session = (id: string) => {
  const value = new MailSession(id);
  sessions.push(value);
  return value;
};
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  sessions.splice(0).forEach((value) => value.dispose());
  vi.useRealTimers();
});
it("keeps list data when a page unmounts and returns without a visible refetch", async () => {
  const mail = session("work");
  const queryFn = vi.fn(async () => ["message"]);
  await mail.queryClient.fetchQuery({ queryKey: ["gmail:messages", "account", "INBOX"], queryFn });
  await vi.advanceTimersByTimeAsync(60_000);
  const observer = new QueryObserver(mail.queryClient, {
    queryKey: ["gmail:messages", "account", "INBOX"],
    queryFn,
  });
  const unsubscribe = observer.subscribe(() => {});
  expect(observer.getCurrentResult().data).toEqual(["message"]);
  expect(observer.getCurrentResult().isFetching).toBe(false);
  expect(queryFn).toHaveBeenCalledTimes(1);
  unsubscribe();
});
it("persists bounded list data per environment without bodies or credentials", async () => {
  const mail = session("work");
  mail.queryClient.setQueryData(["gmail:messages", "account", "INBOX"], ["message"]);
  mail.queryClient.setQueryData(["gmail:message", "account", "1"], { body: "private body" });
  mail.queryClient.setQueryData(["provider-settings"], { token: "credential" });
  await vi.advanceTimersByTimeAsync(500);
  const restored = session("work");
  expect(restored.queryClient.getQueryData(["gmail:messages", "account", "INBOX"])).toEqual([
    "message",
  ]);
  expect(restored.queryClient.getQueryData(["gmail:message", "account", "1"])).toBeUndefined();
  expect(restored.queryClient.getQueryData(["provider-settings"])).toBeUndefined();
  expect(
    session("personal").queryClient.getQueryData(["gmail:messages", "account", "INBOX"]),
  ).toBeUndefined();
});
