import { describe, it, expect } from "vitest";
import {
  countFree,
  countLabel,
  countStartingAfter5pm,
  groupByCentralDay,
  groupByWeek,
  groupTodayEvents,
  hourLabel,
  isEveningStart,
  landingDay,
  landingStartInstant,
  splitAtToday,
  countByCentralDay,
  EVENING_HOURS_LABEL,
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

describe("isEveningStart (WP5 item 4, pass-2 WP3 item 2)", () => {
  it("reads the hour in Central, not the runtime zone", () => {
    // 12:00 CDT and 19:30 CDT
    expect(isEveningStart(ev("noon", "2026-09-26T17:00:00.000Z"))).toBe(false);
    expect(isEveningStart(ev("show", "2026-09-27T00:30:00.000Z"))).toBe(true);
  });

  it("uses the home rail's evening: 4 PM to 4 AM Central", () => {
    expect(EVENING_HOURS_LABEL).toBe("4 PM to 4 AM");
    // 3:59 PM and 4:00 PM CDT
    expect(isEveningStart(ev("before", "2026-09-26T20:59:00.000Z"))).toBe(false);
    expect(isEveningStart(ev("four", "2026-09-26T21:00:00.000Z"))).toBe(true);
    // 3:00 AM CDT is still the night out; 4:00 AM is not.
    expect(isEveningStart(ev("late", "2026-09-27T08:00:00.000Z"))).toBe(true);
    expect(isEveningStart(ev("later", "2026-09-27T09:00:00.000Z"))).toBe(false);
  });

  it("does not count SeatGeek's 03:30 placeholder as a start", () => {
    const seatgeek = ev("sg", "2026-09-26T08:30:00.000Z", {
      event_start_local: "2026-09-26T03:30:00",
      source_url: "https://seatgeek.com/some-show-tickets",
    });
    expect(landingStartInstant(seatgeek)).toBeNull();
    expect(isEveningStart(seatgeek)).toBe(false);
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

describe("groupTodayEvents (WP5 item 6, pass-2 WP3 items 1-2)", () => {
  // Thu 2026-09-24 13:00 CDT
  const now = new Date("2026-09-24T18:00:00.000Z");

  it("sorts events into now, afternoon, tonight and earlier", () => {
    const rows = [
      ev("started-1h-ago", "2026-09-24T17:00:00.000Z"),
      ev("morning-over", "2026-09-24T13:00:00.000Z"),
      ev("fair-all-day", "2026-09-24T14:00:00.000Z", { end_date: "2026-09-25T03:00:00.000Z" }),
      ev("at-3pm", "2026-09-24T20:00:00.000Z"),
      ev("at-4-30pm", "2026-09-24T21:30:00.000Z"),
      ev("at-7pm", "2026-09-25T00:00:00.000Z"),
      ev("tbd", "2026-09-25T00:00:00.000Z", { time_tbd: true }),
    ];
    const groups = groupTodayEvents(rows, now);
    expect(groups.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Happening now", ["started-1h-ago", "fair-all-day"]],
      ["This afternoon", ["at-3pm"]],
      ["Tonight", ["at-4-30pm", "at-7pm"]],
      ["Earlier today", ["morning-over"]],
      ["Time not listed", ["tbd"]],
    ]);
  });

  it("at Fri 20:00 CDT: a Thu-Sun festival is happening now, SeatGeek 03:30 is untimed", () => {
    const fri8pm = new Date("2026-09-26T01:00:00.000Z");
    const rows = [
      ev("festival", "2026-09-24T15:00:00.000Z", { end_date: "2026-09-28T03:00:00.000Z" }),
      ev("seatgeek", "2026-09-25T08:30:00.000Z", {
        event_start_local: "2026-09-25T03:30:00",
        source_url: "https://seatgeek.com/x",
      }),
      ev("at-9pm", "2026-09-26T02:00:00.000Z"),
    ];
    const groups = groupTodayEvents(rows, fri8pm);
    expect(groups.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Happening now", ["festival"]],
      ["Tonight", ["at-9pm"]],
      ["Time not listed", ["seatgeek"]],
    ]);
  });

  it("carries last night's show past midnight while it runs, and drops it once over", () => {
    // Sat 2026-09-26 01:00 CDT
    const oneAm = new Date("2026-09-26T06:00:00.000Z");
    const rows = [
      // Fri 10 PM CDT to Sat 2 AM CDT: still on.
      ev("late-set", "2026-09-26T03:00:00.000Z", { end_date: "2026-09-26T07:00:00.000Z" }),
      // Fri 8 PM to Sat 12:30 AM CDT: over.
      ev("ended", "2026-09-26T01:00:00.000Z", { end_date: "2026-09-26T05:30:00.000Z" }),
    ];
    expect(groupTodayEvents(rows, oneAm).map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Happening now", ["late-set"]],
    ]);
  });
});

describe("landingDay (pass-2 WP3 item 12)", () => {
  it("reads event_start_utc before date, like the card", () => {
    const row = ev("x", "2026-09-26T03:00:00.000Z", { date: "2026-09-27T17:00:00.000Z" });
    expect(landingDay(row)).toBe("2026-09-25");
  });
});

describe("hourLabel", () => {
  it("formats 12-hour Central hours", () => {
    expect([hourLabel(0), hourLabel(4), hourLabel(12), hourLabel(16)]).toEqual([
      "12 AM",
      "4 AM",
      "12 PM",
      "4 PM",
    ]);
  });
});

describe("splitAtToday and countByCentralDay (pass-2 WP3 items 5 and 14)", () => {
  const rows = [
    ev("sep3", "2026-09-03T17:00:00.000Z"),
    ev("sep20-fest", "2026-09-20T17:00:00.000Z", { end_date: "2026-09-27T03:00:00.000Z" }),
    ev("sep24", "2026-09-24T17:00:00.000Z"),
    ev("sep25", "2026-09-25T17:00:00.000Z"),
    ev("sep30-late", "2026-10-01T01:00:00.000Z"), // Sep 30, 8 PM CDT
  ];

  it("folds days before today unless still running", () => {
    const { earlier, upcoming } = splitAtToday(rows, "2026-09-25");
    expect(earlier.map((e) => e.id)).toEqual(["sep3", "sep24"]);
    expect(upcoming.map((e) => e.id)).toEqual(["sep20-fest", "sep25", "sep30-late"]);
  });

  it("files a carried row under today's week", () => {
    const { upcoming } = splitAtToday(rows, "2026-09-25");
    const groups = groupByWeek(upcoming, "2026-09-01", "2026-09-30", "2026-09-25");
    expect(groups.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Sep 21 - Sep 27", ["sep20-fest", "sep25"]],
      ["Sep 28 - Sep 30", ["sep30-late"]],
    ]);
  });

  it("counts by Central day", () => {
    const counts = countByCentralDay(rows);
    expect(counts.get("2026-09-30")).toBe(1);
    expect(counts.get("2026-10-01")).toBeUndefined();
    expect(counts.get("2026-09-25")).toBe(1);
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
