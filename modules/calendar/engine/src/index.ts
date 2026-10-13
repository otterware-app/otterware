export { CalendarModule, makeCalendarModule } from "./CalendarModule.ts";
export { CalendarService } from "./CalendarService.ts";
export { GoogleAuth } from "./google/GoogleAuth.ts";
export type {
  GoogleConnectFlowEvent,
  GoogleAuthShape,
  GoogleIdentity,
  GoogleClientStatus,
} from "./google/GoogleAuth.ts";
export { makeGoogleCalendarClient } from "./google/GoogleCalendarClient.ts";
export { CalendarProviderError } from "./providers/CalendarProvider.ts";

export {
  CalendarAccountSession,
  accountSessionLayer,
  cloudCall,
} from "./CalendarAccountSession.ts";
export type { CalendarAccountCredential, CalendarCloudContext } from "./CalendarAccountSession.ts";
export * as AccountGoogleAuth from "./google/AccountGoogleAuth.ts";
