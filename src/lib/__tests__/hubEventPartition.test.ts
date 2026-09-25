import { describe, it, expect } from "vitest";
import {
  eventAtVenue,
  hubDateOrFilter,
  hubEventWindow,
  hubEventsOrFilter,
  hubWeekend,
  normaliseVenueName,
  partitionHubEvents,
  sectionMayBeCut,
  showsByVenue,
  sortVenuesByShows,
  teamVenueSentence,
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

describe("venue matching (explore plan WP5 item 6, pass 2 items 1-2)", () => {
  it("normalises punctuation, ampersands, apostrophes and a leading 'the'", () => {
    expect(normaliseVenueName("The Lift")).toBe("lift");
    expect(normaliseVenueName("Vaudeville Mews & Co.")).toBe("vaudeville mews and co");
    expect(normaliseVenueName("Wooly's")).toBe("woolys");
    expect(normaliseVenueName("Wooly\u2019s")).toBe("woolys");
  });

  it("is matchVenue: equal names, or containment of two or more words", () => {
    expect(eventAtVenue("Wells Fargo Arena - Des Moines", "Wells Fargo Arena")).toBe(true);
    expect(eventAtVenue("the lift", "The Lift")).toBe(true);
    expect(eventAtVenue("Liftoff Bar", "The Lift")).toBe(false);
    expect(eventAtVenue("Downtown at Wells Fargo Arena", "Wells Fargo Arena")).toBe(true);
    expect(eventAtVenue("Wells Fargo Arenas Parking Lot", "Wells Fargo Arena")).toBe(false);
    expect(eventAtVenue(null, "The Lift")).toBe(false);
  });

  it("matches the spellings that used to miss", () => {
    expect(eventAtVenue("Wooly's", { name: "Woolys", slug: "woolys" })).toBe(true);
    expect(eventAtVenue("Wooly's", "Woolys")).toBe(true);
    expect(eventAtVenue("Lefty's Live Music", { name: "Leftys Live Music", slug: "leftys-live-music" })).toBe(true);
    expect(eventAtVenue("Lefty's", { name: "Leftys Live Music", slug: "leftys-live-music" })).toBe(true);
    const arena = { name: "Wells Fargo Arena", slug: "wells-fargo-arena" };
    expect(eventAtVenue("Casey's Center", arena)).toBe(true);
    expect(eventAtVenue("Caseys Center", arena)).toBe(true);
    // An alias belongs to its slug; the bare name has none.
    expect(eventAtVenue("Casey's Center", "Wells Fargo Arena")).toBe(false);
  });

  it("gives each venue its first show and a count, and sorts venues with shows first", () => {
    const venues = [
      { id: "a", name: "Hoyt Sherman Place" },
      { id: "b", name: "Val Air Ballroom" },
      { id: "c", name: "Woolys", slug: "woolys" },
      { id: "d", name: "Wells Fargo Arena", slug: "wells-fargo-arena" },
    ];
    const events = [
      { id: "1", venue: "Wooly's" },
      { id: "2", venue: "Val Air Ballroom" },
      { id: "3", venue: "Woolys" },
      { id: "4", venue: "Casey's Center" },
    ];
    const shows = showsByVenue(venues, events);
    expect(shows.get("c")).toEqual({ next: events[0], count: 2 });
    expect(shows.get("b")?.count).toBe(1);
    expect(shows.get("d")).toEqual({ next: events[3], count: 1 });
    expect(shows.has("a")).toBe(false);
    expect(sortVenuesByShows(venues, shows).map((v) => v.id)).toEqual(["b", "c", "d", "a"]);
  });
});

describe("running events and one Tonight (pass 2 WP5 item 12)", () => {
  const noon = new Date("2026-09-24T17:00:00Z"); // 12:00 CDT Thu

  it("a row that started yesterday with end_date tomorrow is tonight and on now", () => {
    const festival = ev("festival", "2026-09-23T15:00:00Z", { end_date: "2026-09-25T23:00:00Z" });
    for (const tonight of ["day", "evening"] as const) {
      const p = partitionHubEvents([festival], noon, { weekend: true, tonight });
      expect(p.tonight.map((e) => e.id)).toEqual(["festival"]);
      expect(p.onNow.has("festival")).toBe(true);
    }
  });

  it("evening mode: at 1 AM Saturday, Friday night is tonight and Saturday's show is the weekend", () => {
    const sat1am = new Date("2026-09-26T06:00:00Z"); // 01:00 CDT Sat
    const rows = [
      ev("late-fri", "2026-09-26T05:30:00Z"), // 00:30 CDT Sat, still running
      ev("after-midnight", "2026-09-26T07:00:00Z"), // 02:00 CDT Sat, before 04:00
      ev("sat-evening", "2026-09-27T01:00:00Z"), // 20:00 CDT Sat
      ev("sunday", "2026-09-28T00:00:00Z"), // 19:00 CDT Sun
    ];
    const p = partitionHubEvents(rows, sat1am, { weekend: true, tonight: "evening" });
    expect(p.tonight.map((e) => e.id)).toEqual(["late-fri", "after-midnight"]);
    expect(p.weekend.map((e) => e.id)).toEqual(["sat-evening", "sunday"]);
    expect(p.weekendKind).toBe("weekend");

    // Day mode would have called Saturday's 8 PM show "tonight".
    const day = partitionHubEvents(rows, sat1am, { weekend: true, tonight: "day" });
    expect(day.tonight.map((e) => e.id)).toContain("sat-evening");
  });

  it("evening mode: a show after midnight tonight is still tonight", () => {
    const late = ev("late", "2026-09-25T06:30:00Z"); // 01:30 CDT Fri, i.e. Thursday night
    const p = partitionHubEvents([late], noon, { weekend: true, tonight: "evening" });
    expect(p.tonight.map((e) => e.id)).toEqual(["late"]);
  });
});

describe("weekend kind (pass 2 WP5 item 6)", () => {
  const rows = [
    ev("sat-show", "2026-09-27T01:00:00Z"), // 20:00 CDT Sat
    ev("sunday", "2026-09-28T00:00:00Z"), // 19:00 CDT Sun
    ev("tuesday", "2026-09-30T00:00:00Z"), // 19:00 CDT Tue
  ];

  it("on a Saturday only Sunday is left", () => {
    const p = partitionHubEvents(rows, SAT_2PM, { weekend: true, tonight: "evening" });
    expect(p.weekendKind).toBe("sunday");
    expect(p.tonight.map((e) => e.id)).toEqual(["sat-show"]);
    expect(p.weekend.map((e) => e.id)).toEqual(["sunday"]);
  });

  it("on a Sunday evening there is no weekend, and nothing is lost", () => {
    const sun8pm = new Date("2026-09-28T01:00:00Z"); // 20:00 CDT Sun
    const next = [...rows, ev("next-fri", "2026-10-03T00:00:00Z")]; // 19:00 CDT Fri Oct 2
    const p = partitionHubEvents(next, sun8pm, { weekend: true, tonight: "evening" });
    expect(p.weekendKind).toBeNull();
    expect(p.weekend).toHaveLength(0);
    expect(p.tonight.map((e) => e.id)).toEqual(["sunday"]);
    expect(p.later.map((e) => e.id)).toEqual(["tuesday", "next-fri"]);
  });

  it("on a Thursday it is the full weekend", () => {
    expect(partitionHubEvents(rows, THU_9AM).weekendKind).toBe("weekend");
  });
});

describe("sectionMayBeCut (pass 2 WP5 item 13)", () => {
  const end = Date.parse("2026-09-25T09:00:00Z");
  const early = ev("a", "2026-09-25T00:00:00Z");
  const late = ev("b", "2026-09-30T00:00:00Z");

  it("is false when the fetch was not full", () => {
    expect(sectionMayBeCut([early], 2, end)).toBe(false);
  });

  it("is true when the fetch was full and its last row is inside the section", () => {
    expect(sectionMayBeCut([early, early], 2, end)).toBe(true);
  });

  it("is false when the fetch was full but its last row is past the section", () => {
    expect(sectionMayBeCut([early, late], 2, end)).toBe(false);
  });
});

describe("hub date filter (pass 2 WP5 item 12)", () => {
  it("admits rows in the window and rows that started earlier and are still running", () => {
    const f = hubDateOrFilter("2026-09-24T05:00:00.000Z", new Date("2026-09-24T17:00:00Z"));
    expect(f).toBe(
      'date.gte."2026-09-24T05:00:00.000Z",and(date.lt."2026-09-24T05:00:00.000Z",end_date.gte."2026-09-24T17:00:00.000Z")',
    );
  });

  it("nests the category group and the date group in one or() body", () => {
    const f = hubEventsOrFilter("category.ilike.%Music%", "2026-09-24T05:00:00.000Z", new Date("2026-09-24T17:00:00Z"));
    expect(f.startsWith("and(or(category.ilike.%Music%),or(date.gte.")).toBe(true);
    expect(f.endsWith("))")).toBe(true);
  });
});

describe("teamVenueSentence (pass 2 WP5 item 4)", () => {
  it("groups teams by venue, under the arena's current name", () => {
    const teams = [
      { name: "Iowa Cubs", venue_name: "Principal Park" },
      { name: "Iowa Wild", venue_name: "Wells Fargo Arena" },
      { name: "Iowa Wolves", venue_name: "Wells Fargo Arena" },
      { name: "Iowa Barnstormers", venue_name: "Wells Fargo Arena" },
      { name: "No Home", venue_name: null },
    ];
    const s = teamVenueSentence(teams);
    expect(s).toBe(
      "Iowa Cubs at Principal Park; Iowa Wild, Iowa Wolves and Iowa Barnstormers at Casey's Center",
    );
    expect(s).not.toContain("Wells Fargo");
  });

  it("says nothing with no rows", () => {
    expect(teamVenueSentence([])).toBeNull();
  });
});
