export const changelogUrl = (version?: string | null) =>
  `https://otterware.app/mail/changelog/${version ? `#${version}` : ""}`;
