import { Switch } from "~/components/ui/switch";
import { Input } from "~/components/ui/input";
import { RowSelect, SettingsRow, SettingsSection } from "./settings-ui";
import { searchableSetting } from "./settings-search";
import {
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
  type MailLayout,
  type MessageListStyle,
  type ReadingWidth,
} from "../reading-preferences";
export function ReadingRows() {
  const layout = useMailLayout();
  const style = useMessageListStyle();
  const width = useReadingWidth();
  const group = useInterfaceToggle(GROUP_MESSAGES_BY_DAY);
  const dim = useInterfaceToggle(DIM_READ_MESSAGES);
  const arrows = useInterfaceToggle(OPEN_MESSAGES_WITH_ARROWS);
  const delay = useInterfaceSetting(MARK_READ_DELAY);
  return (
    <SettingsSection title="Reading">
      <SettingsRow
        {...searchableSetting("mail-layout")}
        control={
          <RowSelect
            ariaLabel="Mail layout"
            value={layout}
            options={Object.entries(MAIL_LAYOUTS).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
            onValueChange={(value) => setMailLayout(value as MailLayout)}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("message-list-style")}
        control={
          <RowSelect
            ariaLabel="Message list style"
            value={style}
            options={Object.entries(MESSAGE_LIST_STYLES).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
            onValueChange={(value) => setMessageListStyle(value as MessageListStyle)}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("reading-width")}
        control={
          <RowSelect
            ariaLabel="Reading width"
            value={width}
            options={Object.entries(READING_WIDTHS).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
            onValueChange={(value) => setReadingWidth(value as ReadingWidth)}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("group-messages-by-day")}
        control={
          <Switch
            checked={group}
            onCheckedChange={(value) => setInterfaceToggle(GROUP_MESSAGES_BY_DAY, value)}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("dim-read-messages")}
        control={
          <Switch
            checked={dim}
            onCheckedChange={(value) => setInterfaceToggle(DIM_READ_MESSAGES, value)}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("open-messages-with-arrows")}
        control={
          <Switch
            checked={arrows}
            onCheckedChange={(value) => setInterfaceToggle(OPEN_MESSAGES_WITH_ARROWS, value)}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("mark-read-delay")}
        description="Milliseconds before keyboard navigation marks mail as read."
        control={
          <Input
            type="number"
            size="sm"
            min={0}
            max={5000}
            step={250}
            value={delay}
            onChange={(event) => setInterfaceSetting(MARK_READ_DELAY, Number(event.target.value))}
          />
        }
      />
    </SettingsSection>
  );
}
