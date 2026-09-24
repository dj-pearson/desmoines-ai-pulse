import { describe, it, expect } from "vitest";
import { groupOpenings, openingDay, openingLabel } from "@/lib/restaurantOpenings";

const NOW = new Date("2026-09-23T12:00:00Z");
const r = (id: string, status: string | null, opening_date: string | null = null) => ({ id, name: id, status, opening_date });

describe("groupOpenings", () => {
  it("puts newly_opened and recently dated places under recent, newest first", () => {
    const { recent } = groupOpenings(
      [r("a", "newly_opened", "2026-03-01"), r("b", "open", "2026-08-01"), r("c", "newly_opened")],
      NOW,
    );
    expect(recent.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("puts opening_soon and announced under upcoming, soonest first", () => {
    const { upcoming } = groupOpenings(
      [r("x", "announced"), r("y", "opening_soon", "2026-12-01"), r("z", "opening_soon", "2026-10-15")],
      NOW,
    );
    expect(upcoming.map((x) => x.id)).toEqual(["z", "y", "x"]);
  });

  it("leaves out closed places, and open places that opened over a year ago", () => {
    const out = groupOpenings([r("old", "open", "2024-01-01"), r("gone", "closed", "2026-09-01")], NOW);
    expect(out.recent).toEqual([]);
    expect(out.upcoming).toEqual([]);
  });

  it("does not count a future opening_date on an open place as recent", () => {
    expect(groupOpenings([r("f", "open", "2027-01-01")], NOW).recent).toEqual([]);
  });
});

describe("groupOpenings window", () => {
  it("drops a newly_opened place dated outside the recent window", () => {
    const out = groupOpenings([r("stale", "newly_opened", "2023-05-01"), r("fresh", "newly_opened", "2026-09-13")], NOW);
    expect(out.recent.map((x) => x.id)).toEqual(["fresh"]);
  });
});

describe("openingDay", () => {
  it("takes a date-only value as written, not as UTC midnight", () => {
    expect(openingDay("2026-10-01")).toBe("2026-10-01");
  });

  it("converts a full timestamp to the Central calendar day", () => {
    // 03:00 UTC on Oct 1 is 10 PM Sep 30 in Des Moines.
    expect(openingDay("2026-10-01T03:00:00Z")).toBe("2026-09-30");
  });

  it("returns null for empty or unparseable input", () => {
    expect(openingDay(null)).toBeNull();
    expect(openingDay("")).toBeNull();
    expect(openingDay("soon")).toBeNull();
  });
});

describe("openingLabel", () => {
  const row = (status: string | null, opening_date: string | null = null, opening_timeframe: string | null = null) => ({
    id: "x",
    name: "x",
    status,
    opening_date,
    opening_timeframe,
  });

  it("says Opened with the date for a place that opened 10 days ago", () => {
    expect(openingLabel(row("newly_opened", "2026-09-13"), NOW)).toBe("Opened Sep 13");
  });

  it("prints the first of the month as the first, whatever the browser zone", () => {
    expect(openingLabel(row("opening_soon", "2026-10-01"), NOW)).toBe("Opening Oct 1");
  });

  it("adds the year when the date is not this year", () => {
    expect(openingLabel(row("announced", "2027-02-14"), NOW)).toBe("Opening Feb 14, 2027");
    expect(openingLabel(row("open", "2025-12-03"), NOW)).toBe("Opened Dec 3, 2025");
  });

  it("falls back to the timeframe, then to the status", () => {
    expect(openingLabel(row("opening_soon", null, "Oct 2026"), NOW)).toBe("Opening Oct 2026");
    expect(openingLabel(row("announced"), NOW)).toBe("Announced");
    expect(openingLabel(row("opening_soon"), NOW)).toBe("Opening soon");
  });

  it("never prints a past date as an upcoming opening", () => {
    expect(openingLabel(row("opening_soon", "2026-01-10", "Spring 2026"), NOW)).toBe("Opening Spring 2026");
  });

  it("returns null for closed places and undated ordinary ones", () => {
    expect(openingLabel(row("closed", "2026-09-01"), NOW)).toBeNull();
    expect(openingLabel(row("open"), NOW)).toBeNull();
    expect(openingLabel(row("newly_opened"), NOW)).toBe("Recently opened");
  });
});
