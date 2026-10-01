import { describe, it, expect } from "vitest";
import {
  EVENTS_IN_RANGE_LIMIT,
  groupByCentralDay,
  ongoingLabel,
  truncationDay,
} from "@/hooks/useEventsInRange";
import { centralWindow } from "@/lib/timezone";
import type { LandingEvent } from "@/hooks/useEventLanding";

// plan-stay-pass2 WP1 items 1 and 2.

function row(id: string, date: string, end_date: string | null = null): LandingEvent {
  return { id, title: `Event ${id}`, date, end_date } as unknown as LandingEvent;
}

const FRI_SUN = centralWindow({ kind: "range", from: "2026-10-09", to: "2026-10-11" });

function titlesByDay(events: LandingEvent[]) {
  return Object.fromEntries(groupByCentralDay(events, FRI_SUN).map((g) => [g.day, g.events.map((e) => e.id)]));
}

describe("groupByCentralDay", () => {
  it("files a Fri-Sun festival under all three days", () => {
    // 5 PM CDT Friday to 10 PM CDT Sunday.
    const festival = row("fest", "2026-10-09T22:00:00+00:00", "2026-10-12T03:00:00+00:00");
    expect(titlesByDay([festival])).toEqual({
      "2026-10-09": ["fest"],
      "2026-10-10": ["fest"],
      "2026-10-11": ["fest"],
    });
  });

  it("files a March-to-December exhibit under every day of the window", () => {
    const exhibit = row("exhibit", "2026-03-01T16:00:00+00:00", "2026-12-31T23:00:00+00:00");
    expect(titlesByDay([exhibit])).toEqual({
      "2026-10-09": ["exhibit"],
      "2026-10-10": ["exhibit"],
      "2026-10-11": ["exhibit"],
    });
  });

  it("puts a day's own starts before runs carried in from earlier", () => {
    const festival = row("fest", "2026-10-09T22:00:00+00:00", "2026-10-12T03:00:00+00:00");
    const show = row("show", "2026-10-10T23:00:00+00:00");
    expect(titlesByDay([festival, show])["2026-10-10"]).toEqual(["show", "fest"]);
  });

  it("uses the Central day, not the UTC one, and keeps empty days", () => {
    // 11:30 PM CDT Saturday is 04:30Z Sunday.
    const late = row("late", "2026-10-11T04:30:00+00:00");
    expect(titlesByDay([late])).toEqual({ "2026-10-09": [], "2026-10-10": ["late"], "2026-10-11": [] });
  });

  it("drops rows outside the window and a duplicate id", () => {
    const before = row("before", "2026-10-01T18:00:00+00:00", "2026-10-02T18:00:00+00:00");
    const after = row("after", "2026-10-13T18:00:00+00:00");
    const once = row("once", "2026-10-09T18:00:00+00:00");
    expect(titlesByDay([before, after, once, once])["2026-10-09"]).toEqual(["once"]);
  });

  it("ignores an end_date before the start", () => {
    const odd = row("odd", "2026-10-10T18:00:00+00:00", "2026-10-01T00:00:00+00:00");
    expect(titlesByDay([odd])).toEqual({ "2026-10-09": [], "2026-10-10": ["odd"], "2026-10-11": [] });
  });
});

describe("ongoingLabel", () => {
  const festival = row("fest", "2026-10-09T22:00:00+00:00", "2026-10-12T03:00:00+00:00");

  it("is null on the start day, so the start time shows", () => {
    expect(ongoingLabel(festival, "2026-10-09")).toBeNull();
  });

  it("says through when on the days after", () => {
    expect(ongoingLabel(festival, "2026-10-10")).toBe("Ongoing, through Oct 11");
    expect(ongoingLabel(festival, "2026-10-11")).toBe("Ongoing, through Oct 11");
  });

  it("replaces a March start time on day one of an October window", () => {
    const exhibit = row("exhibit", "2026-03-01T16:00:00+00:00", "2026-12-31T23:00:00+00:00");
    expect(ongoingLabel(exhibit, "2026-10-09")).toBe("Ongoing, through Dec 31");
  });
});

describe("truncationDay", () => {
  it("is null when the page came back short", () => {
    expect(truncationDay([row("a", "2026-10-09T18:00:00+00:00")], EVENTS_IN_RANGE_LIMIT)).toBeNull();
  });

  it("is the Central day of the last row when the page is full", () => {
    const rows = Array.from({ length: EVENTS_IN_RANGE_LIMIT }, (_, i) =>
      row(String(i), i < 99 ? "2026-10-09T18:00:00+00:00" : "2026-10-14T04:00:00+00:00"),
    );
    // 04:00Z on the 14th is 11 PM CDT on the 13th.
    expect(truncationDay(rows, EVENTS_IN_RANGE_LIMIT)).toBe("2026-10-13");
  });
});
