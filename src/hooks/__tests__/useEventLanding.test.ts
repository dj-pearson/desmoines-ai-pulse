import { describe, it, expect } from "vitest";
import {
  countFree,
  countLabel,
  countStartingAfter5pm,
  groupByCentralDay,
  groupByWeek,
  groupTodayEvents,
  isEveningStart,
  DATE_NIGHT_FILTER,
  KIDS_EVENTS_FILTER,
  type LandingEvent,
} from "@/hooks/useEventLanding";
import { centralWindow } from "@/lib/timezone";

/** Events plan WP5: the helpers every date and audience landing shares. */

function ev(id: string, utc: string, extra: Partial<LandingEvent> = {}): LandingEvent {
  return {
    id,
    title: id,
    date: utc,
    event_start_utc: utc,
    location: "Des Moines",
    category: "Music",
    ...extra,
  } as LandingEvent;
}

describe("month window (WP5 item 1)", () => {
  it("keeps the last evening of August in August", () => {
    const aug = centralWindow({ kind: "month", year: 2026, month: 8 });
    const sep = centralWindow({ kind: "month", year: 2026, month: 9 });
    // 2026-08-31 20:00 CDT
    const lastEvening = "2026-09-01T01:00:00.000Z";
    expect(lastEvening >= aug.start && lastEvening <= aug.end).toBe(true);
    expect(lastEvening >= sep.start && lastEvening <= sep.end).toBe(false);
  });
});

describe("isEveningStart (WP5 item 4)", () => {
  it("reads the hour in Central, not the runtime zone", () => {
    // 12:00 CDT and 19:30 CDT
    expect(isEveningStart(ev("noon", "2026-09-26T17:00:00.000Z"))).toBe(false);
    expect(isEveningStart(ev("show", "2026-09-27T00:30:00.000Z"))).toBe(true);
    // 1:00 AM CDT is still the night out; 2:00 AM is not.
    expect(isEveningStart(ev("late", "2026-09-27T06:00:00.000Z"))).toBe(true);
    expect(isEveningStart(ev("later", "2026-09-27T07:00:00.000Z"))).toBe(false);
  });

  it("leaves untimed rows out of the evening bucket", () => {
    expect(isEveningStart(ev("tbd", "2026-09-27T00:30:00.000Z", { time_tbd: true }))).toBe(false);
    expect(
      isEveningStart(
        ev("marker", "2026-09-27T00:31:58.000Z", { event_start_local: "2026-09-26T19:31:58" })
      )
    ).toBe(false);
  });
});

describe("counts", () => {
  it("counts free the same way on every landing: unknown price is not free", () => {
    const rows = [
      ev("a", "2026-09-26T17:00:00.000Z", { price: "Free" }),
      ev("b", "2026-09-26T17:00:00.000Z", { price: "$0" }),
      ev("c", "2026-09-26T17:00:00.000Z", { price: undefined }),
      ev("d", "2026-09-26T17:00:00.000Z", { price: "$0-$25" }),
    ];
    expect(countFree(rows)).toBe(2);
  });

  it("counts starts at or after 5 PM Central", () => {
    const rows = [
      ev("a", "2026-09-26T21:59:00.000Z"), // 4:59 PM
      ev("b", "2026-09-26T22:00:00.000Z"), // 5:00 PM
      ev("c", "2026-09-27T01:00:00.000Z", { time_tbd: true }),
    ];
    expect(countStartingAfter5pm(rows)).toBe(1);
  });

  it("puts a + only on a capped count", () => {
    expect(countLabel(36)).toBe("36");
    expect(countLabel(100)).toBe("100+");
  });
});

describe("groupTodayEvents (WP5 item 6)", () => {
  // Thu 2026-09-24 15:00 CDT
  const now = new Date("2026-09-24T20:00:00.000Z");

  it("sorts events into now, afternoon, tonight and earlier", () => {
    const rows = [
      ev("started-1h-ago", "2026-09-24T19:00:00.000Z"),
      ev("morning-over", "2026-09-24T14:00:00.000Z"),
      ev("fair-all-day", "2026-09-24T14:00:00.000Z", { end_date: "2026-09-25T03:00:00.000Z" }),
      ev("at-4pm", "2026-09-24T21:00:00.000Z"),
      ev("at-7pm", "2026-09-25T00:00:00.000Z"),
      ev("tbd", "2026-09-25T00:00:00.000Z", { time_tbd: true }),
    ];
    const groups = groupTodayEvents(rows, now);
    expect(groups.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Happening now", ["started-1h-ago", "fair-all-day"]],
      ["This afternoon", ["at-4pm"]],
      ["Tonight", ["at-7pm"]],
      ["Earlier today", ["morning-over"]],
      ["Time not listed", ["tbd"]],
    ]);
  });
});

describe("groupByCentralDay", () => {
  it("returns Friday, Saturday and Sunday, empty days included", () => {
    const win = centralWindow("this-weekend", new Date("2026-09-25T02:00:00.000Z"));
    const rows = [
      ev("fri-night", "2026-09-26T03:00:00.000Z"), // Fri 10 PM CDT, Sat in UTC
      ev("sun", "2026-09-27T18:00:00.000Z"),
    ];
    const groups = groupByCentralDay(rows, win.startDay, win.endDay);
    expect(groups.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Friday, Sep 25", ["fri-night"]],
      ["Saturday, Sep 26", []],
      ["Sunday, Sep 27", ["sun"]],
    ]);
  });
});

describe("groupByWeek", () => {
  it("groups Monday to Sunday, clipped to the month", () => {
    const rows = [
      ev("sep1", "2026-09-01T17:00:00.000Z"), // Tue
      ev("sep6", "2026-09-06T17:00:00.000Z"), // Sun
      ev("sep7", "2026-09-07T17:00:00.000Z"), // Mon
      ev("sep30", "2026-09-30T17:00:00.000Z"), // Wed
    ];
    const groups = groupByWeek(rows, "2026-09-01", "2026-09-30");
    expect(groups.map((g) => [g.label, g.events.length])).toEqual([
      ["Sep 1 - Sep 6", 2],
      ["Sep 7 - Sep 13", 1],
      ["Sep 28 - Sep 30", 1],
    ]);
  });
});

describe("audience filters (WP5 item 9)", () => {
  it("Kids drops description-level family and bare kid", () => {
    expect(KIDS_EVENTS_FILTER).not.toMatch(/ilike/);
    const description = KIDS_EVENTS_FILTER.split(",").find((c) => c.startsWith("enhanced_description"));
    expect(description).toBeDefined();
    expect(description).not.toMatch(/family/);
    expect(description).not.toMatch(/\(kid\b|\|kid\b|kid\|/);
  });

  it("Date Night no longer matches a bare night", () => {
    expect(DATE_NIGHT_FILTER).not.toMatch(/night/i);
    expect(DATE_NIGHT_FILTER).toContain("[[:<:]]");
  });
});
