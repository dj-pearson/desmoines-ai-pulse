import { describe, it, expect } from "vitest";
import {
  centralWindow,
  centralHour,
  upcomingFloorUtc,
  centralDateOf,
  addCentralDays,
  centralWeekday,
} from "@/lib/timezone";

const HOUR = 60 * 60 * 1000;

function lengthHours(w: { start: string; end: string }): number {
  return (new Date(w.end).getTime() + 1 - new Date(w.start).getTime()) / HOUR;
}

// Thu 2026-09-24 9pm CDT. A UTC-date reader already thinks it's Friday.
const THU_9PM = new Date("2026-09-25T02:00:00Z");

describe("centralWindow (events plan WP0 item 1)", () => {
  it("today is the Central day, not the UTC day", () => {
    const w = centralWindow("today", THU_9PM);
    expect(w.startDay).toBe("2026-09-24");
    expect(w.endDay).toBe("2026-09-24");
    expect(w.start).toBe("2026-09-24T05:00:00.000Z");
    expect(w.end).toBe("2026-09-25T04:59:59.999Z");
  });

  it("tomorrow is the next Central day", () => {
    const w = centralWindow("tomorrow", THU_9PM);
    expect(w.startDay).toBe("2026-09-25");
    expect(w.start).toBe("2026-09-25T05:00:00.000Z");
  });

  it("this-weekend on a Thursday is Fri 00:00 to Sun 23:59:59.999 CT", () => {
    const w = centralWindow("this-weekend", THU_9PM);
    expect(w.startDay).toBe("2026-09-25");
    expect(w.endDay).toBe("2026-09-27");
    expect(w.start).toBe("2026-09-25T05:00:00.000Z");
    expect(w.end).toBe("2026-09-28T04:59:59.999Z");
  });

  it("this-weekend on Fri, Sat and Sun is the weekend in progress", () => {
    for (const instant of [
      "2026-09-25T15:00:00Z", // Fri 10am CDT
      "2026-09-26T15:00:00Z", // Sat
      "2026-09-27T15:00:00Z", // Sun 10am
      "2026-09-28T04:30:00Z", // Sun 11:30pm CDT, Monday in UTC
    ]) {
      const w = centralWindow("this-weekend", new Date(instant));
      expect(w.startDay, instant).toBe("2026-09-25");
      expect(w.endDay, instant).toBe("2026-09-27");
    }
  });

  it("this-weekend on a Monday is the coming weekend", () => {
    const w = centralWindow("this-weekend", new Date("2026-09-28T15:00:00Z"));
    expect(w.startDay).toBe("2026-10-02");
    expect(w.endDay).toBe("2026-10-04");
  });

  it("this-week runs today through Sunday; next-week is the following Mon-Sun", () => {
    expect(centralWindow("this-week", THU_9PM)).toMatchObject({ startDay: "2026-09-24", endDay: "2026-09-27" });
    const sunday = new Date("2026-09-27T15:00:00Z");
    expect(centralWindow("this-week", sunday)).toMatchObject({ startDay: "2026-09-27", endDay: "2026-09-27" });
    expect(centralWindow("next-week", THU_9PM)).toMatchObject({ startDay: "2026-09-28", endDay: "2026-10-04" });
    expect(centralWindow("next-week", sunday)).toMatchObject({ startDay: "2026-09-28", endDay: "2026-10-04" });
    expect(centralWindow("next-7-days", THU_9PM)).toMatchObject({ startDay: "2026-09-24", endDay: "2026-09-30" });
  });

  it("single, range and month use Central dates", () => {
    expect(centralWindow({ kind: "single", date: "2026-10-31" })).toMatchObject({
      start: "2026-10-31T05:00:00.000Z",
      end: "2026-11-01T04:59:59.999Z",
    });
    const r = centralWindow({ kind: "range", from: "2026-10-03", to: "2026-10-01" });
    expect(r).toMatchObject({ startDay: "2026-10-01", endDay: "2026-10-03" });
    const aug = centralWindow({ kind: "month", year: 2026, month: 8 });
    expect(aug).toMatchObject({
      startDay: "2026-08-01",
      endDay: "2026-08-31",
      start: "2026-08-01T05:00:00.000Z",
      end: "2026-09-01T04:59:59.999Z",
    });
    const dec = centralWindow({ kind: "month", year: 2026, month: 12 });
    expect(dec).toMatchObject({ endDay: "2026-12-31", start: "2026-12-01T06:00:00.000Z", end: "2027-01-01T05:59:59.999Z" });
  });

  it("rejects malformed input instead of producing an Invalid Date window", () => {
    expect(() => centralWindow({ kind: "single", date: "10/31/2026" })).toThrow(RangeError);
    expect(() => centralWindow({ kind: "month", year: 2026, month: 13 })).toThrow(RangeError);
  });

  it("DST days are 23h in March and 25h in November", () => {
    expect(lengthHours(centralWindow({ kind: "single", date: "2026-03-08" }))).toBe(23);
    expect(lengthHours(centralWindow({ kind: "single", date: "2026-11-01" }))).toBe(25);
    expect(lengthHours(centralWindow({ kind: "single", date: "2026-11-02" }))).toBe(24);
    // The weekend of Fri Oct 30 - Sun Nov 1 carries the extra hour: 24 + 24 + 25.
    expect(lengthHours(centralWindow("this-weekend", new Date("2026-10-29T15:00:00Z")))).toBe(73);
  });
});

describe("central helpers", () => {
  it("centralHour reads the Central clock", () => {
    expect(centralHour(THU_9PM)).toBe(21);
    expect(centralHour("2026-01-15T06:30:00Z")).toBe(0);
  });

  it("upcomingFloorUtc is the start of today in Central", () => {
    expect(upcomingFloorUtc(THU_9PM)).toBe("2026-09-24T05:00:00.000Z");
    expect(upcomingFloorUtc(new Date("2026-01-15T03:00:00Z"))).toBe("2026-01-14T06:00:00.000Z");
  });

  it("date arithmetic crosses months and years", () => {
    expect(centralDateOf(THU_9PM)).toBe("2026-09-24");
    expect(addCentralDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCentralDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(centralWeekday("2026-09-27")).toBe(0);
  });
});
