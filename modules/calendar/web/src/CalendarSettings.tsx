import { useEffect, useRef, useState } from "react";
import type { CalendarId, GoogleConnectState } from "@otterware/calendar-contracts";
import { useCalendarClient, useCalendarDirectory } from "./host.tsx";
import "./calendar.css";

export default function CalendarSettings() {
  const client = useCalendarClient();
  const { directory, error: directoryError, canWrite } = useCalendarDirectory();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [flow, setFlow] = useState<GoogleConnectState | null>(null);
  const [callback, setCallback] = useState("");
  const cancelFlow = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelFlow.current?.(), []);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Calendar could not save that setting.");
    } finally {
      setBusy(false);
    }
  };
  const connect = () => {
    cancelFlow.current?.();
    setError(null);
    setFlow(null);
    cancelFlow.current = client.connect(
      (state) => setFlow(state),
      (message) => setError(message),
    );
  };
  return (
    <div className="calendar-module">
      <main className="calendar-settings">
        <h1>Calendar settings</h1>
        {(error ?? directoryError) && (
          <p role="alert" className="calendar-error">
            {error ?? directoryError}
          </p>
        )}
        <section>
          <h2>Google accounts</h2>
          {directory?.accounts.map((account) => (
            <div className="calendar-settings-row" key={account.accountId}>
              <span>
                {account.email} · {account.status}
              </span>
              <button
                type="button"
                disabled={!canWrite || busy}
                onClick={() => void run(() => client.removeAccount(account.accountId))}
              >
                Disconnect
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={!canWrite || busy || !directory?.google.configured}
            onClick={connect}
          >
            Connect Google account
          </button>
          {flow?._tag === "waiting" && (
            <div>
              <p>
                Open Google sign-in. If the browser is on another machine, paste its final loopback
                address here.
              </p>
              <a href={flow.authorizationUrl} target="_blank" rel="noreferrer">
                Open Google sign-in
              </a>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() => client.completeConnect(flow.flowId, callback));
                }}
              >
                <label>
                  Callback address
                  <input
                    value={callback}
                    onChange={(event) => setCallback(event.target.value)}
                    required
                  />
                </label>
                <button type="submit" disabled={!canWrite || busy}>
                  Finish connection
                </button>
              </form>
            </div>
          )}
          {flow?._tag === "succeeded" && <p role="status">Connected {flow.email}.</p>}
          {flow?._tag === "failed" && <p role="alert">{flow.message}</p>}
          {flow && (
            <button
              type="button"
              onClick={() => {
                cancelFlow.current?.();
                cancelFlow.current = null;
                setFlow(null);
              }}
            >
              Close sign-in
            </button>
          )}
        </section>
        <section>
          <h2>Local Google connection</h2>
          <p>Use a Google Desktop app OAuth client for accounts connected to this environment.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await client.setClient({ clientId, clientSecret });
                setClientSecret("");
              });
            }}
          >
            <label>
              Client ID
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <label>
              Client secret
              <input
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button type="submit" disabled={!canWrite || busy}>
              Save client
            </button>{" "}
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() => void run(client.clearClient)}
            >
              Clear client
            </button>
          </form>
        </section>
        {directory && (
          <section>
            <h2>Preferences · Account</h2>
            <label>
              Default calendar
              <select
                disabled={!canWrite || busy}
                value={directory.preferences.defaultCalendarId ?? ""}
                onChange={(event) =>
                  void run(() =>
                    client.preferences({
                      defaultCalendarId: event.target.value
                        ? (event.target.value as CalendarId)
                        : null,
                    }),
                  )
                }
              >
                <option value="">First writable calendar</option>
                {directory.calendars
                  .filter(
                    (calendar) =>
                      calendar.accessRole === "owner" || calendar.accessRole === "writer",
                  )
                  .map((calendar) => (
                    <option key={calendar.calendarId} value={calendar.calendarId}>
                      {calendar.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Week starts on
              <select
                disabled={!canWrite || busy}
                value={directory.preferences.weekStartsOn}
                onChange={(event) =>
                  void run(() => client.preferences({ weekStartsOn: Number(event.target.value) }))
                }
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={6}>Saturday</option>
              </select>
            </label>
            <label>
              Time zone
              <input
                defaultValue={directory.preferences.timeZone ?? ""}
                placeholder="Follow this device"
                disabled={!canWrite || busy}
                onBlur={(event) => {
                  const timeZone = event.target.value.trim() || null;
                  if (timeZone !== directory.preferences.timeZone)
                    void run(() => client.preferences({ timeZone }));
                }}
              />
            </label>
            <label>
              Hour format
              <select
                disabled={!canWrite || busy}
                value={directory.preferences.hourFormat}
                onChange={(event) =>
                  void run(() =>
                    client.preferences({
                      hourFormat: event.target.value as "12" | "24" | "locale",
                    }),
                  )
                }
              >
                <option value="locale">Automatic</option>
                <option value="12">12-hour</option>
                <option value="24">24-hour</option>
              </select>
            </label>
            <label>
              Default event length (minutes)
              <input
                type="number"
                min={5}
                max={1440}
                defaultValue={directory.preferences.defaultEventMinutes}
                disabled={!canWrite || busy}
                onBlur={(event) => {
                  const minutes = Number(event.target.value);
                  if (minutes !== directory.preferences.defaultEventMinutes)
                    void run(() => client.preferences({ defaultEventMinutes: minutes }));
                }}
              />
            </label>
          </section>
        )}
        {directory && (
          <section>
            <h2>Sync window · Environment</h2>
            <p>
              The environment stores its own calendar cache. Weeks you open beyond this window are
              loaded as needed.
            </p>
            <label>
              Past weeks
              <input
                type="number"
                min={1}
                max={104}
                defaultValue={directory.environmentPreferences.syncWindow.pastWeeks}
                disabled={!canWrite || busy}
                onBlur={(event) => {
                  const pastWeeks = Number(event.target.value);
                  if (pastWeeks !== directory.environmentPreferences.syncWindow.pastWeeks)
                    void run(() =>
                      client.environmentPreferences({
                        syncWindow: { ...directory.environmentPreferences.syncWindow, pastWeeks },
                      }),
                    );
                }}
              />
            </label>
            <label>
              Future weeks
              <input
                type="number"
                min={1}
                max={156}
                defaultValue={directory.environmentPreferences.syncWindow.futureWeeks}
                disabled={!canWrite || busy}
                onBlur={(event) => {
                  const futureWeeks = Number(event.target.value);
                  if (futureWeeks !== directory.environmentPreferences.syncWindow.futureWeeks)
                    void run(() =>
                      client.environmentPreferences({
                        syncWindow: { ...directory.environmentPreferences.syncWindow, futureWeeks },
                      }),
                    );
                }}
              />
            </label>
          </section>
        )}
        <section>
          <h2>Demo calendars</h2>
          <p>Try calendar views with local sample events.</p>
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() => void run(client.addDemo)}
          >
            Add demo calendars
          </button>
        </section>
      </main>
    </div>
  );
}
