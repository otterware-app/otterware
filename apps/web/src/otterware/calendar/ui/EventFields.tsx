import { Combobox } from "@base-ui/react/combobox";
import { Popover } from "@base-ui/react/popover";
import { ArrowLeftIcon, CalendarDaysIcon, XIcon } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import DOMPurify from "dompurify";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Calendar } from "~/components/ui/calendar";
import { civilDate, dayNumber, zonedDay, type DayNumber } from "@otterware/calendar-contracts/time";
import { formatTime, type HourFormat } from "./runtime/format";
import { isEmail, parseTimeText, parseEventDate } from "./runtime/eventEditor.logic";

/** The event surface owns its inline fields; framed settings inputs have different geometry. */
export function EventInput(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className="block h-6 w-full min-w-0 rounded-sm border-0 border-b border-transparent bg-transparent p-0 text-base leading-6 outline-none placeholder:text-muted-foreground focus-visible:text-primary aria-invalid:border-destructive sm:text-sm"
    />
  );
}

const QUARTER_HOURS = Array.from({ length: 96 }, (_, index) => index * 15);

export function EventTimeField({
  label,
  text,
  hourFormat,
  onChange,
  onCommit,
}: {
  label: string;
  text: string;
  hourFormat: HourFormat;
  onChange: (text: string) => void;
  onCommit: (minutes: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const display = (minutes: number) => formatTime(minutes * 60_000, "UTC", hourFormat);
  const commit = () => {
    const minutes = parseTimeText(text);
    if (minutes !== null) {
      onCommit(minutes);
      onChange(display(minutes));
    }
  };
  return (
    <Combobox.Root
      items={QUARTER_HOURS}
      filter={null}
      value={parseTimeText(text)}
      inputValue={text}
      open={open}
      onOpenChange={setOpen}
      openOnInputClick
      itemToStringLabel={display}
      onInputValueChange={onChange}
      onValueChange={(minutes) => {
        if (minutes !== null) {
          onChange(display(minutes));
          onCommit(minutes);
          setOpen(false);
        }
      }}
    >
      <Combobox.Input
        aria-label={label}
        aria-invalid={parseTimeText(text) === null}
        render={<EventInput />}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.currentTarget.getAttribute("aria-activedescendant")) {
            event.preventDefault();
            commit();
            setOpen(false);
          }
        }}
      />
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="z-[150]">
          <Combobox.Popup
            render={
              <div className="w-40 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg outline-none" />
            }
          >
            <Combobox.List
              render={<div className="max-h-40 overflow-y-auto overscroll-contain p-1" />}
            >
              {(minutes: number) => (
                <Combobox.Item
                  key={minutes}
                  value={minutes}
                  render={
                    <div className="flex h-7 cursor-pointer items-center rounded px-2 text-sm outline-none data-highlighted:bg-accent" />
                  }
                >
                  {display(minutes)}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

/** Civil dates never pass through UTC parsing, which shifts dates west of Greenwich. */
export function EventDateField({
  label,
  day,
  weekStartsOn,
  timeZone,
  onChange,
}: {
  label: string;
  day: DayNumber;
  weekStartsOn: number;
  timeZone: string;
  onChange: (day: DayNumber) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const date = civilDate(day);
  const selected = new Date(date.year, date.month - 1, date.day);
  const choose = (next: DayNumber) => {
    onChange(next);
    setOpen(false);
    setText("");
    setInvalid(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        render={
          <button
            type="button"
            className="flex h-6 w-full min-w-0 cursor-pointer items-center gap-1 rounded text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
          />
        }
      >
        <span className="truncate">
          {selected.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <CalendarDaysIcon className="ms-auto size-3.5 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <EventFieldPopup label={label}>
        <Calendar
          className="[--cell-size:--spacing(8)] sm:[--cell-size:--spacing(8)]"
          mode="single"
          selected={selected}
          defaultMonth={selected}
          weekStartsOn={weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6}
          onSelect={(next) => {
            if (next) choose(dayNumber(next.getFullYear(), next.getMonth() + 1, next.getDate()));
          }}
        />
        <div className="mt-1 border-t border-border px-2 pt-2">
          <EventInput
            aria-label={`Type ${label.toLowerCase()}`}
            placeholder="e.g. next Friday or YYYY-MM-DD"
            value={text}
            aria-invalid={invalid}
            onChange={(event) => {
              setText(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const next = parseEventDate(text, zonedDay(Date.now(), timeZone));
              if (next === null) setInvalid(true);
              else choose(next);
            }}
          />
          {invalid && (
            <p role="alert" className="pt-1 text-xs text-destructive">
              Use a date, today, tomorrow or a weekday.
            </p>
          )}
        </div>
      </EventFieldPopup>
    </Popover.Root>
  );
}

export function EventGuests({
  guests,
  text,
  onText,
  onChange,
}: {
  guests: ReadonlyArray<string>;
  text: string;
  onText: (value: string) => void;
  onChange: (value: ReadonlyArray<string>) => void;
}) {
  const pending = text
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const valid = pending.every(isEmail);
  const commit = () => {
    if (!valid || pending.length === 0) return;
    const known = new Set(guests.map((value) => value.toLowerCase()));
    onChange([
      ...guests,
      ...pending.filter((value) => {
        if (known.has(value.toLowerCase())) return false;
        known.add(value.toLowerCase());
        return true;
      }),
    ]);
    onText("");
  };
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {guests.map((email) => (
        <span
          key={email}
          className="inline-flex max-w-full items-center gap-1 rounded bg-foreground/6 py-0.5 ps-1.5 pe-0.5 text-xs"
        >
          <span className="truncate">{email}</span>
          <button
            type="button"
            aria-label={`Remove ${email}`}
            onClick={() => onChange(guests.filter((value) => value !== email))}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <div className="min-w-32 flex-1">
        <EventInput
          aria-label="Guests"
          placeholder="Add guests"
          value={text}
          aria-invalid={!valid || guests.length + pending.length > 200}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (
              event.key === "Enter" ||
              event.key === "," ||
              event.key === ";" ||
              (event.key === "Tab" && text.trim())
            ) {
              if (event.key !== "Tab") event.preventDefault();
              commit();
            } else if (event.key === "Backspace" && !text && guests.length) {
              event.preventDefault();
              onText(guests.at(-1)!);
              onChange(guests.slice(0, -1));
            }
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (!/[,;\n]/.test(pasted)) return;
            const values = pasted
              .split(/[,;\n]/)
              .map((value) => value.trim())
              .filter(Boolean);
            if (!values.every(isEmail)) return;
            event.preventDefault();
            onChange([...new Set([...guests, ...values])]);
          }}
        />
      </div>
      {guests.length + pending.length > 200 && (
        <p role="alert" className="w-full text-xs text-destructive">
          You can invite up to 200 guests.
        </p>
      )}
    </div>
  );
}

export function EventFieldPopup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover.Portal>
      <Popover.Positioner align="start" sideOffset={4} className="z-[130] max-w-[calc(100vw-16px)]">
        <Popover.Popup
          aria-label={label}
          render={
            <div className="max-h-(--available-height) overflow-y-auto overscroll-contain rounded-lg bg-popover p-2 text-popover-foreground shadow-lg outline-none" />
          }
        >
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

/** Provider HTML is inert, and description editing preserves markup until the user changes it. */
export function EventDescription({ value }: { value: string }) {
  if (!/<\/?[a-z][\s\S]*>/i.test(value))
    return (
      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground wrap-anywhere">
        {value}
      </p>
    );
  return (
    <div
      className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground wrap-anywhere [&_a]:text-primary [&_a]:underline [&_p]:my-1 [&_ul]:list-disc [&_ul]:ps-4 [&_ol]:list-decimal [&_ol]:ps-4"
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(value, {
          ALLOWED_TAGS: [
            "p",
            "br",
            "a",
            "strong",
            "b",
            "em",
            "i",
            "u",
            "s",
            "ul",
            "ol",
            "li",
            "blockquote",
          ],
          ALLOWED_ATTR: ["href", "title"],
        }),
      }}
    />
  );
}

export function DescriptionEditor({
  value,
  title,
  onChange,
  onBack,
}: {
  value: string;
  title: string;
  onChange: (value: string) => void;
  onBack: () => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false },
      }),
    ],
    content: /<\/?[a-z][\s\S]*>/i.test(value)
      ? DOMPurify.sanitize(value)
      : {
          type: "doc",
          content: value.split("\n").map((line) => ({
            type: "paragraph",
            ...(line ? { content: [{ type: "text", text: line }] } : {}),
          })),
        },
    autofocus: "end",
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Description",
        "aria-multiline": "true",
        class:
          "min-h-48 px-4 py-2 text-base leading-6 outline-none sm:text-sm [&_p]:my-1 [&_ul]:list-disc [&_ul]:ps-4 [&_ol]:list-decimal [&_ol]:ps-4 [&_a]:text-primary [&_a]:underline",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML()),
  });
  return (
    <div className="flex min-h-64 flex-col">
      <button
        type="button"
        className="flex h-11 min-w-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
        onClick={onBack}
      >
        <ArrowLeftIcon className="size-4 shrink-0" />
        <span className="truncate">{title || "New event"}</span>
      </button>
      <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto" />
      {value.length > 8192 && (
        <p role="alert" className="px-4 pb-2 text-xs text-destructive">
          Description is too long. Shorten it before saving.
        </p>
      )}
    </div>
  );
}

export function descriptionSummary(value: string) {
  if (!/<\/?[a-z][\s\S]*>/i.test(value)) return value;
  return (
    new DOMParser().parseFromString(DOMPurify.sanitize(value), "text/html").body.textContent ??
    "Edit description"
  );
}
