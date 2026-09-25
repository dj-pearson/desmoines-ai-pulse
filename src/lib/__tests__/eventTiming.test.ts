import { describe, it, expect } from "vitest";
import {
  ALL_DAY,
  centralDaysUntil,
  eventEnd,
  eventRunLabel,
  eventTimeLabel,
  eventTiming,
  isEventHappeningNow,
  isEventOver,
  isRunningFromEarlierDay,
  TIME_NOT_LISTED,
} from "@/lib/eventTiming";
import { hasSpecificTime } from "@/lib/timezone";

// Thu 2026-09-24 09:00 CDT (UTC-5).
const THU_9AM = new Date("2026-09-24T14:00:00Z");

// 19:00 CDT on Thu Sep 24.
const TONIGHT = {
  date: "2026-09-25T00:00:00Z",
  event_start_utc: "2026-09-25T00:00:00Z",
  event_start_local: "2026-09-24T19:00:00",
};

describe("eventTiming (events plan WP8 item 4)", () => {
  it("a 19:00 CT event viewed at 09:00 CT reads Today, not Tomorrow", () => {
    const t = eventTiming(TONIGHT, THU_9AM);
    expect(t.daysUntil).toBe(0);
    expect(t.label).toBe("Today");
    expect(t.isOver).toBe(false);
  });

  it("uses Central calendar days, not elapsed hours", () => {
    // Fri 00:30 CDT is tomorrow, 15.5 hours away.
    const early = { date: "2026-09-25T05:30:00Z", event_start_utc: "2026-09-25T05:30:00Z" };
    expect(centralDaysUntil(early, THU_9AM)).toBe(1);
    expect(eventTiming(early, THU_9AM).label).toBe("Tomorrow");
    const later = { date: "2026-09-29T00:00:00Z" };
    expect(eventTiming(later, THU_9AM).label).toBe("In 4 days");
    const far = { date: "2026-10-10T00:00:00Z" };
    expect(eventTiming(far, THU_9AM).label).toBeNull();
  });

  it("is happening now between start and start + 3h, over after", () => {
    const at2000 = new Date("2026-09-25T01:00:00Z");
    expect(isEventHappeningNow(TONIGHT, at2000)).toBe(true);
    expect(eventTiming(TONIGHT, at2000).label).toBe("Happening now");
    const at2300 = new Date("2026-09-25T04:00:01Z");
    expect(isEventOver(TONIGHT, at2300)).toBe(true);
    expect(eventTiming(TONIGHT, at2300).label).toBe("Past event");
  });

  it("day 2 of a 3-day festival is not a past event", () => {
    const festival = {
      date: "2026-09-23T15:00:00Z",
      event_start_utc: "2026-09-23T15:00:00Z",
      end_date: "2026-09-26T03:00:00Z",
    };
    const t = eventTiming(festival, THU_9AM);
    expect(t.isOver).toBe(false);
    expect(t.isHappeningNow).toBe(true);
    expect(t.label).toBe("Happening now");
    expect(t.daysUntil).toBe(-1);
  });

  it("an end_date before the start is ignored", () => {
    const bad = { ...TONIGHT, end_date: "2026-09-20T00:00:00Z" };
    expect(eventEnd(bad)?.toISOString()).toBe("2026-09-25T03:00:00.000Z");
  });

  it("an untimed event lasts to the end of its Central day and reads Today", () => {
    const untimed = {
      date: "2026-09-25T00:31:58Z",
      event_start_utc: "2026-09-25T00:31:58Z",
      event_start_local: "2026-09-24T19:31:58",
    };
    const t = eventTiming(untimed, THU_9AM);
    expect(t.hasTime).toBe(false);
    expect(t.label).toBe("Today");
    expect(t.end?.toISOString()).toBe("2026-09-25T04:59:59.999Z");
    expect(isEventOver(untimed, new Date("2026-09-25T04:00:00Z"))).toBe(false);
  });

  it("time_tbd rows have no time", () => {
    const tbd = { date: "2026-09-24T08:30:00Z", event_start_utc: "2026-09-24T08:30:00Z", time_tbd: true };
    const t = eventTiming(tbd, THU_9AM);
    expect(t.hasTime).toBe(false);
    // 03:30 CDT placeholder has "passed", but the day has not.
    expect(t.isOver).toBe(false);
    expect(t.label).toBe("Today");
  });

  it("returns nulls for an unreadable date", () => {
    const t = eventTiming({ date: "not a date" }, THU_9AM);
    expect(t.start).toBeNull();
    expect(t.label).toBeNull();
    expect(t.isOver).toBe(false);
  });
});

// Thu 2026-09-24 09:00 CDT is THU_9AM above.
const UNTIMED = {
  date: "2026-09-25T00:31:58Z",
  event_start_utc: "2026-09-25T00:31:58Z",
  event_start_local: "2026-09-24T19:31:58",
};

describe("eventTimeLabel (events-pass2 WP2 item 1)", () => {
  it("prints a published start in Central with CT", () => {
    expect(eventTimeLabel(TONIGHT)).toBe("7:00 PM CT");
  });

  it("an untimed row says Time not listed, never All day", () => {
    expect(eventTimeLabel(UNTIMED)).toBe(TIME_NOT_LISTED);
    expect(eventTimeLabel({ ...TONIGHT, time_tbd: true })).toBe(TIME_NOT_LISTED);
    expect(eventTimeLabel({ date: "not a date" })).toBe(TIME_NOT_LISTED);
  });

  it("All day only when end_date carries an untimed row past its start day", () => {
    expect(eventTimeLabel({ ...UNTIMED, end_date: "2026-09-26T04:00:00Z" })).toBe(ALL_DAY);
    // Same Central day: still no time to print.
    expect(eventTimeLabel({ ...UNTIMED, end_date: "2026-09-25T03:00:00Z" })).toBe(TIME_NOT_LISTED);
  });
});

describe("SeatGeek 03:30 placeholder (events-pass2 WP2 item 2)", () => {
  // 03:30 CDT on Sat Sep 26 is 08:30Z.
  const seatgeek = {
    date: "2026-09-26T08:30:00Z",
    event_start_utc: "2026-09-26T08:30:00Z",
    event_start_local: "2026-09-26T03:30:00",
    source_url: "https://seatgeek.com/some-show-tickets/123",
  };

  it("is not a showtime", () => {
    expect(hasSpecificTime(seatgeek)).toBe(false);
    expect(eventTimeLabel(seatgeek)).toBe(TIME_NOT_LISTED);
  });

  it("is matched from the UTC instant when event_start_local is absent", () => {
    const noLocal = { date: seatgeek.date, event_start_utc: seatgeek.event_start_utc, source_url: seatgeek.source_url };
    expect(hasSpecificTime(noLocal)).toBe(false);
  });

  it("03:30 from another source stays a time, as the backfill left it", () => {
    const other = { ...seatgeek, source_url: "https://example.com/late-show" };
    expect(hasSpecificTime(other)).toBe(true);
    expect(eventTimeLabel(other)).toBe("3:30 AM CT");
  });

  it("another SeatGeek time is a real time", () => {
    const real = { ...seatgeek, event_start_local: "2026-09-26T19:30:00", event_start_utc: "2026-09-27T00:30:00Z" };
    expect(hasSpecificTime(real)).toBe(true);
  });
});

describe("eventRunLabel (events-pass2 WP2 items 1 and 5)", () => {
  const festival = {
    // Tue Sep 22 10:00 CDT to Sun Sep 27 22:00 CDT.
    date: "2026-09-22T15:00:00Z",
    event_start_utc: "2026-09-22T15:00:00Z",
    end_date: "2026-09-28T03:00:00Z",
  };

  it("a run under way since an earlier day says Runs through <day>", () => {
    expect(eventRunLabel(festival, THU_9AM)).toBe("Runs through Sun, Sep 27");
    expect(isRunningFromEarlierDay(festival, THU_9AM)).toBe(true);
  });

  it("on its last day it still names the day, so static HTML stays true", () => {
    const sunNoon = new Date("2026-09-27T17:00:00Z");
    expect(eventRunLabel(festival, sunNoon)).toBe("Runs through Sun, Sep 27");
  });

  it("a multi-day run not started yet is a date range", () => {
    const mon = new Date("2026-09-21T14:00:00Z");
    expect(eventRunLabel(festival, mon)).toBe("Sep 22 - Sep 27");
    expect(isRunningFromEarlierDay(festival, mon)).toBe(false);
  });

  it("a timed single-day row with an end is a time range", () => {
    expect(eventRunLabel({ ...TONIGHT, end_date: "2026-09-25T03:00:00Z" }, THU_9AM)).toBe("7:00 - 10:00 PM CT");
    const lunch = {
      date: "2026-09-24T16:00:00Z",
      event_start_utc: "2026-09-24T16:00:00Z",
      end_date: "2026-09-24T19:00:00Z",
    };
    expect(eventRunLabel(lunch, THU_9AM)).toBe("11:00 AM - 2:00 PM CT");
  });

  it("null without an end, with a bad end, or once over", () => {
    expect(eventRunLabel(TONIGHT, THU_9AM)).toBeNull();
    expect(eventRunLabel({ ...TONIGHT, end_date: "2026-09-20T00:00:00Z" }, THU_9AM)).toBeNull();
    expect(eventRunLabel(festival, new Date("2026-09-29T00:00:00Z"))).toBeNull();
    expect(isRunningFromEarlierDay(TONIGHT, THU_9AM)).toBe(false);
  });

  it("a bare yyyy-MM-dd end_date is a Central date, not UTC midnight", () => {
    const fair = { date: "2026-09-22T15:00:00Z", event_start_utc: "2026-09-22T15:00:00Z", end_date: "2026-09-27" };
    expect(eventRunLabel(fair, THU_9AM)).toBe("Runs through Sun, Sep 27");
  });
});
