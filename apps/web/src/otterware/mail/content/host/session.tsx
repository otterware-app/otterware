import { createClientStore } from "@otterware/module-kit/web";
import * as Schema from "effect/Schema";
import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";

/** Each environment keeps its cache and draft state above the router. */
export class MailSession {
  readonly queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        staleTime: 30_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  readonly store = createClientStore(() => ({ values: new Map<string, unknown>(), revision: 0 }));
  get values() {
    return this.store.getState().values;
  }
  readonly subscribe = (listener: () => void) => this.store.subscribe(listener);
  private stopCache: () => void;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(environmentId = "test") {
    // Keep navigation lists warm; message bodies and transient searches can expire.
    for (const key of ["gmail:message", "gmail:thread", "gmail:searchMessages", "gmail-search"])
      this.queryClient.setQueryDefaults([key], { gcTime: 5 * 60_000 });
    // Which mailboxes exist decides the whole view; a restored list is re-checked once it's stale.
    this.queryClient.setQueryDefaults(["gmail:accounts"], { refetchOnMount: true });
    const persisted = createClientStore(() => ({ snapshot: null as string | null }), {
      key: `otterware:mail:cache:${encodeURIComponent(environmentId)}`,
      scope: "client",
      schema: Schema.NullOr(Schema.String),
      pick: (state) => state.snapshot,
      restore: (snapshot) => ({ snapshot }),
    });
    const snapshot = persisted.getState().snapshot;
    if (snapshot) {
      try {
        hydrate(this.queryClient, JSON.parse(snapshot));
      } catch {
        /* Ignore an obsolete cache. */
      }
    }
    this.stopCache = this.queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => {
        // Persist a bounded set of recent lists/metadata, not attachment bodies or credentials.
        const recent = new Set(
          this.queryClient
            .getQueryCache()
            .getAll()
            .filter((query) =>
              [
                "gmail:accounts",
                "gmail:labels",
                "gmail:messages",
                "gmail:combinedMessages",
                "gmail:combinedCounts",
                "gmail:views",
                "projects",
                "gmail:projectThreads",
              ].includes(String(query.queryKey[0])),
            )
            .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
            .slice(0, 80),
        );
        const snapshot = dehydrate(this.queryClient, {
          shouldDehydrateQuery: (query) => query.state.status === "success" && recent.has(query),
        });
        // Infinite lists keep their first pages on disk; cap the snapshot before localStorage's quota.
        let bytes = 0;
        snapshot.queries = snapshot.queries.flatMap((query) => {
          const data = query.state.data;
          const limited =
            data &&
            typeof data === "object" &&
            "pages" in data &&
            "pageParams" in data &&
            Array.isArray(data.pages) &&
            Array.isArray(data.pageParams)
              ? {
                  ...query,
                  state: {
                    ...query.state,
                    data: {
                      ...data,
                      pages: data.pages.slice(0, 2),
                      pageParams: data.pageParams.slice(0, 2),
                    },
                  },
                }
              : query;
          const size = JSON.stringify(limited).length;
          if (bytes + size > 1_500_000) return [];
          bytes += size;
          return [limited];
        });
        persisted.setState({ snapshot: JSON.stringify(snapshot) });
      }, 500);
    });
  }
  emit() {
    this.store.setState((s) => ({ revision: s.revision + 1 }));
  }
  clear(prefix: string) {
    for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key);
    this.emit();
  }
  dispose() {
    this.stopCache();
    clearTimeout(this.flushTimer);
    this.queryClient.clear();
    this.values.clear();
  }
}
export const MailSessionContext = createContext<MailSession | null>(null);
export function useMailSession() {
  const session = useContext(MailSessionContext);
  if (!session) throw new Error("MailSession is missing");
  return session;
}
export function useMailState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const session = useMailSession();
  if (!session.values.has(key))
    session.values.set(key, typeof initial === "function" ? (initial as () => T)() : initial);
  const value = useSyncExternalStore(session.subscribe, () => session.values.get(key) as T);
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const previous = session.values.get(key) as T;
      const result = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      if (Object.is(previous, result)) return;
      session.values.set(key, result);
      session.emit();
    },
    [key, session],
  );
  return [value, update];
}
export function useMailRef<T>(key: string, initial: T): { current: T } {
  const session = useMailSession();
  if (!session.values.has(key)) session.values.set(key, { current: initial });
  return session.values.get(key) as { current: T };
}
