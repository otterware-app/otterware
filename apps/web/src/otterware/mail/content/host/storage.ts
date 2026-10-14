import { mailHost, mailHostOrNull } from "./bridge";

/** Mail's old window-local keys must not collide with host settings or another environment. */
const mailStoragePrefix = (environmentId: string) =>
  `otterware:mail:${encodeURIComponent(environmentId)}:`;
export function storageFor(environmentId: string) {
  const prefix = mailStoragePrefix(environmentId);
  return {
    getItem: (key: string) => localStorage.getItem(prefix + key),
    setItem: (key: string, value: string) => localStorage.setItem(prefix + key, value),
    removeItem: (key: string) => localStorage.removeItem(prefix + key),
  };
}
export const mailStorage = {
  getItem: (key: string) => {
    const host = mailHostOrNull();
    return host ? storageFor(host.environmentId).getItem(key) : null;
  },
  setItem: (key: string, value: string) => storageFor(mailHost().environmentId).setItem(key, value),
  removeItem: (key: string) => storageFor(mailHost().environmentId).removeItem(key),
};
