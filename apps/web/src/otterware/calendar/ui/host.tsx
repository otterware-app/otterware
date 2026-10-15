import { useCalendarStore, setCalendarCache } from "./calendarStore";
import type {
  CalendarEnvironmentPreferences,
  CalendarReminderNotification,
  CalendarDirectory,
  CalendarSearchInput,
  CalendarSearchResult,
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
import { createContext, useContext, useEffect, type ReactNode } from "react";

/** Environment-specific transport and scope grants stay in the host adapter. */
export interface CalendarWebClient {
  environmentId: string | null;
  watchNotifications: (
    onNotification: (notification: CalendarReminderNotification) => void,
    onError: (message: string) => void,
  ) => () => void;
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
  search: (input: CalendarSearchInput) => Promise<CalendarSearchResult>;
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
  const state = useCalendarStore();
  return {
    directory: client.environmentId
      ? (state.caches[client.environmentId]?.directory ?? null)
      : null,
    canWrite: state.environment === client.environmentId && state.canWrite,
    error: state.environment === client.environmentId ? state.error : null,
  };
}
const noInstances: readonly CalendarEventInstance[] = [];
export function useCalendarWeeks(weeks: ReadonlyArray<string>) {
  const client = useCalendarClient();
  const state = useCalendarStore();
  const key = JSON.stringify(weeks);
  useEffect(() => {
    if (client.environmentId && weeks.length)
      setCalendarCache(client.environmentId, { weeks: JSON.parse(key) as string[] });
  }, [client.environmentId, key]);
  return {
    instances: client.environmentId
      ? (state.caches[client.environmentId]?.ranges[key] ?? noInstances)
      : noInstances,
    loading: state.loading,
    error: state.error,
  };
}
