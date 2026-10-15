import { expect, it } from "vite-plus/test";
import { workerLifecycle } from "./workerLifecycle.ts";
it("closes the previous account worker before accepting calls on the new account", async () => {
  const order: string[] = [];
  let account = "alice";
  let changed!: () => void;
  let subscribed = true;
  const lifecycle = await workerLifecycle(
    async () => {
      const id = account;
      order.push(`open:${id}`);
      return {
        id,
        close: async () => {
          order.push(`close:${id}`);
        },
      };
    },
    (listener) => {
      changed = listener;
      return () => {
        subscribed = false;
      };
    },
    () => {},
  );
  expect((await lifecycle.current()).id).toBe("alice");
  account = "bob";
  changed();
  expect((await lifecycle.current()).id).toBe("bob");
  expect(order).toEqual(["open:alice", "close:alice", "open:bob"]);
  await lifecycle.close();
  expect(subscribed).toBe(false);
  expect(order.at(-1)).toBe("close:bob");
  await expect(lifecycle.current()).rejects.toThrow("not running");
});
it("disposes an account worker whose startup completes after the module closes", async () => {
  let changed!: () => void;
  let finish!: (worker: { close(): Promise<void> }) => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let starting = false;
  let closes = 0;
  const lifecycle = await workerLifecycle(
    async () => {
      if (starting)
        return new Promise<{ close(): Promise<void> }>((resolve) => {
          finish = resolve;
          started();
        });
      return {
        close: async () => {
          closes++;
        },
      };
    },
    (listener) => {
      changed = listener;
      return () => {};
    },
    () => {},
  );
  starting = true;
  changed();
  const awaiting = lifecycle.current();
  // The signal is the factory entering startup, not elapsed time.
  await entered;
  const closing = lifecycle.close();
  finish({
    close: async () => {
      closes++;
    },
  });
  await closing;
  await expect(awaiting).rejects.toThrow("not running");
  expect(closes).toBe(2);
});
