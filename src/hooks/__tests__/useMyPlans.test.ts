import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The hook module imports the client and auth at load time; the pure helpers
// under test touch neither.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));

import {
  buildWeek,
  eventDay,
  groupReminders,
  pickPast,
  pickSavedEvents,
  pickUpcoming,
  type AttendanceRow,
  type PlanEvent,
  type ReminderEvent,
  type ReminderRow,
} from "@/hooks/useMyPlans";

/**
 * Account plan WP3 item 1. Two things this file pins:
 *   1. "Today" is the Central calendar day. At 8:30pm CDT on Sep 25 the UTC
 *      date is already Sep 26, which is how /my-events used to drop tonight's
 *      7:30pm show from Upcoming and file it nowhere.
 *   2. The week view is one row per event, grouped by Central day, with every
 *      reason it is there, and nothing outside today..today+6.
 */

// 2026-09-25 20:30 CDT.
const NOW = new Date("2026-09-26T01:30:00Z");

function ev(id: string, utc: string, title = `Event ${id}`): PlanEvent {
  return {
    id,
    title,
    date: utc,
    event_start_utc: utc,
    event_start_local: null,
    venue: null,
    location: null,
    category: null,
    image_url: null,
    price: null,
  };
}

function att(event: PlanEvent | null, status = "going"): AttendanceRow {
  return { event_id: event?.id ?? "gone", status, created_at: "2026-09-01T00:00:00Z", events: event };
}

describe("Central day boundary", () => {
  // 7:30pm CDT Sep 25 = 00:30Z Sep 26.
  const tonight = ev("tonight", "2026-09-26T00:30:00Z");
  // 11pm CDT Sep 24 = 04:00Z Sep 25: a UTC "today" but a Central yesterday.
  const lastNight = ev("last-night", "2026-09-25T04:00:00Z");

  it("puts an event on its Central day, not its UTC day", () => {
    expect(eventDay(tonight)).toBe("2026-09-25");
    expect(eventDay(lastNight)).toBe("2026-09-24");
  });

  it("keeps tonight's show on Upcoming after 7pm Central", () => {
    const upcoming = pickUpcoming([att(tonight), att(lastNight)], NOW);
    expect(upcoming.map((p) => p.event.id)).toEqual(["tonight"]);
  });

  it("files last night's show under Past, and not tonight's", () => {
    const past = pickPast([att(tonight), att(lastNight)], NOW);
    expect(past.map((p) => p.event.id)).toEqual(["last-night"]);
  });

  it("uses the legacy date column when event_start_utc is empty", () => {
    const legacy = { ...ev("legacy", "2026-09-26T00:30:00Z"), event_start_utc: null };
    expect(eventDay(legacy)).toBe("2026-09-25");
  });
});

describe("null embeds and statuses", () => {
  it("skips rows whose event did not come back", () => {
    expect(pickUpcoming([att(null)], NOW)).toEqual([]);
    expect(pickPast([att(null)], NOW)).toEqual([]);
    const reminder: ReminderRow = { id: "r", reminder_type: "1_day", created_at: "", events: null };
    expect(groupReminders([reminder], NOW)).toEqual([]);
    expect(pickSavedEvents([{ event_id: "x", created_at: "", events: null }], NOW)).toEqual([]);
  });

  it("ignores statuses that are not going or interested", () => {
    const later = ev("later", "2026-09-28T18:00:00Z");
    expect(pickUpcoming([att(later, "not_going"), att(later, "maybe")], NOW)).toEqual([]);
  });
});

describe("Past takes 20 events after the date filter", () => {
  it("sorts by event date, newest first, then slices", () => {
    const rows: AttendanceRow[] = [];
    for (let i = 1; i <= 25; i += 1) {
      const day = String(i).padStart(2, "0");
      rows.push(att(ev(`p${day}`, `2026-08-${day}T18:00:00Z`)));
    }
    // A future row mixed in must not use up a slot.
    rows.push(att(ev("future", "2026-10-01T18:00:00Z")));
    const past = pickPast(rows.reverse(), NOW);
    expect(past).toHaveLength(20);
    expect(past[0].event.id).toBe("p25");
    expect(past[19].event.id).toBe("p06");
    expect(past.some((p) => p.event.id === "future")).toBe(false);
  });
});

describe("reminders", () => {
  it("groups several reminder types on one event", () => {
    const show = ev("show", "2026-09-27T01:00:00Z");
    const rows: ReminderRow[] = [
      { id: "a", reminder_type: "1_day", created_at: "", events: show },
      { id: "b", reminder_type: "1_hour", created_at: "", events: show },
    ];
    const grouped = groupReminders(rows, NOW);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].reminderTypes).toEqual(["1_day", "1_hour"]);
  });
});

/**
 * WEB-FEAT-099. get_pending_reminders (20261115000141) skips an event that is
 * hidden or archived, so a pending reminder on one will not be emailed. My
 * Plans and Your Week must not list it as a reminder that is set.
 */
describe("reminders on unpublished events", () => {
  const show = ev("show", "2026-09-27T01:00:00Z");
  const hidden: ReminderEvent = { ...ev("hidden", "2026-09-27T02:00:00Z"), is_hidden: true, archived_at: null };
  const archived: ReminderEvent = {
    ...ev("archived", "2026-09-27T03:00:00Z"),
    is_hidden: false,
    archived_at: "2026-09-20T00:00:00Z",
  };
  const listed: ReminderEvent = { ...show, is_hidden: false, archived_at: null };

  const rows: ReminderRow[] = [
    { id: "h", reminder_type: "3_hours", created_at: "", events: hidden },
    { id: "a", reminder_type: "1_day", created_at: "", events: archived },
    { id: "l", reminder_type: "1_hour", created_at: "", events: listed },
  ];

  it("leaves out a reminder on a hidden event", () => {
    const grouped = groupReminders(rows, NOW);
    expect(grouped.map((p) => p.event.id)).not.toContain("hidden");
  });

  it("leaves out a reminder on an archived event", () => {
    expect(groupReminders(rows, NOW).map((p) => p.event.id)).not.toContain("archived");
  });

  it("keeps a listed event and does not leak the switches into the plan", () => {
    const grouped = groupReminders(rows, NOW);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].event).toEqual(show);
  });

  it("keeps a row whose switches were not read (null is not hidden)", () => {
    const unread: ReminderEvent = { ...show, is_hidden: null };
    expect(groupReminders([{ id: "u", reminder_type: "1_day", created_at: "", events: unread }], NOW)).toHaveLength(1);
  });

  it("is absent from Your Week", () => {
    const week = buildWeek({ upcoming: [], saved: [], reminders: groupReminders(rows, NOW) }, NOW);
    const ids = week.flatMap((d) => d.items.map((i) => i.event.id));
    expect(ids).toEqual(["show"]);
  });

  it("asks PostgREST for both switches on the reminder read", () => {
    const src = readFileSync(resolve(__dirname, "../useMyPlans.ts"), "utf8");
    expect(src).toMatch(/REMINDER_EVENT_COLUMNS = `\$\{PLAN_EVENT_COLUMNS\}, is_hidden, archived_at`/);
    expect(src).toMatch(/from\("user_event_reminders"\)\s*\.select\(`[^`]*events!inner\(\$\{REMINDER_EVENT_COLUMNS\}\)`\)/);
  });
});

describe("buildWeek", () => {
  const tonight = ev("tonight", "2026-09-26T00:30:00Z"); // Fri Sep 25 Central
  const sunday = ev("sunday", "2026-09-27T17:00:00Z"); // Sun Sep 27
  const lastDay = ev("last-day", "2026-10-02T02:00:00Z"); // Thu Oct 1, 9pm CDT
  const tooFar = ev("too-far", "2026-10-02T17:00:00Z"); // Fri Oct 2

  const week = buildWeek(
    {
      upcoming: pickUpcoming([att(tonight, "going"), att(tooFar, "interested")], NOW),
      saved: pickSavedEvents(
        [
          { event_id: "tonight", created_at: "", events: tonight },
          { event_id: "sunday", created_at: "", events: sunday },
          { event_id: "last-day", created_at: "", events: lastDay },
        ],
        NOW,
      ),
      reminders: groupReminders(
        [{ id: "r1", reminder_type: "1_day", created_at: "", events: tonight }],
        NOW,
      ),
    },
    NOW,
  );

  it("covers today through today + 6 in Central, and nothing after", () => {
    expect(week.map((d) => d.day)).toEqual(["2026-09-25", "2026-09-27", "2026-10-01"]);
  });

  it("merges one event's reasons into a single row", () => {
    const today = week[0];
    expect(today.items).toHaveLength(1);
    expect(today.items[0].reasons).toEqual(["going", "saved", "reminder"]);
    expect(today.items[0].reminderTypes).toEqual(["1_day"]);
  });

  it("is empty when nothing falls in the window", () => {
    expect(buildWeek({ upcoming: [], saved: [], reminders: [] }, NOW)).toEqual([]);
  });
});
