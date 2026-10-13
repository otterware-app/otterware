import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useServerModuleAvailability } from "../moduleState";
import { badgeImage, dockBadgeEnabled, mailDesktop } from "./desktop";
import { subscribeMailEvents } from "./rpc/events";
import { mailOperations } from "./rpc/operations";

/** No page DOM: device links and unread badges keep working while another module is visible. */
export default function MailBackground() {
  const environmentId = usePrimaryEnvironmentId();
  const available = useServerModuleAvailability("mail") === "on";
  const navigate = useNavigate();
  useEffect(() => {
    const bridge = mailDesktop();
    if (!bridge) return;
    let active = true;
    const open = () => {
      if (active) void navigate({ to: "/mail" });
    };
    const stop = bridge.on((event) => {
      if (event.module === "mail" && event.event === "compose:mailto") open();
    });
    void bridge
      .invoke("mail", "app:hasPendingMailto")
      .then((pending) => {
        if (pending) open();
      })
      .catch(() => {});
    return () => {
      active = false;
      stop();
    };
  }, [navigate]);
  useEffect(() => {
    const bridge = mailDesktop();
    if (!bridge || !environmentId || !available) return;
    let active = true;
    let latest = 0;
    let revision = 0;
    const paint = () => {
      const count = dockBadgeEnabled() ? latest : 0;
      void bridge.invoke("mail", "app:badge", { count, image: badgeImage(count) }).catch(() => {});
    };
    const stop = subscribeMailEvents(environmentId, (channel, payload) => {
      if (channel !== "gmail:unread-count" || typeof payload !== "number") return;
      ++revision;
      latest = payload;
      paint();
    });
    void mailOperations["gmail:getUnreadCount"]!(environmentId, {})
      .then((count) => {
        if (active && revision === 0 && typeof count === "number") {
          latest = count;
          paint();
        }
      })
      .catch(() => {});
    window.addEventListener("mail:badge-setting", paint);
    return () => {
      active = false;
      stop();
      window.removeEventListener("mail:badge-setting", paint);
      void bridge.invoke("mail", "app:badge", { count: 0, image: null }).catch(() => {});
    };
  }, [environmentId, available]);
  return null;
}
