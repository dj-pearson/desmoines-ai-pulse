import { describe, it, expect, afterEach, vi } from "vitest";
import {
  formatEventPart,
  formatEventTimeOnly,
  centralDayStartUtcISO,
  centralDayOfWeek,
  NO_TIME_MARKER,
} from "@/lib/timezone";

/**
 * WEB-QA-029. /music, /sports, /music/venues/:slug and /sports/:slug rendered
 * event dates with `new Date(event.date).toLocaleDateString(...)`, which formats
 * in the READER's timezone, and printed a time unconditionally, which turned the
 * NO_TIME_MARKER sentinel into a confident "7:31 PM".
 *
 * These assertions are about the values themselves, so they hold whatever
 * timezone the runner is in - that is the point of the fix.
 */
describe("event times are Central, not the reader's", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // 10pm Central on Friday 2026-09-11 is 03:00Z on Saturday the 12th.
  // A reader anywhere at or east of UTC saw "Sat" and the 12th.
  const lateFridayShow = {
    event_start_utc: "2026-09-12T03:00:00Z",
    event_start_local: "2026-09-11T22:00:00",
    date: "2026-09-12T03:00:00Z",
  };

  it("keeps a 10pm Central Friday show on Friday", () => {
    expect(formatEventPart(lateFridayShow, "EEEE")).toBe("Friday");
    expect(formatEventPart(lateFridayShow, "d")).toBe("11");
    expect(formatEventPart(lateFridayShow, "MMM")).toBe("Sep");
    expect(formatEventTimeOnly(lateFridayShow)).toBe("10:00 PM");
  });

  it("returns null rather than a made-up part when the event has no start", () => {
    expect(formatEventPart({}, "EEEE")).toBeNull();
    expect(formatEventPart({ date: null }, "d")).toBeNull();
  });

  it("suppresses the time when the event carries the no-time sentinel", () => {
    const noTime = { event_start_local: `2026-09-11T${NO_TIME_MARKER}` };
    expect(formatEventTimeOnly(noTime)).toBeNull();
    // the date is still known and still Central
    expect(formatEventPart(noTime, "EEEE")).toBe("Friday");
  });

  it("suppresses the time when the source flagged it TBD", () => {
    expect(
      formatEventTimeOnly({ ...lateFridayShow, time_tbd: true })
    ).toBeNull();
  });
});

describe("central day boundaries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the day at Central midnight, not the reader's", () => {
    // 2026-09-09 06:30Z is 01:30 Central, so "today" is still the 9th.
    vi.setSystemTime(new Date("2026-09-09T06:30:00Z"));
    expect(centralDayStartUtcISO(0)).toBe("2026-09-09T05:00:00.000Z");
    expect(centralDayStartUtcISO(1)).toBe("2026-09-10T05:00:00.000Z");
  });

  it("still reports the previous Central day just before Central midnight", () => {
    // 2026-09-10 04:30Z is 23:30 Central on the 9th.
    vi.setSystemTime(new Date("2026-09-10T04:30:00Z"));
    expect(centralDayStartUtcISO(0)).toBe("2026-09-09T05:00:00.000Z");
  });

  it("crosses the fall DST boundary one day at a time", () => {
    // US DST ends 2026-11-01. Central midnight is 05:00Z before, 06:00Z after.
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    expect(centralDayStartUtcISO(0)).toBe("2026-10-31T05:00:00.000Z");
    expect(centralDayStartUtcISO(1)).toBe("2026-11-01T05:00:00.000Z");
    expect(centralDayStartUtcISO(2)).toBe("2026-11-02T06:00:00.000Z");
  });

  it("reads the weekday in Central", () => {
    // 2026-09-10 04:30Z is Wednesday 23:30 Central, though it is Thursday UTC.
    vi.setSystemTime(new Date("2026-09-10T04:30:00Z"));
    expect(centralDayOfWeek()).toBe(3);
  });
});
