import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";
import { SettingsSlider } from "~/otterware/settings/SettingsSlider";
import { SettingsTilePicker } from "~/otterware/settings/SettingsTilePicker";
import { RowSelect, SettingResetButton, SettingsRow, SettingsSection } from "./settings-ui";
import { searchableSetting } from "./settings-search";
import {
  DEFAULT_MAIL_LAYOUT,
  DEFAULT_MESSAGE_LIST_STYLE,
  DEFAULT_READING_WIDTH,
  MAIL_LAYOUTS,
  MESSAGE_LIST_STYLES,
  READING_WIDTHS,
  GROUP_MESSAGES_BY_DAY,
  DIM_READ_MESSAGES,
  OPEN_MESSAGES_WITH_ARROWS,
  MARK_READ_DELAY,
  useMailLayout,
  useMessageListStyle,
  useReadingWidth,
  useInterfaceToggle,
  useInterfaceSetting,
  setMailLayout,
  setMessageListStyle,
  setReadingWidth,
  setInterfaceToggle,
  setInterfaceSetting,
  type InterfaceToggle,
  type MailLayout,
  type MessageListStyle,
  type ReadingWidth,
} from "../reading-preferences";

const bar = "block h-1 rounded-full";

/** A miniature of the mail window in one layout: rail, list, and where a message opens. */
function MailLayoutPreview({ layout }: { layout: MailLayout }) {
  const split = layout === "split";
  return (
    <span className="absolute inset-0 flex">
      <span className="flex w-1/5 shrink-0 flex-col gap-2 border-r border-border/70 bg-sidebar p-2 pt-4">
        <span className="h-2 rounded-sm bg-sidebar-row-active" />
        <span className={cn(bar, "w-4/5 bg-muted-foreground/25")} />
        <span className={cn(bar, "w-3/5 bg-muted-foreground/25")} />
        <span className={cn(bar, "w-4/5 bg-muted-foreground/25")} />
      </span>
      <span className={cn("flex flex-col", split ? "w-1/3 border-r border-border/70" : "flex-1")}>
        <span className="flex h-5 shrink-0 items-center border-b border-border/60 px-2">
          <span className={cn(bar, "w-8 bg-muted-foreground/40")} />
        </span>
        {[0, 1, 2, 3].map((row) => (
          <span
            key={row}
            className={cn(
              "flex gap-1.5 border-b border-border/40 px-2 py-1.5",
              split ? "flex-col" : "items-center",
              row === 0 && split && "bg-sidebar-row-active",
            )}
          >
            <span className={cn(bar, "bg-foreground/40", split ? "w-3/5" : "w-1/5")} />
            <span className={cn(bar, "bg-muted-foreground/25", split ? "w-4/5" : "flex-1")} />
          </span>
        ))}
      </span>
      {split ? (
        <span className="flex min-w-0 flex-1 flex-col gap-2 p-2 pt-4">
          <span className="block h-1.5 w-4/5 rounded-full bg-foreground/50" />
          <span className={cn(bar, "mt-1 w-3/5 bg-muted-foreground/30")} />
          <span className={cn(bar, "w-full bg-muted-foreground/20")} />
          <span className={cn(bar, "w-4/5 bg-muted-foreground/20")} />
        </span>
      ) : null}
      {layout === "floating" ? (
        <span className="absolute inset-0 flex items-end justify-end p-1.5">
          <span className="flex h-16 w-3/5 flex-col overflow-hidden rounded-md border border-border bg-background shadow-lg">
            <span className="flex h-5 shrink-0 items-center justify-between border-b border-border/60 px-2">
              <span className={cn(bar, "w-2/5 bg-foreground/50")} />
              <span className="text-3xs leading-none text-muted-foreground">×</span>
            </span>
            <span className="flex flex-col gap-1.5 p-2">
              <span className={cn(bar, "w-full bg-muted-foreground/25")} />
              <span className={cn(bar, "w-4/5 bg-muted-foreground/25")} />
            </span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

const SAMPLE_MESSAGES = [
  { sender: "Alex Morgan", subject: "Weekend plans", snippet: "How about Saturday?" },
  { sender: "Jamie Lee", subject: "A little update", snippet: "Here's what I've been working on." },
];

/** Two sample rows, separated the way the style separates the message list. */
function MessageListStylePreview({ style }: { style: MessageListStyle }) {
  return (
    <span className="absolute inset-0 flex flex-col bg-sidebar">
      {SAMPLE_MESSAGES.map(({ sender, subject, snippet }) => (
        <span
          key={sender}
          className={cn(
            "flex min-w-0 flex-col px-3 text-2xs leading-tight",
            style === "dividers" ? "border-b border-border/70 py-1.5" : "py-1",
          )}
        >
          <span className="truncate font-medium text-foreground">{sender}</span>
          <span className="truncate text-foreground/90">{subject}</span>
          <span className="truncate text-muted-foreground/75">{snippet}</span>
        </span>
      ))}
    </span>
  );
}

function ToggleRow({
  id,
  toggle,
  resetLabel,
  description,
}: {
  id: string;
  toggle: InterfaceToggle;
  resetLabel: string;
  description: string;
}) {
  const value = useInterfaceToggle(toggle);
  const setting = searchableSetting(id);
  return (
    <SettingsRow
      {...setting}
      description={description}
      resetAction={
        value !== toggle.defaultValue ? (
          <SettingResetButton
            label={resetLabel}
            onClick={() => setInterfaceToggle(toggle, toggle.defaultValue)}
          />
        ) : null
      }
      control={
        <Switch
          aria-label={setting.title}
          checked={value}
          onCheckedChange={(next) => setInterfaceToggle(toggle, next)}
        />
      }
    />
  );
}

/** Mail › Appearance: how mail is laid out and read (Otter Mail's Appearance). */
export function AppearanceRows() {
  const layout = useMailLayout();
  const style = useMessageListStyle();
  const width = useReadingWidth();
  const delay = useInterfaceSetting(MARK_READ_DELAY);
  return (
    <>
      <SettingsSection
        {...searchableSetting("mail-layout")}
        variant="plain"
        headerAction={
          layout !== DEFAULT_MAIL_LAYOUT ? (
            <SettingResetButton
              label="mail layout"
              onClick={() => setMailLayout(DEFAULT_MAIL_LAYOUT)}
            />
          ) : null
        }
      >
        <SettingsTilePicker
          ariaLabel="Mail layout"
          value={layout}
          onValueChange={setMailLayout}
          options={(Object.keys(MAIL_LAYOUTS) as MailLayout[]).map((value) => ({
            value,
            label: MAIL_LAYOUTS[value].label,
            description: MAIL_LAYOUTS[value].description,
            preview: <MailLayoutPreview layout={value} />,
          }))}
        />
      </SettingsSection>
      <SettingsSection
        {...searchableSetting("message-list-style")}
        variant="plain"
        headerAction={
          style !== DEFAULT_MESSAGE_LIST_STYLE ? (
            <SettingResetButton
              label="message list style"
              onClick={() => setMessageListStyle(DEFAULT_MESSAGE_LIST_STYLE)}
            />
          ) : null
        }
      >
        <SettingsTilePicker
          ariaLabel="Message list style"
          value={style}
          onValueChange={setMessageListStyle}
          options={(Object.keys(MESSAGE_LIST_STYLES) as MessageListStyle[]).map((value) => ({
            value,
            label: MESSAGE_LIST_STYLES[value].label,
            description: MESSAGE_LIST_STYLES[value].description,
            preview: <MessageListStylePreview style={value} />,
          }))}
        />
      </SettingsSection>
      <SettingsSection title="Message list">
        <ToggleRow
          id="group-messages-by-day"
          toggle={GROUP_MESSAGES_BY_DAY}
          resetLabel="group messages by day"
          description="Separate messages by day. Click a day heading to collapse or expand it."
        />
        <ToggleRow
          id="dim-read-messages"
          toggle={DIM_READ_MESSAGES}
          resetLabel="dim read messages"
          description="Give read messages a muted background so unread mail stands out."
        />
      </SettingsSection>
      <SettingsSection title="Reading">
        <ToggleRow
          id="open-messages-with-arrows"
          toggle={OPEN_MESSAGES_WITH_ARROWS}
          resetLabel="open messages with arrow keys"
          description="When no email is open, arrows and J/K open messages as you browse. Turn off to highlight rows, then press Enter or click to open."
        />
        <SettingsRow
          {...searchableSetting("mark-read-delay")}
          description="How long to wait before marking an email read when browsing with the keyboard. Clicking or pressing Enter marks it read immediately."
          resetAction={
            delay !== MARK_READ_DELAY.defaultValue ? (
              <SettingResetButton
                label="mark as read delay"
                onClick={() => setInterfaceSetting(MARK_READ_DELAY, MARK_READ_DELAY.defaultValue)}
              />
            ) : null
          }
          control={
            <SettingsSlider
              id="mark-read-delay-slider"
              ariaLabel="Mark as read delay"
              value={delay}
              valueLabel={`${delay / 1000} s`}
              min={MARK_READ_DELAY.min}
              max={MARK_READ_DELAY.max}
              step={MARK_READ_DELAY.step}
              onValueChange={(value) => setInterfaceSetting(MARK_READ_DELAY, value)}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("reading-width")}
          description="How wide emails and threads can grow on large screens."
          resetAction={
            width !== DEFAULT_READING_WIDTH ? (
              <SettingResetButton
                label="reading width"
                onClick={() => setReadingWidth(DEFAULT_READING_WIDTH)}
              />
            ) : null
          }
          control={
            <RowSelect
              ariaLabel="Reading width"
              value={width}
              options={(Object.keys(READING_WIDTHS) as ReadingWidth[]).map((value) => ({
                value,
                label: READING_WIDTHS[value].label,
              }))}
              onValueChange={(value) => setReadingWidth(value as ReadingWidth)}
            />
          }
        />
      </SettingsSection>
    </>
  );
}
