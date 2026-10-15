import { Badge } from "~/components/ui/badge";
import { HintTooltip as ImportedMailTooltip } from "./ui";
import { CSSProperties } from "react";
import { ChevronsRightIcon, FolderIcon, InboxIcon, XIcon } from "lucide-react";
import { GmailLabel } from "./types";

function tint(color: string): CSSProperties {
  return { "--label": color } as CSSProperties;
}

/** Hover-revealed remove control, after the name: the chip is see-through,
    so an overlay couldn't cover the text. */
function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <ImportedMailTooltip label={label}>
      <button
        type="button"
        aria-label={label}

        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="-me-1 hidden size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-foreground/15 group-hover:flex focus-visible:flex"
      >
        <XIcon className="size-2.5" strokeWidth={3} />
      </button>
    </ImportedMailTooltip>
  );
}

/** Gmail's category tabs, chipped in the reader header with Gmail's colors. */
const CATEGORY_CHIPS: Record<string, { name: string; bg: string }> = {
  CATEGORY_SOCIAL: { name: "Social", bg: "#1a73e8" },
  CATEGORY_PROMOTIONS: { name: "Promotions", bg: "#188038" },
  CATEGORY_UPDATES: { name: "Updates", bg: "#e37400" },
  CATEGORY_FORUMS: { name: "Forums", bg: "#7627bb" },
};

export function CategoryChip({
  id,
  onRemove,
}: {
  id: string;
  onRemove?: (() => void) | undefined;
}) {
  const meta = CATEGORY_CHIPS[id];
  if (!meta) return null;
  return (
    <Badge variant="label" size="sm" className="group max-w-32" style={tint(meta.bg)}>
      {meta.name}
      {onRemove ? <RemoveButton label={`Remove "${meta.name}"`} onRemove={onRemove} /> : null}
    </Badge>
  );
}

export function isCategoryLabelId(id: string): boolean {
  return id in CATEGORY_CHIPS;
}

/** Gmail's importance marker; `muted` for dense lists where most mail is "important". */
export function ImportantMarker({ muted }: { muted?: boolean | undefined }) {
  return (
    <ImportedMailTooltip label={"Marked important"}>
      <span aria-label="Important" className="shrink-0">
        <ChevronsRightIcon
          className={muted ? "size-3.5 text-muted-foreground/60" : "size-3.5"}
          strokeWidth={muted ? 2.5 : 3}
          style={muted ? undefined : { color: "#f4b400" }}
        />
      </span>
    </ImportedMailTooltip>
  );
}

/** "Still in the inbox" marker, shown when browsing non-inbox views.
    `onRemove` (reader header) reveals a hover ✕ that archives. */
export function InboxChip({
  selected: _selected,
  onRemove,
}: {
  selected?: boolean | undefined;
  onRemove?: (() => void) | undefined;
}) {
  return (
    <Badge variant="outline" size="sm" className="group max-w-32">
      <InboxIcon className="size-3" />
      Inbox
      {onRemove ? <RemoveButton label="Archive" onRemove={onRemove} /> : null}
    </Badge>
  );
}

/**
 * Chip for a label: tinted with the label's Gmail color, or a neutral outline
 * when the label has none. Selection only firms up the outline, since the
 * selected row is a quiet surface rather than a filled block.
 */
export function LabelChip({
  label,
  selected: _selected,
  onRemove,
}: {
  label: GmailLabel;
  selected?: boolean | undefined;
  onRemove?: (() => void) | undefined;
}) {
  const displayName = label.name.split("/").pop() ?? label.name;
  const remove = onRemove ? (
    <RemoveButton label={`Remove "${displayName}"`} onRemove={onRemove} />
  ) : null;
  const text = <span className="min-w-0 truncate">{displayName}</span>;
  if (label.color) {
    return (
      <Badge
        variant="label"
        size="sm"
        className="group max-w-32"
        style={tint(label.color.backgroundColor)}
      >
        {text}
        {remove}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" size="sm" className="group max-w-32">
      {text}
      {remove}
    </Badge>
  );
}

/** A project the conversation is in (reader header): opens it; × takes the conversation out. */
export function ProjectChip({
  name,
  onOpen,
  onRemove,
}: {
  name: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <ImportedMailTooltip label={`Open the project “${name}”`}>
      <Badge
        role="button"
        tabIndex={0}

        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        className="group max-w-40"
        variant="outline"
        size="sm"
      >
        <FolderIcon className="size-3 shrink-0" />
        <span className="truncate">{name}</span>
        <RemoveButton label={`Remove from “${name}”`} onRemove={onRemove} />
      </Badge>
    </ImportedMailTooltip>
  );
}
