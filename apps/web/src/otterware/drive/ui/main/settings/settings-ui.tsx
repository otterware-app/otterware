import type { ReactNode } from "react";
export { SettingsRow, SettingsSection } from "~/components/settings/settingsLayout";

/** A Drive settings page: a line about what it covers, then its sections. The breadcrumb names it. */
export function SettingsPageContainer({
  description,
  children,
}: {
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {description ? (
        <p className="px-3 text-sm text-muted-foreground sm:px-4">{description}</p>
      ) : null}
      {children}
    </>
  );
}
