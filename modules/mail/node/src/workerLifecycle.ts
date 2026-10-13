/** Serializes account changes: the old worker closes before its replacement starts. */
export async function workerLifecycle<W extends { close(): Promise<void> }>(
  open: () => Promise<W>,
  subscribe: (changed: () => void) => () => void,
  changed: () => void,
) {
  let closed = false;
  let worker: W | undefined;
  let version = 0;
  let ready: Promise<void> = Promise.resolve();
  const restart = () => {
    const requested = ++version;
    ready = ready
      .catch(() => {})
      .then(async () => {
        await worker?.close();
        worker = undefined;
        if (closed || requested !== version) return;
        const next = await open();
        if (closed || requested !== version) {
          await next.close();
          return;
        }
        worker = next;
        changed();
      });
    // A failed restart is retained for calls to report; it must not become an unhandled rejection.
    void ready.catch(() => {});
  };
  const stop = subscribe(restart);
  restart();
  try {
    await ready;
  } catch (error) {
    stop();
    throw error;
  }
  return {
    async current(): Promise<W> {
      for (;;) {
        const observed = ready;
        await observed;
        if (observed !== ready) continue;
        if (closed || !worker) throw new Error("Mail is not running.");
        return worker;
      }
    },
    async close() {
      closed = true;
      ++version;
      stop();
      await ready.catch(() => {});
      await worker?.close();
      worker = undefined;
    },
  };
}
