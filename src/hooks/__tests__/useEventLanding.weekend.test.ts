import { describe, it, expect } from "vitest";
import {
  dayPhase,
  groupByCentralDay,
  landingPicks,
  ongoingStartFilter,
  type LandingEvent,
} from "@/hooks/useEventLanding";
import { centralWindow } from "@/lib/timezone";

/** plan-stay hand-off to Events WP5: the weekend page's day handling. */

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

// Saturday 2026-09-26, noon CDT.
const SAT_NOON = new Date("2026-09-26T17:00:00Z");

describe("ongoingStartFilter", () => {
  it("keeps rows that start in the window or are still running at its start", () => {
    const from = "2026-09-25T05:00:00.000Z";
    expect(ongoingStartFilter(from)).toBe(
      'date.gte."2026-09-25T05:00:00.000Z",and(date.lt."2026-09-25T05:00:00.000Z",end_date.gte."2026-09-25T05:00:00.000Z")'
    );
  });
});

describe("groupByCentralDay with ongoing events", () => {
  const win = centralWindow("this-weekend", SAT_NOON);

  it("is Friday to Sunday on a Saturday", () => {
    expect([win.startDay, win.endDay]).toEqual(["2026-09-25", "2026-09-27"]);
  });

  it("lists a festival that opened Thursday on Friday by default, as still running", () => {
    const fest = ev("fest", "2026-09-24T15:00:00Z", { end_date: "2026-09-28T03:00:00Z" });
    const groups = groupByCentralDay([fest], win.startDay, win.endDay);
    expect(groups.map((g) => g.events.map((e) => e.id))).toEqual([[], [], []]);
    expect(groups.map((g) => g.running.map((e) => e.id))).toEqual([["fest"], [], []]);
  });

  it("carries a still-running event to today, after the day's own starts", () => {
    const fest = ev("fest", "2026-09-24T15:00:00Z", { end_date: "2026-09-28T03:00:00Z" });
    const friOnly = ev("fri", "2026-09-26T00:00:00Z"); // Fri 7pm CDT, no end
    const friToSat = ev("fri-sat", "2026-09-25T20:00:00Z", { end_date: "2026-09-26T20:00:00Z" });
    const sat = ev("sat", "2026-09-27T00:00:00Z"); // Sat 7pm CDT
    const groups = groupByCentralDay(
      [fest, friOnly, friToSat, sat],
      win.startDay,
      win.endDay,
      "2026-09-26"
    );
    expect(groups.map((g) => g.events.map((e) => e.id))).toEqual([["fri"], ["sat"], []]);
    expect(groups.map((g) => g.running.map((e) => e.id))).toEqual([[], ["fest", "fri-sat"], []]);
  });

  it("drops an event that started and ended before the window", () => {
    const old = ev("old", "2026-09-23T15:00:00Z", { end_date: "2026-09-24T03:00:00Z" });
    const groups = groupByCentralDay([old], win.startDay, win.endDay);
    expect(groups.every((g) => g.events.length === 0 && g.running.length === 0)).toBe(true);
  });
});

describe("dayPhase", () => {
  it("splits past, today and upcoming by Central date", () => {
    expect(dayPhase("2026-09-25", "2026-09-26")).toBe("past");
    expect(dayPhase("2026-09-26", "2026-09-26")).toBe("today");
    expect(dayPhase("2026-09-27", "2026-09-26")).toBe("upcoming");
  });
});

describe("landingPicks", () => {
  it("puts featured first, then written-up, and skips events already over", () => {
    const events = [
      ev("written", "2026-09-26T23:00:00Z", { writeup_generated_at: "2026-09-20T00:00:00Z" }),
      ev("plain", "2026-09-26T23:00:00Z"),
      ev("featured", "2026-09-27T18:00:00Z", { is_featured: true }),
      ev("featured-past", "2026-09-25T23:00:00Z", { is_featured: true }),
      ev("featured-running", "2026-09-25T15:00:00Z", {
        is_featured: true,
        end_date: "2026-09-27T20:00:00Z",
      }),
    ];
    expect(landingPicks(events, SAT_NOON).map((e) => e.id)).toEqual([
      "featured",
      "featured-running",
      "written",
    ]);
  });

  it("caps the list", () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      ev(`f${i}`, "2026-09-27T18:00:00Z", { is_featured: true })
    );
    expect(landingPicks(events, SAT_NOON, 3)).toHaveLength(3);
  });
});
