import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import {
  centralWallClock,
  clockMinutes,
  dateOnlySpanDays,
  isDateOnly,
  parseDateOnly,
  tripWindowProblem,
} from "@/lib/dateOnly";
import { buildTripICS } from "@/lib/tripCalendar";
import type { TripPlan, TripPlanItem } from "@/hooks/useTripPlanner";

// plan-stay WP1 item 1. These hold in any TZ; run with TZ=America/Chicago to
// reproduce the day-early bug the old `new Date("yyyy-MM-dd")` produced.

describe("parseDateOnly", () => {
  it("reads a bare date as that calendar day", () => {
    expect(format(parseDateOnly("2026-10-02"), "EEEE, MMMM d")).toBe("Friday, October 2");
  });

  it("ignores a time suffix", () => {
    expect(format(parseDateOnly("2026-10-02T00:00:00+00:00"), "yyyy-MM-dd")).toBe("2026-10-02");
  });
});

describe("isDateOnly", () => {
  it("accepts real dates and rejects the rest", () => {
    expect(isDateOnly("2026-10-09")).toBe(true);
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("10/09/2026")).toBe(false);
    expect(isDateOnly("")).toBe(false);
    expect(isDateOnly(null)).toBe(false);
  });
});

describe("dateOnlySpanDays", () => {
  it("counts both ends", () => {
    expect(dateOnlySpanDays("2026-10-09", "2026-10-11")).toBe(3);
    expect(dateOnlySpanDays("2026-10-09", "2026-10-09")).toBe(1);
  });
});

describe("centralWallClock", () => {
  it("is Des Moines time whatever the browser zone", () => {
    expect(centralWallClock("2026-10-02", 0, "18:00").toISOString()).toBe("2026-10-02T23:00:00.000Z");
    // CST after the November change.
    expect(centralWallClock("2026-11-06", 1, "09:30:00").toISOString()).toBe("2026-11-07T15:30:00.000Z");
  });
});

describe("clockMinutes", () => {
  it("parses HH:mm and HH:mm:ss", () => {
    expect(clockMinutes("18:00:00")).toBe(18 * 60);
    expect(clockMinutes("7:05")).toBe(7 * 60 + 5);
    expect(clockMinutes("25:00")).toBeNull();
    expect(clockMinutes(null)).toBeNull();
  });
});

function trip(): TripPlan {
  return {
    id: "t1",
    user_id: "u1",
    title: "Fall weekend",
    description: null,
    start_date: "2026-10-02",
    end_date: "2026-10-04",
    preferences: {},
    status: "draft",
    is_public: false,
    share_code: null,
    ai_generated: true,
    total_estimated_cost: null,
    created_at: "2026-09-24T00:00:00Z",
    updated_at: "2026-09-24T00:00:00Z",
  };
}

function item(extra: Partial<TripPlanItem>): TripPlanItem {
  return {
    item_id: "i1",
    day_number: 1,
    order_index: 0,
    item_type: "event",
    title: "Concert",
    description: null,
    location: null,
    start_time: null,
    end_time: null,
    duration_minutes: null,
    notes: null,
    estimated_cost: null,
    booking_url: null,
    is_confirmed: false,
    ai_suggested: true,
    ai_reason: null,
    content_details: null,
    ...extra,
  };
}

describe("buildTripICS", () => {
  it("writes an 18:00 stop on day 1 as 23:00Z the same day", () => {
    const ics = buildTripICS(trip(), [item({ start_time: "18:00:00", end_time: "20:00:00" })]);
    expect(ics).toContain("DTSTART:20261002T230000Z");
    expect(ics).toContain("DTEND:20261003T010000Z");
  });

  it("puts day 2 on the second calendar day", () => {
    const ics = buildTripICS(trip(), [item({ day_number: 2, start_time: "10:00" })]);
    expect(ics).toContain("DTSTART:20261003T150000Z");
    expect(ics).toContain("DTEND:20261003T160000Z");
  });

  it("rolls an end time past midnight into the next day", () => {
    const ics = buildTripICS(trip(), [item({ start_time: "22:00", end_time: "01:00" })]);
    expect(ics).toContain("DTSTART:20261003T030000Z");
    expect(ics).toContain("DTEND:20261003T060000Z");
  });
});

describe("tripWindowProblem", () => {
  it("accepts a real window and names what's wrong otherwise", () => {
    expect(tripWindowProblem("2026-10-09", "2026-10-11")).toBeNull();
    expect(tripWindowProblem("2026-10-11", "2026-10-09")).toMatch(/before/);
    expect(tripWindowProblem("2026-10-01", "2026-10-15")).toMatch(/14 days/);
    expect(tripWindowProblem("", "2026-10-09")).toMatch(/Pick/);
  });
});
