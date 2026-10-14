import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * The document list/preview split is page content. Its width survives visits.
 */

function readNumber(key: string): number | null {
  try {
    const saved = Number(window.localStorage.getItem(key));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  } catch {
    return null;
  }
}

/** The list resizes in the DOM during a drag; React commits its width on release. */
export function useDocumentListWidth() {
  const [width, setWidth] = useState(() => {
    const saved = readNumber("otterdrive:list-width");
    return saved !== null && saved >= 280 && saved <= 560 ? saved : 360;
  });
  const paneRef = useRef<HTMLDivElement>(null);

  const start = (event: ReactPointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;
    let frame = 0;
    const apply = () => {
      frame = 0;
      if (paneRef.current) paneRef.current.style.width = `${latest}px`;
    };
    const move = (moveEvent: PointerEvent) => {
      latest = Math.min(560, Math.max(280, startWidth + moveEvent.clientX - startX));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (frame) cancelAnimationFrame(frame);
      apply();
      delete document.body.dataset.resizing;
      setWidth(latest);
      try {
        window.localStorage.setItem("otterdrive:list-width", String(latest));
      } catch {
        /* Resizing still works when storage is unavailable. */
      }
    };
    document.body.dataset.resizing = "";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return { width, start, paneRef };
}

/**
 * Zero-width in the layout: panes meet on a tone change (or their own faint
 * divider), and the grab area is an invisible strip centered on the seam
 * that shows a hairline on hover.
 */
export function DocumentListResizer({
  onPointerDown,
  label,
}: {
  onPointerDown: (event: ReactPointerEvent) => void;
  label: string;
}) {
  return (
    <div className="relative z-20 w-0 shrink-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        onPointerDown={onPointerDown}
        className="group absolute inset-y-0 -left-[3px] flex w-1.5 cursor-col-resize justify-center"
      >
        <div className="w-px transition-colors group-hover:bg-input" />
      </div>
    </div>
  );
}
