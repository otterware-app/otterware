import { Badge } from "~/components/ui/badge";
import { HintTooltip as ImportedMailTooltip } from "./ui";
import { ChevronsRightIcon, FolderIcon, InboxIcon, XIcon } from "lucide-react";
import { GmailLabel } from "./types";

const PILL =
  "group relative inline-flex h-5 w-fit max-w-32 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-transparent px-2 text-2xs font-medium leading-none text-muted-foreground";

function Dot({ color }: { color: string }) {
  return (
    <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
  );
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
    <span className={PILL}>
      <Dot color={meta.bg} />
      {meta.name}
      {onRemove ? <RemoveButton label={`Remove "${meta.name}"`} onRemove={onRemove} /> : null}
    </span>
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
  selected,
  onRemove,
}: {
  selected?: boolean | undefined;
  onRemove?: (() => void) | undefined;
}) {
  return (
    <span className={`${PILL} ${selected ? "border-foreground/20" : ""}`}>
      <InboxIcon className="size-3" />
      Inbox
      {onRemove ? <RemoveButton label="Archive" onRemove={onRemove} /> : null}
    </span>
  );
}

export function LabelChip({
  label,
  selected,
  onRemove,
}: {
  label: GmailLabel;
  selected?: boolean | undefined;
  onRemove?: (() => void) | undefined;
}) {
  const displayName = label.name.split("/").pop() ?? label.name;
  return (
    <span className={`${PILL} ${selected ? "border-foreground/20" : ""}`}>
      {label.color ? <Dot color={label.color.backgroundColor} /> : null}
      <span className="min-w-0 truncate">{displayName}</span>
      {onRemove ? <RemoveButton label={`Remove "${displayName}"`} onRemove={onRemove} /> : null}
    </span>
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
