import { MailSession } from "./content/host/surface";
const sessions = new Map<string, MailSession>();
export function mailSession(environmentId: string): MailSession {
  let session = sessions.get(environmentId);
  if (!session) {
    session = new MailSession(environmentId);
    sessions.set(environmentId, session);
  }
  return session;
}
