import { useSyncExternalStore } from "react";

/**
 * How tightly the document list packs its rows. Stored on this device
 * (`DriveSettings.listDensity`'s client scope), and shared by every Drive
 * surface open in it.
 */
export type ListDensity = "comfortable" | "compact";

const STORAGE_KEY = "otterdrive:list-density";
const CHANGED = "otterdrive:list-density-changed";

function read(): ListDensity {
  try {
    return localStorage.getItem(STORAGE_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function useListDensity(): ListDensity {
  return useSyncExternalStore(subscribe, read, () => "comfortable");
}

export function setListDensity(density: ListDensity) {
  try {
    localStorage.setItem(STORAGE_KEY, density);
  } catch {
    // The choice still applies until the page reloads.
  }
  window.dispatchEvent(new Event(CHANGED));
}
