import { describe, it, expect, afterEach, vi } from "vitest";
import {
  attractionHref,
  eventHref,
  homeOpenings,
  homeWeekWindows,
  hotelHref,
  isHttpUrl,
  playgroundHref,
  restaurantHref,
} from "@/lib/dashboardItems";
import { eventsLowerBoundISO } from "@/hooks/useEvents";

/**
 * Home plan WP3. The dashboard built restaurant slugs in the browser, which
 * disagreed with the stored slug for apostrophes, ampersands and duplicate
 * names, and bounded events on the UTC date.
 */
describe("dashboard card hrefs use the row's own slug", () => {
  it("links a restaurant to its stored slug, not one rebuilt from the name", () => {
    // Browser slugging gave proof-s; the row says proofs.
    expect(restaurantHref({ id: "r1", name: "Proof's", slug: "proofs" })).toBe("/restaurants/proofs");
    expect(restaurantHref({ id: "r2", name: "Fong's & Co", slug: "fongs-and-co" })).toBe(
      "/restaurants/fongs-and-co",
    );
    // A duplicate name carries a suffixed slug; the href must follow it.
    expect(restaurantHref({ id: "r3", name: "Proof's", slug: "proofs-2" })).toBe("/restaurants/proofs-2");
  });

  it("falls back to the id when a restaurant has no slug", () => {
    expect(restaurantHref({ id: "abc-123", name: "No Slug Yet", slug: null })).toBe("/restaurants/abc-123");
  });

  it("uses an attraction's slug when present and the name slug otherwise", () => {
    expect(attractionHref({ id: "a1", name: "Science Center", slug: "science-center-of-iowa" })).toBe(
      "/attractions/science-center-of-iowa",
    );
    expect(attractionHref({ id: "a2", name: "Pappajohn Sculpture Park" })).toBe(
      "/attractions/pappajohn-sculpture-park",
    );
  });

  it("slugs playgrounds from the name, which is what PlaygroundDetails matches", () => {
    expect(playgroundHref({ id: "p1", name: "Grays Lake Park Playground" })).toBe(
      "/playgrounds/grays-lake-park-playground",
    );
  });

  it("links hotels under /stay", () => {
    expect(hotelHref({ id: "h1", slug: "hotel-fort-des-moines" })).toBe("/stay/hotel-fort-des-moines");
  });

  it("gives events the Central-dated slug the detail resolver expects", () => {
    // 10pm Central Friday is 03:00Z Saturday; the slug keeps Friday.
    expect(eventHref({ title: "Late Show", event_start_utc: "2026-09-12T03:00:00Z" })).toBe(
      "/events/late-show-2026-09-11",
    );
  });

  it("only treats http(s) as an external link", () => {
    expect(isHttpUrl("https://example.com/x")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});

describe("the home events lower bound is Central midnight", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const yesterdayEvening = "2026-09-23T23:00:00Z"; // 18:00 CDT Wed 23rd
  const tonightSix = "2026-09-24T23:00:00Z"; // 18:00 CDT Thu 24th

  it("at 10:00 CT drops yesterday's events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T15:00:00Z")); // 10:00 CDT
    const bound = eventsLowerBoundISO();
    expect(bound).toBe("2026-09-24T05:00:00.000Z");
    expect(new Date(yesterdayEvening) >= new Date(bound)).toBe(false);
  });

  it("at 20:00 CT still lists tonight's 18:00 event", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T01:00:00Z")); // 20:00 CDT, already the 25th in UTC
    const bound = eventsLowerBoundISO();
    expect(bound).toBe("2026-09-24T05:00:00.000Z");
    expect(new Date(tonightSix) >= new Date(bound)).toBe(true);
  });
});

describe("homeWeekWindows: the events group starts tomorrow, weekend first (pass-2 WP3 item 5)", () => {
  it("from a Thursday evening: the weekend is Friday to Sunday and there are no weekdays", () => {
    // Thursday 2026-09-24, 20:00 CDT.
    const w = homeWeekWindows(new Date("2026-09-25T01:00:00Z"));
    expect([w.weekend.startDay, w.weekend.endDay]).toEqual(["2026-09-25", "2026-09-27"]);
    // Friday 00:00 CDT is 05:00Z; the window never includes today.
    expect(w.weekend.start).toBe("2026-09-25T05:00:00.000Z");
    expect(w.weekdays).toBeNull();
    expect(w.labels.weekend).toBe("This weekend");
  });

  it("from a Monday: weekend Friday to Sunday, weekdays Tuesday to Thursday", () => {
    const w = homeWeekWindows(new Date("2026-09-21T17:00:00Z")); // Mon noon CDT
    expect([w.weekend.startDay, w.weekend.endDay]).toEqual(["2026-09-25", "2026-09-27"]);
    expect([w.weekdays?.startDay, w.weekdays?.endDay]).toEqual(["2026-09-22", "2026-09-24"]);
    expect(w.labels.weekdays).toBe("Later this week");
  });

  it("from a Friday: the weekend is what is left of it, from tomorrow", () => {
    const w = homeWeekWindows(new Date("2026-09-25T17:00:00Z"));
    expect([w.weekend.startDay, w.weekend.endDay]).toEqual(["2026-09-26", "2026-09-27"]);
    expect(w.weekdays).toBeNull();
  });

  it("from a Saturday: Sunday alone", () => {
    const w = homeWeekWindows(new Date("2026-09-26T17:00:00Z"));
    expect([w.weekend.startDay, w.weekend.endDay]).toEqual(["2026-09-27", "2026-09-27"]);
  });

  it("from a Sunday: next weekend, and the week ahead as weekdays", () => {
    const w = homeWeekWindows(new Date("2026-09-27T17:00:00Z"));
    expect([w.weekend.startDay, w.weekend.endDay]).toEqual(["2026-10-02", "2026-10-04"]);
    expect([w.weekdays?.startDay, w.weekdays?.endDay]).toEqual(["2026-09-28", "2026-10-01"]);
    expect(w.labels).toEqual({ weekend: "Next weekend", weekdays: "This week" });
  });

  it("an 11pm Saturday UTC instant is still Saturday evening in Central", () => {
    // 2026-09-27T03:00Z is Sat 22:00 CDT.
    const w = homeWeekWindows(new Date("2026-09-27T03:00:00Z"));
    expect(w.weekend.startDay).toBe("2026-09-27");
  });
});

describe("homeOpenings never promises a date that has passed (pass-2 WP3 item 7)", () => {
  const NOW = new Date("2026-09-25T17:00:00Z");
  const base = { id: "r", name: "Fixture" };

  it("prints Opened for a place that just opened", () => {
    const out = homeOpenings([{ ...base, status: "newly_opened", openingDate: "2026-09-12" }], NOW);
    expect(out.map((o) => o.label)).toEqual(["Opened Sep 12"]);
  });

  it("leaves out an upcoming opening whose date is last year", () => {
    const rows = [
      { ...base, id: "stale", status: "opening_soon", openingDate: "2025-03-03" },
      { ...base, id: "stale2", status: "announced", openingDate: "2026-09-24" },
      { ...base, id: "next", status: "opening_soon", openingDate: "2026-10-02" },
    ];
    const out = homeOpenings(rows, NOW);
    expect(out.map((o) => o.row.id)).toEqual(["next"]);
    expect(out[0].label).toBe("Opening Oct 2");
    for (const { label } of out) expect(label).not.toMatch(/2025/);
  });

  it("keeps an undated upcoming opening with what is known", () => {
    const out = homeOpenings(
      [
        { ...base, id: "a", status: "opening_soon", openingTimeframe: "Winter 2026" },
        { ...base, id: "b", status: "announced" },
      ],
      NOW,
    );
    expect(out.map((o) => o.label)).toEqual(["Opening Winter 2026", "Announced"]);
  });
});
