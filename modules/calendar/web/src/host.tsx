import type {
  CalendarEnvironmentPreferences,
  CalendarDirectory,
  CalendarEventDetails,
  CalendarEventInstance,
  CalendarCreateEventInput,
  CalendarUpdateEventInput,
  CalendarDeleteEventInput,
  CalendarMutationResult,
  CalendarApplyChangesInput,
  CalendarPreferencesPatch,
  CalendarUpdateCalendarInput,
  GoogleConnectState,
  GoogleClientInput,
  GoogleConnectInput,
} from "@otterware/calendar-contracts";
import { createContext, useContext, type ReactNode } from "react";

/** Environment-specific transport and scope grants stay in the host adapter. */
export interface CalendarWebClient {
  useDirectory: () => {
    directory: CalendarDirectory | null;
    error: string | null;
    canWrite: boolean;
  };
  useWeeks: (weeks: ReadonlyArray<string>) => {
    instances: ReadonlyArray<CalendarEventInstance>;
    loading: boolean;
    error: string | null;
  };
  getEvent: (calendarId: string, eventId: string) => Promise<CalendarEventDetails>;
  create: (input: CalendarCreateEventInput) => Promise<CalendarMutationResult>;
  update: (input: CalendarUpdateEventInput) => Promise<CalendarMutationResult>;
  delete: (input: CalendarDeleteEventInput) => Promise<CalendarMutationResult>;
  undo: (input: CalendarApplyChangesInput) => Promise<CalendarMutationResult>;
  respond: (input: {
    calendarId: CalendarEventDetails["calendarId"];
    eventId: string;
    response: "accepted" | "declined" | "tentative";
  }) => Promise<CalendarMutationResult>;
  environmentPreferences: (input: CalendarEnvironmentPreferences) => Promise<void>;
  preferences: (input: CalendarPreferencesPatch) => Promise<void>;
  calendar: (input: CalendarUpdateCalendarInput) => Promise<void>;
  sync: () => Promise<void>;
  addDemo: () => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  setClient: (input: GoogleClientInput) => Promise<void>;
  clearClient: () => Promise<void>;
  connect: (
    input: GoogleConnectInput,
    onState: (state: GoogleConnectState) => void,
    onError: (message: string) => void,
  ) => () => void;
  completeConnect: (flowId: string, callbackUrl: string) => Promise<void>;
}
const CalendarHost = createContext<CalendarWebClient | null>(null);
export const CalendarClientProvider = ({
  client,
  children,
}: {
  client: CalendarWebClient;
  children: ReactNode;
}) => <CalendarHost.Provider value={client}>{children}</CalendarHost.Provider>;
export function useCalendarClient() {
  const client = useContext(CalendarHost);
  if (client === null) throw new Error("Calendar needs the environment adapter.");
  return client;
}

export function useCalendarDirectory() {
  const client = useCalendarClient();
  // eslint-disable-next-line react/hooks -- The host is stable for this provider's lifetime and supplies the same hook shape.
  return client.useDirectory();
}
export function useCalendarWeeks(weeks: ReadonlyArray<string>) {
  const client = useCalendarClient();
  // eslint-disable-next-line react/hooks -- The host is stable for this provider's lifetime and supplies the same hook shape.
  return client.useWeeks(weeks);
}
