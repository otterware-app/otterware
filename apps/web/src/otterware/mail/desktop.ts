import { moduleDesktopBridge } from "@otterware/module-kit/desktop";
import { useEffect, useState } from "react";
export interface MailDesktopCapabilities {
  platform: "darwin" | "linux" | "win32";
  launchAtLogin: boolean;
  defaultMailApp: boolean;
  dockBadge: boolean;
  translation: boolean;
  dragOut: boolean;
  openFiles: boolean;
}
export const mailDesktop = () => moduleDesktopBridge();
export function useMailDesktopCapabilities() {
  const [capabilities, setCapabilities] = useState<MailDesktopCapabilities | null>(null);
  useEffect(() => {
    let active = true;
    void mailDesktop()
      ?.invoke("mail", "app:capabilities")
      .then((value) => {
        if (active) setCapabilities(value as MailDesktopCapabilities);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return capabilities;
}
const BADGE_KEY = "otterware:mail:desktop-badge";
export const dockBadgeEnabled = () => localStorage.getItem(BADGE_KEY) === "true";
export function setDockBadgeEnabled(value: boolean) {
  localStorage.setItem(BADGE_KEY, String(value));
  window.dispatchEvent(new Event("mail:badge-setting"));
}
export function badgeImage(count: number): string | null {
  if (!count) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#dc2626";
  ctx.beginPath();
  ctx.arc(16, 16, 16, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(count > 99 ? "99+" : String(count), 16, 17);
  return canvas.toDataURL("image/png");
}
