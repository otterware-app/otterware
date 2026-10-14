import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import {
  SettingsRow as HostRow,
  SettingsSection as HostSection,
} from "~/components/settings/settingsLayout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";
import { Undo2Icon } from "lucide-react";
export { SettingsGroup } from "~/components/settings/SettingsGroup";
export {
  useSettingsSearchTarget,
  SettingsSearchTarget,
} from "~/components/settings/settingsLayout";
export const MailSettingScope = createContext<"account" | "environment" | "client">("account");
export function SettingsRow(props: ComponentProps<typeof HostRow>) {
  const inheritedScope = useContext(MailSettingScope);
  const scope = ["launch-at-login", "dock-badge", "default-mail-app"].includes(props.id ?? "")
    ? "client"
    : props.id === "mailbox-status"
      ? "environment"
      : inheritedScope;
  return (
    <HostRow
      {...props}
      status={
        <>
          {props.status}
          <span aria-label={`Scope: ${scope}`}>
            {scope === "client" ? "This device" : scope === "account" ? "Account" : "Environment"}
          </span>
        </>
      }
    />
  );
}
export function SettingsSection({
  description,
  ...props
}: ComponentProps<typeof HostSection> & { description?: ReactNode | undefined }) {
  return (
    <HostSection {...props}>
      {description ? (
        <p className="px-4 py-2 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {props.children}
    </HostSection>
  );
}
export function SettingsPageContainer({
  children,
  action,
}: {
  children?: ReactNode | undefined;
  title?: ReactNode | undefined;
  description?: ReactNode | undefined;
  action?: ReactNode | undefined;
  searchId?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div className="space-y-6">
      {action}
      {children}
    </div>
  );
}
export function RowSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
}: {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string | undefined;
  ariaLabel: string;
  className?: string | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger size="sm" aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder ?? "Choose…"} />
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
export function SettingResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-micro"
      aria-label={`Reset ${label} to default`}
      onClick={onClick}
    >
      <Undo2Icon />
    </Button>
  );
}
export const TextInput = Input;
/** Text input that commits on blur / Enter (settings write once, not per keystroke). */
export function DraftInput({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof TextInput>, "value" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [draftFor, setDraftFor] = useState(value);
  if (draftFor !== value) {
    setDraftFor(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  return (
    <TextInput
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

/** "5m ago". */
export function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
