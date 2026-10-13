import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createMailRouter } from "../main/router";
import { ToastProvider } from "../main/gmail/toast";
import { installMailDom } from "./dom";
import { installMailWebHost, type MailWebHost } from "./bridge";
import { MailSessionContext, type MailSession } from "./session";
import styles from "../styles.css?inline";

export function MailSurface({
  host,
  session,
  path,
  children,
}: {
  host: MailWebHost;
  session: MailSession;
  path?: string;
  children?: ReactNode;
}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!element) return;
    const shadow = element.shadowRoot ?? element.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const root = document.createElement("div");
    root.className = "mail-root platform-web";
    root.dataset.windowControls = "none";
    root.style.cssText =
      "height:100%;min-height:0;position:relative;overflow:hidden;isolation:isolate;contain:layout style";
    shadow.replaceChildren(style, root);
    const clearDom = installMailDom(root, shadow);
    const clearHost = installMailWebHost(host);
    setContent(root);
    return () => {
      setContent(null);
      clearDom();
      clearHost();
      shadow.replaceChildren();
    };
  }, [element, host]);
  return (
    <div ref={setElement} style={{ height: "100%", minHeight: 0, flex: 1 }} data-mail-surface>
      {content &&
        createPortal(
          <MailSessionContext.Provider value={session}>
            <QueryClientProvider client={session.queryClient}>
              <ToastProvider>
                {children ?? <MailRoutes host={host} session={session} path={path} />}
              </ToastProvider>
            </QueryClientProvider>
          </MailSessionContext.Provider>,
          content,
        )}
    </div>
  );
}
function MailRoutes({
  host,
  session,
  path,
}: {
  host: MailWebHost;
  session: MailSession;
  path?: string;
}) {
  const [router] = useState(() =>
    createMailRouter(session.queryClient, path && path !== "/" ? path : session.path),
  );
  useLayoutEffect(
    () =>
      router.subscribe("onResolved", ({ toLocation }) => {
        session.path = toLocation.href;
        host.navigate(`/mail${toLocation.href === "/" ? "" : toLocation.href}`);
      }),
    [router, host, session],
  );
  useLayoutEffect(() => {
    if (path && path !== "/" && path !== router.state.location.href) router.history.replace(path);
  }, [path, router]);
  return <RouterProvider router={router} />;
}
export { MailSession } from "./session";
export type { MailWebHost, MailPageSelection } from "./bridge";
export { SettingsPage } from "../main/settings/settings-page";
export type { SettingsRoute } from "../main/settings/settings-page";
