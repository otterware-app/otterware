interface SessionCacheEntry<T> {
  savedAt: number;
  value: T;
}

export function readSessionCache<T>(key: string, maxAge: number): SessionCacheEntry<T> | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  try {
    const entry = JSON.parse(sessionStorage.getItem(key) ?? "null") as SessionCacheEntry<T> | null;
    if (!entry || Date.now() - entry.savedAt > maxAge) return undefined;
    return entry;
  } catch {
    return undefined;
  }
}

export function writeSessionCache<T>(key: string, value: T): T {
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
    } catch {
      // Query data still remains available in memory when storage is blocked.
    }
  }
  return value;
}

export function removeSessionCachePrefix(prefix: string): void {
  if (typeof sessionStorage === "undefined") return;
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
  }
}
