/**
 * Hands the iPhone app (native/mail-ios) what it shares with the other apps, as
 * JSON in its bundle: the color themes and the demo mailbox, both from
 * packages/shared. Run it after changing either:
 *
 *   pnpm ios:resources
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { DEMO_ACCOUNTS } from "../../../modules/mail/contracts/shared/src/demo-mailboxes.ts";
import {
  APP_THEMES,
  OTTER_DARK_THEME_COLORS,
  OTTER_LIGHT_THEME_COLORS,
  getThemeColorsForAppearance,
} from "../../../modules/mail/contracts/shared/src/theme-palettes.ts";

const root = NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "../../..");
const out = NodePath.join(root, "native/mail-ios/OtterMail/Resources");
NodeFS.mkdirSync(out, { recursive: true });

const themes = APP_THEMES.map((theme) => ({
  id: theme.id,
  label: theme.label,
  exact: theme.exact ?? false,
  monochrome: theme.monochrome ?? false,
  light: getThemeColorsForAppearance(theme, "light") ?? OTTER_LIGHT_THEME_COLORS,
  dark: getThemeColorsForAppearance(theme, "dark") ?? OTTER_DARK_THEME_COLORS,
}));

// Dates in the mail's text are fixed at export; the app places messages by `hoursAgo`.
const seededAt = Date.now();
const demo = DEMO_ACCOUNTS.map(({ threads, ...account }) => ({
  ...account,
  threads: threads(seededAt).map((thread) => ({
    ...thread,
    messages: thread.messages.map(({ attachments, html, ...message }) => ({
      ...message,
      // Inline images (`cid:`) go into the HTML itself; the app has no Gmail to fetch them from.
      html: (attachments ?? []).reduce(
        (body, a) =>
          a.contentId && body
            ? body.replaceAll(
                `cid:${a.contentId}`,
                `data:${a.mimeType};base64,${Buffer.from(a.content).toString("base64")}`,
              )
            : body,
        html,
      ),
      attachments: (attachments ?? [])
        .filter((a) => !a.contentId)
        .map((a) => ({ filename: a.filename, mimeType: a.mimeType, size: a.content.length })),
    })),
  })),
}));

const write = (name: string, value: unknown) => {
  NodeFS.writeFileSync(NodePath.join(out, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`Wrote native/mail-ios/OtterMail/Resources/${name}`);
};
write("Themes.json", themes);
write("DemoMailboxes.json", demo);
