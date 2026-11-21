/**
 * WEB-FEAT-092. The reminder card offered 1 day / 3 hours / 1 hour for every
 * upcoming event and toasted "You'll receive a reminder", even when
 * get_pending_reminders (20261115000103) would never return the row: the
 * window had already passed, or the event has no announced time and the
 * option is one of the hour-level ones.
 *
 * Times are in UTC. The cron runs at minute 0 of each hour.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const client = {
    rest: {},
    rpc(this: unknown, ...a: unknown[]) {
      if (this !== client) throw new TypeError("detached rpc");
      return rpc(...a);
    },
    functions: { invoke: vi.fn() },
  };
  return { supabase: client };
});
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "reader@example.com" }, isAuthenticated: true }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EventReminderSettings } from "@/components/EventReminderSettings";
import { reminderAvailability } from "@/lib/reminderAvailability";

function backend(reminders: Record<string, boolean> = {}) {
  rpc.mockImplementation((fn: string) => {
    if (fn === "get_user_reminders_for_event") {
      return Promise.resolve({ data: { authenticated: true, reminders }, error: null });
    }
    if (fn === "my_reminder_emails_unsubscribed") return Promise.resolve({ data: false, error: null });
    if (fn === "toggle_event_reminder") return Promise.resolve({ data: { success: true }, error: null });
    return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
  });
}

type Timing = { date: string; event_start_utc: string | null; time_tbd: boolean | null };

function renderCard(eventTiming?: Timing) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/events/e1"]}>
        <EventReminderSettings eventId="e1" eventTiming={eventTiming} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const box = (name: RegExp) => screen.getByRole("checkbox", { name });
const timed = (iso: string): Timing => ({ date: iso, event_start_utc: iso, time_tbd: false });
const at = (iso: string) => new Date(iso);

beforeEach(() => {
  rpc.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("reminderAvailability thresholds (WEB-FEAT-092)", () => {
  it("1_day: offered while the start is 23h or more past the next run", () => {
    // now 16:10Z, next run 17:00Z
    expect(reminderAvailability("1_day", timed("2026-11-16T16:00:00Z"), at("2026-11-15T16:10:00Z")).available).toBe(
      true,
    );
    expect(reminderAvailability("1_day", timed("2026-11-16T15:59:00Z"), at("2026-11-15T16:10:00Z"))).toEqual({
      available: false,
      reason: "too_late",
    });
  });

  it("3_hours: measured from the next run, not from now", () => {
    // 2h35m away now, but 1h45m away at the 17:00 run: never inside 2h30m-3h35m.
    expect(reminderAvailability("3_hours", timed("2026-11-15T18:45:00Z"), at("2026-11-15T16:10:00Z")).reason).toBe(
      "too_late",
    );
    expect(reminderAvailability("3_hours", timed("2026-11-15T19:30:00Z"), at("2026-11-15T16:10:00Z")).available).toBe(
      true,
    );
    expect(reminderAvailability("3_hours", timed("2026-11-15T19:29:00Z"), at("2026-11-15T16:10:00Z")).reason).toBe(
      "too_late",
    );
  });

  it("1_hour: needs 30 minutes between the next run and the start", () => {
    expect(reminderAvailability("1_hour", timed("2026-11-15T17:30:00Z"), at("2026-11-15T16:10:00Z")).available).toBe(
      true,
    );
    expect(reminderAvailability("1_hour", timed("2026-11-15T17:29:00Z"), at("2026-11-15T16:10:00Z")).reason).toBe(
      "too_late",
    );
  });

  it("a moment exactly on the hour counts as the next run", () => {
    expect(reminderAvailability("1_hour", timed("2026-11-15T16:30:00Z"), at("2026-11-15T16:00:00Z")).available).toBe(
      true,
    );
  });

  it("untimed events get no hour-level reminders, whether time_tbd or the 19:31:58 marker", () => {
    const now = at("2026-11-10T12:00:00Z");
    const tbd: Timing = { date: "2026-11-20T18:00:00Z", event_start_utc: null, time_tbd: true };
    // 19:31:58 Central (CST, UTC-6) is 01:31:58Z the next day.
    const marker: Timing = { date: "2026-11-21T01:31:58Z", event_start_utc: "2026-11-21T01:31:58Z", time_tbd: null };
    for (const e of [tbd, marker]) {
      expect(reminderAvailability("3_hours", e, now).reason).toBe("no_start_time");
      expect(reminderAvailability("1_hour", e, now).reason).toBe("no_start_time");
      expect(reminderAvailability("1_day", e, now).available).toBe(true);
    }
  });

  it("no start at all leaves every option available", () => {
    const none: Timing = { date: "", event_start_utc: null, time_tbd: null };
    expect(reminderAvailability("1_hour", none, at("2026-11-15T16:10:00Z")).available).toBe(true);
  });
});

describe("EventReminderSettings with event timing (WEB-FEAT-092)", () => {
  it("disables a passed 1-day option with a reason and keeps the others", async () => {
    vi.setSystemTime(at("2026-11-15T14:10:00Z"));
    backend();
    renderCard(timed("2026-11-16T00:30:00Z")); // 10h20m away

    await screen.findByRole("checkbox", { name: /1 day before/ });
    expect(box(/1 day before/)).toBeDisabled();
    expect(box(/1 day before/)).toHaveAccessibleDescription("Too close to the start");
    expect(box(/3 hours before/)).toBeEnabled();
    expect(box(/1 hour before/)).toBeEnabled();
  });

  it("disables 3h and 1h on an untimed event", async () => {
    vi.setSystemTime(at("2026-11-15T14:10:00Z"));
    backend();
    renderCard({ date: "2026-11-20T18:00:00Z", event_start_utc: null, time_tbd: true });

    await screen.findByRole("checkbox", { name: /1 day before/ });
    expect(box(/1 day before/)).toBeEnabled();
    expect(box(/3 hours before/)).toBeDisabled();
    expect(box(/1 hour before/)).toBeDisabled();
    expect(box(/1 hour before/)).toHaveAccessibleDescription("No start time listed");
  });

  it("does not call a saved reminder that can no longer fire Active, and lets it be removed", async () => {
    vi.setSystemTime(at("2026-11-15T14:10:00Z"));
    backend({ "1_day": true });
    renderCard(timed("2026-11-16T00:30:00Z"));

    expect(await screen.findByText("No longer scheduled")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText(/We'll send you email reminders/)).not.toBeInTheDocument();
    expect(box(/1 day before/)).toBeEnabled();

    fireEvent.click(box(/1 day before/));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("toggle_event_reminder", {
        p_event_id: "e1",
        p_reminder_type: "1_day",
        p_enabled: false,
      }),
    );
  });

  it("says a saved 1-hour reminder on an untimed event will not send", async () => {
    vi.setSystemTime(at("2026-11-15T14:10:00Z"));
    backend({ "1_hour": true });
    renderCard({ date: "2026-11-20T18:00:00Z", event_start_utc: null, time_tbd: true });

    expect(await screen.findByText("Won't send: no start time listed")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("still shows Active for a reminder that will fire", async () => {
    vi.setSystemTime(at("2026-11-15T14:10:00Z"));
    backend({ "3_hours": true });
    renderCard(timed("2026-11-15T20:00:00Z"));

    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/We'll send you email reminders/)).toBeInTheDocument();
  });

  it("offers every option when no timing is passed, as before", async () => {
    backend();
    renderCard();

    await screen.findByRole("checkbox", { name: /1 day before/ });
    for (const name of [/1 day before/, /3 hours before/, /1 hour before/]) expect(box(name)).toBeEnabled();
  });
});
