import { describe, it, expect, afterEach, vi } from "vitest";
import {
  attractionHref,
  centralWeekWindow,
  eventHref,
  hotelHref,
  isHttpUrl,
  orderHomeEvents,
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

describe("orderHomeEvents puts tonight, then the weekend, first", () => {
  // Thursday 2026-09-24, 20:00 CDT.
  const NOW = new Date("2026-09-25T01:00:00Z");

  it("computes the Central weekend from a Thursday evening", () => {
    expect(centralWeekWindow(NOW)).toEqual({ today: "2026-09-24", weekend: ["2026-09-26", "2026-09-27"] });
  });

  it("treats Sunday as its own weekend", () => {
    expect(centralWeekWindow(new Date("2026-09-27T17:00:00Z")).weekend).toEqual(["2026-09-27"]);
  });

  it("orders today, then weekend, then the rest, stable within each band", () => {
    const rows = [
      { id: "fri", event_start_utc: "2026-09-26T00:00:00Z" }, // Fri 19:00 CDT
      { id: "sat", event_start_utc: "2026-09-26T18:00:00Z" },
      { id: "tonight", event_start_utc: "2026-09-25T00:30:00Z" }, // Thu 19:30 CDT
      { id: "sun", event_start_utc: "2026-09-27T18:00:00Z" },
      { id: "nodate" },
    ];
    expect(orderHomeEvents(rows, NOW).map((r) => r.id)).toEqual(["tonight", "sat", "sun", "fri", "nodate"]);
  });
});
