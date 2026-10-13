import { MailSession } from "@otterware/mail-web";
const sessions = new Map<string, MailSession>();
export function mailSession(environmentId: string): MailSession {
  let session = sessions.get(environmentId);
  if (!session) {
    session = new MailSession();
    sessions.set(environmentId, session);
  }
  return session;
}
