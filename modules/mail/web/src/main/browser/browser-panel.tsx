import type { CSSProperties } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { mailHost } from "../../host/bridge";
import { IconBtn } from "../gmail/ui";
import { BrowserPages, BrowserTabs } from "./browser-view";
import { closeTab, newTab, selectTab, useBrowser } from "./store";

/** Mail's link preview uses the host's browser session and extensions, with no agent runtime of its own. */
export function MailBrowserPanel() {
  const activeId = useBrowser((state) => state.activeId);
  if (!mailHost().features.browser || !activeId) return null;
  return (
    <section
      aria-label="Mail browser"
      className="absolute inset-y-0 right-0 z-30 flex w-[48%] min-w-80 max-w-full flex-col border-l border-border bg-canvas shadow-xl"
      style={{ "--workspace-topbar-height": "40px" } as CSSProperties}
    >
      <div className="flex h-10 min-w-0 items-center gap-1 overflow-x-auto px-2">
        <BrowserTabs onClose={closeTab} />
        <IconBtn label="New browser tab" onClick={newTab}>
          <PlusIcon className="size-4" />
        </IconBtn>
        <IconBtn label="Close browser panel" onClick={() => selectTab(null)}>
          <XIcon className="size-4" />
        </IconBtn>
      </div>
      <BrowserPages
        onNewChat={() => {
          selectTab(null);
          mailHost().openAssistant();
        }}
      />
    </section>
  );
}
