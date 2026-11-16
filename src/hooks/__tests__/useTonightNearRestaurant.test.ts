/**
 * "After dinner, nearby tonight" row selection (restaurants plan WP8 item 6),
 * against a fixed clock: 2026-09-24 17:00 CDT.
 */
import { describe, it, expect } from "vitest";
import {
  clockLabelMinutes,
  pickTonightNear,
  runningUntil,
  runsUntilLabel,
  tonightHeading,
  WALKABLE_MILES,
} from "../useTonightNearRestaurant";
import type { TonightEvent } from "@/lib/tonightPairings";

const NOW = new Date("2026-09-24T22:00:00Z");
const ORIGIN = { latitude: 41.585, longitude: -93.625 };

/** An event `miles` due north of ORIGIN. */
function ev(id: string, startUtc: string, miles: number, extra: Partial<TonightEvent> = {}): TonightEvent {
  return {
    id,
    title: `Event ${id}`,
    date: startUtc,
    event_start_utc: startUtc,
    venue: `Venue ${id}`,
    latitude: ORIGIN.latitude + miles / 69,
    longitude: ORIGIN.longitude,
    ...extra,
  };
}

describe("pickTonightNear", () => {
  it("keeps tonight's events inside the pairing radius, in start order", () => {
    const rows = [
      ev("late", "2026-09-25T02:00:00Z", 0.5), // 9:00 PM CT
      ev("show", "2026-09-25T00:30:00Z", 0.3), // 7:30 PM CT
      ev("far", "2026-09-25T01:00:00Z", 3), // outside 1.5 mi
      ev("started", "2026-09-24T20:00:00Z", 0.2), // 3:00 PM CT, already begun
      ev("tomorrow", "2026-09-25T15:00:00Z", 0.2), // 10:00 AM CT tomorrow
    ];
    const picked = pickTonightNear(rows, ORIGIN, NOW);
    expect(picked.map((p) => p.event.id)).toEqual(["show", "late"]);
    expect(picked[0].startsAt?.toISOString()).toBe("2026-09-25T00:30:00.000Z");
  });

  it("marks rows under the walkable threshold", () => {
    const picked = pickTonightNear(
      [ev("near", "2026-09-25T00:30:00Z", 0.4), ev("drive", "2026-09-25T01:30:00Z", 1.2)],
      ORIGIN,
      NOW,
    );
    expect(WALKABLE_MILES).toBe(0.75);
    expect(picked.map((p) => [p.event.id, p.walkable])).toEqual([
      ["near", true],
      ["drive", false],
    ]);
  });

  it("drops events with no usable coordinates", () => {
    const picked = pickTonightNear(
      [
        ev("nowhere", "2026-09-25T00:30:00Z", 0, { latitude: null, longitude: null }),
        ev("null-island", "2026-09-25T00:30:00Z", 0, { latitude: 0, longitude: 0 }),
      ],
      ORIGIN,
      NOW,
    );
    expect(picked).toEqual([]);
  });

  it("caps the list", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      ev(`e${i}`, `2026-09-25T0${i}:00:00Z`, 0.1),
    );
    expect(pickTonightNear(rows, ORIGIN, NOW, 3)).toHaveLength(3);
  });
});

describe("pickTonightNear with runs already on (WEB-FEAT-080)", () => {
  // Opened yesterday 10 AM CT, ends at midnight starting Monday Sep 28.
  const festival = ev("fest", "2026-09-23T15:00:00Z", 0.3, { end_date: "2026-09-28T05:00:00Z" });

  it("keeps a run that opened before today and is still on", () => {
    const picked = pickTonightNear([festival], ORIGIN, NOW);
    expect(picked.map((p) => p.event.id)).toEqual(["fest"]);
    expect(picked[0].startsAt).toBeNull();
    expect(picked[0].runsUntil?.toISOString()).toBe("2026-09-28T05:00:00.000Z");
  });

  it("ranks timed starts first, then runs nearest first, then no-time events", () => {
    const rows = [
      ev("notime", "2026-09-24T05:00:00Z", 0.2, { time_tbd: true }),
      ev("far-run", "2026-09-20T15:00:00Z", 1.2, { end_date: "2026-09-30T05:00:00Z" }),
      festival,
      ev("show", "2026-09-25T00:30:00Z", 0.9),
      // Opened at 10 AM today, closes 9 PM tonight: started, still on.
      ev("today-run", "2026-09-24T15:00:00Z", 0.6, { end_date: "2026-09-25T02:00:00Z" }),
    ];
    expect(pickTonightNear(rows, ORIGIN, NOW).map((p) => p.event.id)).toEqual([
      "show",
      "fest",
      "today-run",
      "far-run",
    ]);
    expect(pickTonightNear(rows, ORIGIN, NOW, 10).map((p) => p.event.id).at(-1)).toBe("notime");
  });

  it("drops a run that has ended, one outside the radius, and a started show with no end", () => {
    const rows = [
      ev("ended", "2026-09-20T15:00:00Z", 0.2, { end_date: "2026-09-24T21:00:00Z" }), // 4 PM CT today
      ev("far", "2026-09-20T15:00:00Z", 3, { end_date: "2026-09-30T05:00:00Z" }),
      ev("begun", "2026-09-24T20:00:00Z", 0.2), // 3 PM CT, no end_date
    ];
    expect(pickTonightNear(rows, ORIGIN, NOW)).toEqual([]);
  });

  it("lists a row once even when both reads return it", () => {
    expect(pickTonightNear([festival, festival], ORIGIN, NOW)).toHaveLength(1);
  });
});

describe("runningUntil", () => {
  it("is null before the start, after the end and without an end", () => {
    expect(runningUntil(ev("a", "2026-09-25T00:00:00Z", 0, { end_date: "2026-09-26T00:00:00Z" }), NOW)).toBeNull();
    expect(runningUntil(ev("b", "2026-09-20T00:00:00Z", 0, { end_date: "2026-09-24T21:59:00Z" }), NOW)).toBeNull();
    expect(runningUntil(ev("c", "2026-09-20T00:00:00Z", 0), NOW)).toBeNull();
  });
});

describe("runsUntilLabel", () => {
  it("names the last day, reading a midnight end as the day before", () => {
    expect(runsUntilLabel(new Date("2026-09-28T05:00:00Z"), NOW)).toBe("On through Sun, Sep 27");
    expect(runsUntilLabel(new Date("2026-09-27T23:00:00Z"), NOW)).toBe("On through Sun, Sep 27");
  });

  it("gives the closing time when the run ends today", () => {
    expect(runsUntilLabel(new Date("2026-09-25T02:00:00Z"), NOW)).toBe("On until 9:00 PM CT");
    expect(runsUntilLabel(new Date("2026-09-25T05:00:00Z"), NOW)).toBe("On until midnight");
  });
});

describe("clockLabelMinutes", () => {
  it("reads formatClockLabel output", () => {
    expect(clockLabelMinutes("10 PM")).toBe(22 * 60);
    expect(clockLabelMinutes("10:30 PM")).toBe(22 * 60 + 30);
    expect(clockLabelMinutes("12 AM")).toBe(0);
    expect(clockLabelMinutes("midnight")).toBe(24 * 60);
    expect(clockLabelMinutes("noon")).toBe(12 * 60);
    expect(clockLabelMinutes("tomorrow 11 AM")).toBeNull();
    expect(clockLabelMinutes(null)).toBeNull();
  });
});

describe("tonightHeading", () => {
  // NOW is 5:00 PM CDT.
  const at = (utc: string) => ({ startsAt: new Date(utc) });

  it("says after dinner when every event starts within 90 minutes of close or later", () => {
    // Closes 10 PM; 8:30 PM and 9:00 PM CT starts.
    expect(tonightHeading([at("2026-09-25T01:30:00Z"), at("2026-09-25T02:00:00Z")], "10 PM", NOW)).toBe(
      "After dinner, nearby tonight",
    );
  });

  it("stays plain when an event starts well before close", () => {
    // 6:00 PM CT start, closes 10 PM.
    expect(tonightHeading([at("2026-09-24T23:00:00Z")], "10 PM", NOW)).toBe("Tonight nearby");
  });

  it("handles a close after midnight", () => {
    // Closes 2 AM; a 9 PM CT start is well before 12:30 AM.
    expect(tonightHeading([at("2026-09-25T02:00:00Z")], "2 AM", NOW)).toBe("Tonight nearby");
    // A 1:00 AM CT start is after 12:30 AM.
    expect(tonightHeading([at("2026-09-25T06:00:00Z")], "2 AM", NOW)).toBe("After dinner, nearby tonight");
  });

  it("stays plain without a closing time or timed events", () => {
    expect(tonightHeading([at("2026-09-25T02:00:00Z")], null, NOW)).toBe("Tonight nearby");
    expect(tonightHeading([{ startsAt: null }], "10 PM", NOW)).toBe("Tonight nearby");
  });
});
