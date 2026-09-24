import { describe, it, expect } from "vitest";
import {
  centralDaysUntil,
  eventEnd,
  eventTiming,
  isEventHappeningNow,
  isEventOver,
} from "@/lib/eventTiming";

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
