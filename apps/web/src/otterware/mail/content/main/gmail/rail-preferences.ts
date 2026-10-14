import { mailStorage } from "../../host/storage";
import { useLatest } from "../use-latest";
import { useEffect, useState } from "react";
import { setSyncedPreference } from "../synced-preferences";
const UNREAD_DOTS = "gmail:rail-unread-dots";

/** Whether the rail dots the spaces with unread mail (Settings › General; off unless turned on). */
export function useRailUnreadDots(): [boolean, (on: boolean) => void] {
  const read = () => mailStorage.getItem(UNREAD_DOTS) === "1";
  const [on, setOn] = useState(read);
  const readForEffect = useLatest(read);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === UNREAD_DOTS) setOn(readForEffect.current());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [readForEffect]);
  const set = (next: boolean) => {
    setSyncedPreference(UNREAD_DOTS, next ? "1" : "0");
    // The rail (another component) follows at once.
    window.dispatchEvent(new StorageEvent("storage", { key: UNREAD_DOTS }));
  };
  return [on, set];
}
