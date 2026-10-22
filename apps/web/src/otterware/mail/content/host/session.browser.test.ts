import { expect, it, vi } from "vite-plus/test";
import { QueryObserver } from "@tanstack/react-query";
import { fakeTimers } from "../../../../../test/render";
import { MailSession } from "./session";

/** Opens Mail sessions on a clean localStorage and disposes them with the test. */
function sessions() {
  localStorage.clear();
  const opened: MailSession[] = [];
  return {
    open: (id: string) => {
      const value = new MailSession(id);
      opened.push(value);
      return value;
    },
    [Symbol.dispose]: () => {
      opened.splice(0).forEach((value) => value.dispose());
      localStorage.clear();
    },
  };
}
it("keeps list data when a page unmounts and returns without a visible refetch", async () => {
  using _timers = fakeTimers();
  using mail = sessions();
  const work = mail.open("work");
  const queryFn = vi.fn(async () => ["message"]);
  await work.queryClient.fetchQuery({ queryKey: ["gmail:messages", "account", "INBOX"], queryFn });
  await vi.advanceTimersByTimeAsync(60_000);
  const observer = new QueryObserver(work.queryClient, {
    queryKey: ["gmail:messages", "account", "INBOX"],
    queryFn,
  });
  const unsubscribe = observer.subscribe(() => {});
  expect(observer.getCurrentResult().data).toEqual(["message"]);
  expect(observer.getCurrentResult().isFetching).toBe(false);
  expect(queryFn).toHaveBeenCalledTimes(1);
  unsubscribe();
});
it("re-checks a restored mailbox list instead of trusting it", async () => {
  using _timers = fakeTimers();
  using mail = sessions();
  const work = mail.open("work");
  work.queryClient.setQueryData(["gmail:accounts"], []);
  await vi.advanceTimersByTimeAsync(60_000);
  const restored = mail.open("work");
  const queryFn = vi.fn(async () => [{ id: "me@example.test" }]);
  const observer = new QueryObserver(restored.queryClient, {
    queryKey: ["gmail:accounts"],
    queryFn,
  });
  const unsubscribe = observer.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(0);
  expect(queryFn).toHaveBeenCalledTimes(1);
  expect(observer.getCurrentResult().data).toEqual([{ id: "me@example.test" }]);
  unsubscribe();
});
it("persists bounded list data per environment without bodies or credentials", async () => {
  using _timers = fakeTimers();
  using mail = sessions();
  const work = mail.open("work");
  work.queryClient.setQueryData(["gmail:messages", "account", "INBOX"], ["message"]);
  work.queryClient.setQueryData(["gmail:message", "account", "1"], { body: "private body" });
  work.queryClient.setQueryData(["provider-settings"], { token: "credential" });
  await vi.advanceTimersByTimeAsync(500);
  const restored = mail.open("work");
  expect(restored.queryClient.getQueryData(["gmail:messages", "account", "INBOX"])).toEqual([
    "message",
  ]);
  expect(restored.queryClient.getQueryData(["gmail:message", "account", "1"])).toBeUndefined();
  expect(restored.queryClient.getQueryData(["provider-settings"])).toBeUndefined();
  expect(
    mail.open("personal").queryClient.getQueryData(["gmail:messages", "account", "INBOX"]),
  ).toBeUndefined();
});
