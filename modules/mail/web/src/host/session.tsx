import {
  createContext,
  useContext,
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { QueryClient } from "@tanstack/react-query";

/** Navigation state is data, not a retained tree of hidden DOM nodes. */
export class MailSession {
  readonly queryClient = new QueryClient();
  readonly values = new Map<string, unknown>();
  path = "/";
  clear(prefix: string) {
    for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key);
  }
  dispose() {
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
  const [value, setValue] = useState<T>(() => {
    if (!session.values.has(key))
      session.values.set(key, typeof initial === "function" ? (initial as () => T)() : initial);
    return session.values.get(key) as T;
  });
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const previous = session.values.get(key) as T;
      const result = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      session.values.set(key, result);
      setValue(result);
    },
    [key, session],
  );
  return [value, update];
}

/** Draft identity/version and in-flight saves survive the page's DOM lifetime. */
export function useMailRef<T>(key: string, initial: T): { current: T } {
  const session = useMailSession();
  if (!session.values.has(key)) session.values.set(key, { current: initial });
  return session.values.get(key) as { current: T };
}
