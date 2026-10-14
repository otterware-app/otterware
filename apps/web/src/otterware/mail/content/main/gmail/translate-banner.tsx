import { Button } from "~/components/ui/button";
import { mailBridge } from "../../host/bridge";
import { createContext, useContext, useState } from "react";
import { ChevronDownIcon, LanguagesIcon, LoaderCircleIcon } from "lucide-react";
import { GmailMessageDetail } from "./types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./menu";
import { IconBtn } from "./ui";
import {
  languageName,
  sameLanguage,
  TranslationUnavailableError,
  TRANSLATION_SETTINGS_URL,
  useMessageLanguage,
  useTranslatedBody,
  useTranslationSettings,
} from "./translation";

/**
 * Translation is per conversation, like Safari's page translation: switching
 * it on shows every message in a language the user doesn't read in `target`.
 */
export type ConversationTranslation = {
  on: boolean;
  /** Chosen language; null = the first language the user reads. */
  target: string | null;
  set: (next: { on: boolean; target: string | null }) => void;
};

export const ConversationTranslationContext = createContext<ConversationTranslation | null>(null);

/** The reader's conversation translation, or a message's own (draft editor). */
function useConversationTranslation(): ConversationTranslation {
  const shared = useContext(ConversationTranslationContext);
  const [local, setLocal] = useState<{ on: boolean; target: string | null }>({
    on: false,
    target: null,
  });
  return shared ?? { ...local, set: setLocal };
}

/** Whether a message is in a language the user doesn't read. */
export function useIsForeignMessage(
  accountId: string,
  detail: GmailMessageDetail | undefined,
): boolean {
  const { readLanguages } = useTranslationSettings();
  const language = useMessageLanguage(accountId, detail);
  return language != null && !readLanguages.some((l) => sameLanguage(l, language));
}

/**
 * A message's translation state: its language, the banner to show above it,
 * and the body to render — translated in place once ready, else the original.
 */
export function useMessageTranslation(accountId: string, detail: GmailMessageDetail | undefined) {
  const { readLanguages } = useTranslationSettings();
  const conversation = useConversationTranslation();
  const language = useMessageLanguage(accountId, detail);
  const foreign = language != null && !readLanguages.some((l) => sameLanguage(l, language));
  const target = conversation.target ?? readLanguages[0] ?? "en";
  const translating =
    conversation.on && foreign && language != null && !sameLanguage(language, target);
  const query = useTranslatedBody(accountId, detail, language, target, translating);
  const translated = translating ? query.data : undefined;

  const banner =
    foreign && language ? (
      <TranslateBanner
        language={language}
        target={target}
        readLanguages={readLanguages}
        translating={translating}
        pending={translating && query.isPending}
        error={translating ? query.error : null}
        onTranslate={(to) => conversation.set({ on: true, target: to })}
        onShowOriginal={() => conversation.set({ on: false, target: conversation.target })}
        onRetry={() => void query.refetch()}
      />
    ) : null;

  return {
    banner,
    bodyHtml: translated ? translated.bodyHtml : (detail?.bodyHtml ?? null),
    bodyText: translated ? translated.bodyText : (detail?.bodyText ?? null),
  };
}

/** The banner's actions: outline pills. */

function errorMessage(error: Error, from: string, to: string): string {
  if (error instanceof TranslationUnavailableError) {
    if (error.status === "notInstalled")
      return `Download ${from} and ${to} in System Settings to translate this message.`;
    if (error.status === "needsDownload")
      return `Chrome needs to download ${from} → ${to} first. Click Try Again to download it.`;
    if (error.status === "unsupported") return `This device can't translate ${from} to ${to}.`;
    return "Translating needs macOS 26 or later.";
  }
  return "Couldn't translate this message.";
}

function TranslateBanner({
  language,
  target,
  readLanguages,
  translating,
  pending,
  error,
  onTranslate,
  onShowOriginal,
  onRetry,
}: {
  language: string;
  target: string;
  readLanguages: string[];
  translating: boolean;
  pending: boolean;
  error: Error | null;
  onTranslate: (target: string) => void;
  onShowOriginal: () => void;
  onRetry: () => void;
}) {
  const from = languageName(language);
  const to = languageName(target);
  const otherTargets = readLanguages.filter(
    (l) => !sameLanguage(l, target) && !sameLanguage(l, language),
  );
  const notInstalled =
    error instanceof TranslationUnavailableError && error.status === "notInstalled";

  let text: string;
  if (!translating) text = `This message is in ${from}.`;
  else if (error) text = errorMessage(error, from, to);
  else if (pending) text = `Translating from ${from}…`;
  else text = `Translated from ${from} to ${to}.`;

  return (
    <div className="mb-4 flex min-h-11 items-center gap-2.5 rounded-2xl border border-border/60 bg-card py-1.5 pr-1.5 pl-3.5">
      {pending ? (
        <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <LanguagesIcon className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">{text}</span>
      {notInstalled ? (
        <Button
          type="button"
          onClick={() => void mailBridge.openExternal(TRANSLATION_SETTINGS_URL)}
          variant="outline"
          size="sm"
        >
          Open Settings
        </Button>
      ) : null}
      {translating && error ? (
        <Button variant="outline" size="sm" type="button" onClick={onRetry}>
          Try Again
        </Button>
      ) : null}
      {translating ? (
        <Button variant="outline" size="sm" type="button" onClick={onShowOriginal}>
          Show Original
        </Button>
      ) : (
        <Button type="button" onClick={() => onTranslate(target)} variant="outline" size="sm">
          Translate to {to}
        </Button>
      )}
      {otherTargets.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconBtn label="Translate to another language">
              <ChevronDownIcon className="size-4" />
            </IconBtn>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {otherTargets.map((code) => (
              <DropdownMenuItem key={code} onSelect={() => onTranslate(code)}>
                Translate to {languageName(code)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
