import { describe, it, expect } from "vitest";
import {
  eventAtVenue,
  hubEventWindow,
  hubWeekend,
  normaliseVenueName,
  partitionHubEvents,
  showsByVenue,
  sortVenuesByShows,
} from "@/lib/hubEventPartition";

// 2026-09-24 is a Thursday. CDT is UTC-5.
const THU_9AM = new Date("2026-09-24T14:00:00Z");
const SAT_2PM = new Date("2026-09-26T19:00:00Z");
const SUN_8PM = new Date("2026-09-28T01:00:00Z");

function ev(id: string, startUtc: string, extra: Record<string, unknown> = {}) {
  return { id, date: startUtc, event_start_utc: startUtc, venue: null as string | null, ...extra };
}

describe("hubWeekend (explore plan WP5 item 2)", () => {
  it("on Saturday 14:00 Central the weekend started the preceding Friday", () => {
    const w = hubWeekend(SAT_2PM);
    expect(w.startDay).toBe("2026-09-25");
    expect(w.endDay).toBe("2026-09-27");
  });

  it("on Sunday 20:00 Central it is still this weekend, not next", () => {
    const w = hubWeekend(SUN_8PM);
    expect(w.startDay).toBe("2026-09-25");
    expect(w.endDay).toBe("2026-09-27");
  });

  it("on a Thursday it is the coming Friday", () => {
    expect(hubWeekend(THU_9AM).startDay).toBe("2026-09-25");
  });
});

describe("hubEventWindow", () => {
  it("runs from the start of today to the end of today + N, in Central", () => {
    const w = hubEventWindow(14, THU_9AM);
    expect(w.startDay).toBe("2026-09-24");
    expect(w.endDay).toBe("2026-10-08");
    expect(w.start).toBe("2026-09-24T05:00:00.000Z");
  });
});

describe("partitionHubEvents (explore plan WP5 item 4)", () => {
  const rows = [
    ev("ended", "2026-09-24T13:00:00Z"), // 08:00 CDT today, over at 11:00
    ev("running", "2026-09-24T16:00:00Z"), // 11:00 CDT, runs to 14:00
    ev("tonight", "2026-09-25T00:00:00Z"), // 19:00 CDT today
    ev("friday", "2026-09-26T01:00:00Z"), // 20:00 CDT Fri
    ev("sunday", "2026-09-28T00:00:00Z"), // 19:00 CDT Sun
    ev("tuesday", "2026-09-30T00:00:00Z"), // 19:00 CDT next Tue
  ];
  const noon = new Date("2026-09-24T17:00:00Z"); // 12:00 CDT Thu

  it("puts each event in exactly one section", () => {
    const p = partitionHubEvents(rows, noon);
    expect(p.tonight.map((e) => e.id)).toEqual(["running", "tonight"]);
    expect(p.weekend.map((e) => e.id)).toEqual(["friday", "sunday"]);
    expect(p.later.map((e) => e.id)).toEqual(["tuesday"]);
    const ids = [...p.tonight, ...p.weekend, ...p.later].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("drops what has ended and flags what is on now", () => {
    const p = partitionHubEvents(rows, noon);
    expect(p.tonight.some((e) => e.id === "ended")).toBe(false);
    expect([...p.onNow]).toEqual(["running"]);
  });

  it("honours end_date over the three-hour default", () => {
    const long = ev("long", "2026-09-24T14:00:00Z", { end_date: "2026-09-24T22:00:00Z" });
    const p = partitionHubEvents([long], noon);
    expect(p.tonight.map((e) => e.id)).toEqual(["long"]);
    expect(p.onNow.has("long")).toBe(true);
  });

  it("keeps a duplicate id once", () => {
    const p = partitionHubEvents([rows[2], rows[2]], noon);
    expect(p.tonight).toHaveLength(1);
  });

  it("on Saturday, Sunday's shows are this weekend and today's are tonight", () => {
    const p = partitionHubEvents(rows, SAT_2PM);
    expect(p.tonight).toHaveLength(0);
    expect(p.weekend.map((e) => e.id)).toEqual(["sunday"]);
    expect(p.later.map((e) => e.id)).toEqual(["tuesday"]);
  });

  it("without a weekend section, everything after today is later", () => {
    const p = partitionHubEvents(rows, noon, { weekend: false });
    expect(p.weekend).toHaveLength(0);
    expect(p.later.map((e) => e.id)).toEqual(["friday", "sunday", "tuesday"]);
  });
});

describe("venue matching (explore plan WP5 item 6)", () => {
  it("normalises punctuation, ampersands and a leading 'the'", () => {
    expect(normaliseVenueName("The Lift")).toBe("lift");
    expect(normaliseVenueName("Vaudeville Mews & Co.")).toBe("vaudeville mews and co");
  });

  it("matches equal names and a name followed by more words, nothing looser", () => {
    expect(eventAtVenue("Wells Fargo Arena - Des Moines", "Wells Fargo Arena")).toBe(true);
    expect(eventAtVenue("the lift", "The Lift")).toBe(true);
    expect(eventAtVenue("Liftoff Bar", "The Lift")).toBe(false);
    expect(eventAtVenue("Downtown at Wells Fargo Arena", "Wells Fargo Arena")).toBe(false);
    expect(eventAtVenue(null, "The Lift")).toBe(false);
  });

  it("gives each venue its first show and a count, and sorts venues with shows first", () => {
    const venues = [
      { id: "a", name: "Hoyt Sherman Place" },
      { id: "b", name: "Val Air Ballroom" },
      { id: "c", name: "Wooly's" },
    ];
    const events = [
      { id: "1", venue: "Wooly's" },
      { id: "2", venue: "Val Air Ballroom" },
      { id: "3", venue: "Wooly's" },
    ];
    const shows = showsByVenue(venues, events);
    expect(shows.get("c")).toEqual({ next: events[0], count: 2 });
    expect(shows.get("b")?.count).toBe(1);
    expect(shows.has("a")).toBe(false);
    expect(sortVenuesByShows(venues, shows).map((v) => v.id)).toEqual(["b", "c", "a"]);
  });
});
