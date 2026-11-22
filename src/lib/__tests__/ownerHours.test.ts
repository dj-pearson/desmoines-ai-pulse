import { describe, expect, it } from "vitest";
import { isOwnerHours, weekFromStoredHours, weekToPeriods, type WeekHours } from "@/lib/ownerHours";

const closedWeek = (): WeekHours => weekFromStoredHours(null);

describe("weekToPeriods", () => {
  it("turns the form into Places periods, Monday first, with late nights closing the next day", () => {
    const week = closedWeek();
    week[1] = { closed: false, ranges: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "21:30" }] };
    week[6] = { closed: false, ranges: [{ open: "18:00", close: "02:00" }] };
    week[0] = { closed: false, ranges: [{ open: "10:00", close: "15:00" }] };
    const result = weekToPeriods(week);
    expect(result).toEqual({
      ok: true,
      periods: [
        { open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 14, minute: 0 } },
        { open: { day: 1, hour: 17, minute: 0 }, close: { day: 1, hour: 21, minute: 30 } },
        // Saturday night into Sunday wraps to day 0.
        { open: { day: 6, hour: 18, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } },
        { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 15, minute: 0 } },
      ],
    });
  });

  it("refuses a week with no open day, a missing time, and overlapping times on one day", () => {
    expect(weekToPeriods(closedWeek())).toMatchObject({ ok: false, error: expect.stringMatching(/at least one day/) });

    const missing = closedWeek();
    missing[2] = { closed: false, ranges: [{ open: "11:00", close: "" }] };
    expect(weekToPeriods(missing)).toMatchObject({ ok: false, day: 2, error: expect.stringMatching(/Tuesday/) });

    const overlap = closedWeek();
    overlap[3] = { closed: false, ranges: [{ open: "11:00", close: "15:00" }, { open: "14:00", close: "20:00" }] };
    expect(weekToPeriods(overlap)).toMatchObject({ ok: false, day: 3, error: expect.stringMatching(/overlap/) });

    const empty = closedWeek();
    empty[4] = { closed: false, ranges: [] };
    expect(weekToPeriods(empty)).toMatchObject({ ok: false, day: 4 });
  });

  it("counter-check: the same day without the overlap is accepted", () => {
    const week = closedWeek();
    week[3] = { closed: false, ranges: [{ open: "11:00", close: "14:00" }, { open: "14:00", close: "20:00" }] };
    expect(weekToPeriods(week).ok).toBe(true);
  });
});

describe("weekFromStoredHours", () => {
  it("loads Google's periods into the form, skipping a 24-hour period with no close", () => {
    const week = weekFromStoredHours({
      source: "google-places",
      periods: [
        { open: { day: 2, hour: 17, minute: 0 }, close: { day: 2, hour: 22, minute: 0 } },
        { open: { day: 2, hour: 11, minute: 30 }, close: { day: 2, hour: 14, minute: 0 } },
        { open: { day: 5, hour: 0, minute: 0 } },
        { open: { day: 9, hour: 1 }, close: { day: 9, hour: 2 } },
      ],
    });
    expect(week[2]).toEqual({
      closed: false,
      ranges: [
        { open: "11:30", close: "14:00" },
        { open: "17:00", close: "22:00" },
      ],
    });
    expect(week[5].closed).toBe(true);
    expect(week[1].closed).toBe(true);
  });

  it("round-trips: periods built from the form load back into the same form", () => {
    const week = closedWeek();
    week[5] = { closed: false, ranges: [{ open: "16:00", close: "01:30" }] };
    const result = weekToPeriods(week);
    if ("error" in result) throw new Error(result.error);
    expect(weekFromStoredHours({ periods: result.periods })[5]).toEqual(week[5]);
  });

  it("tells owner hours from Google's", () => {
    expect(isOwnerHours({ source: "owner" })).toBe(true);
    expect(isOwnerHours({ source: "google-places" })).toBe(false);
    expect(isOwnerHours(null)).toBe(false);
  });
});
