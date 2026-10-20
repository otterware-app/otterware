import type { ReactNode } from "react";
export { SettingsRow, SettingsSection } from "~/components/settings/settingsLayout";

/** A Drive settings page: a line about what it covers, then its sections. The breadcrumb names it. */
export function SettingsPageContainer({
  description,
  scope,
  action,
  children,
}: {
  description?: ReactNode;
  title?: ReactNode;
  scope?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {scope}
      {action ? <div className="flex justify-end px-3">{action}</div> : null}
      {description ? (
        <p className="px-3 text-sm text-muted-foreground sm:px-4">{description}</p>
      ) : null}
      {children}
    </>
  );
}
