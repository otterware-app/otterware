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
