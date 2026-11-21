import { describe, it, expect } from "vitest";
import {
  isLinkableRestaurant,
  isLinkableUpcomingEvent,
  isLocated,
  NEARBY_EVENT_SCAN_COLUMNS,
  NEARBY_RESTAURANT_SCAN_COLUMNS,
  orderByIds,
  selectNearbyEvents,
  selectNearbyRestaurants,
} from "@/lib/nearbyLinks";

// The Civic Center, downtown. 0.01 degrees of latitude is about 0.69 miles.
const ORIGIN = { latitude: 41.5851, longitude: -93.6271 };

function place(id: string, dLat: number, extra: Record<string, unknown> = {}) {
  return { id, latitude: ORIGIN.latitude + dLat, longitude: ORIGIN.longitude, status: "open", ...extra };
}

describe("isLocated", () => {
  it("needs two finite coordinates that are not the 0,0 of a failed geocode", () => {
    expect(isLocated(ORIGIN)).toBe(true);
    expect(isLocated({ latitude: "41.58", longitude: "-93.62" })).toBe(true);
    expect(isLocated({ latitude: null, longitude: -93.6 })).toBe(false);
    expect(isLocated({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isLocated({ latitude: "", longitude: "" })).toBe(false);
    expect(isLocated(null)).toBe(false);
  });
});

describe("isLinkableRestaurant", () => {
  it("keeps an open place inside the metro", () => {
    expect(isLinkableRestaurant(place("a", 0))).toBe(true);
    expect(isLinkableRestaurant(place("a", 0, { status: null }))).toBe(true);
    expect(isLinkableRestaurant(place("a", 0, { status: "newly_opened" }))).toBe(true);
  });

  it("drops merged rows, which is also how out-of-scope rows are retired", () => {
    expect(isLinkableRestaurant(place("a", 0, { is_merged: true }))).toBe(false);
  });

  it("drops a place closed by our status or by Google's", () => {
    expect(isLinkableRestaurant(place("a", 0, { status: "closed" }))).toBe(false);
    expect(isLinkableRestaurant(place("a", 0, { business_status: "CLOSED_PERMANENTLY" }))).toBe(false);
  });

  it("drops places you cannot eat at today", () => {
    expect(isLinkableRestaurant(place("a", 0, { status: "announced" }))).toBe(false);
    expect(isLinkableRestaurant(place("a", 0, { status: "opening_soon" }))).toBe(false);
    expect(isLinkableRestaurant(place("a", 0, { status: "temporarily_closed" }))).toBe(false);
  });

  it("drops rows outside the metro box and rows with no coordinates", () => {
    expect(isLinkableRestaurant({ id: "x", latitude: 41.5236, longitude: -90.5776 })).toBe(false); // Davenport
    expect(isLinkableRestaurant({ id: "x", latitude: null, longitude: null })).toBe(false);
  });
});

describe("selectNearbyRestaurants", () => {
  const rows = [
    place("far", 0.05), // ~3.5 mi, outside two miles
    place("mid", 0.02, { cuisine: "Mexican" }),
    place("near", 0.005, { cuisine: "Italian" }),
    place("closed", 0.001, { status: "closed" }),
    place("merged", 0.001, { is_merged: true }),
    place("self", 0),
    place("next", 0.01, { cuisine: "mexican " }),
    place("fourth", 0.015),
  ];

  it("returns open places within two miles, nearest first, without the page's own row", () => {
    expect(selectNearbyRestaurants(ORIGIN, rows, { excludeId: "self" }).map((r) => r.id)).toEqual([
      "near",
      "next",
      "fourth",
    ]);
  });

  it("honours the limit and never pads with places further than two miles", () => {
    expect(selectNearbyRestaurants(ORIGIN, rows, { excludeId: "self", limit: 10 }).map((r) => r.id)).toEqual([
      "near",
      "next",
      "fourth",
      "mid",
    ]);
  });

  it("puts the same cuisine first, each group nearest first", () => {
    expect(
      selectNearbyRestaurants(ORIGIN, rows, { excludeId: "self", limit: 4, preferCuisine: "Mexican" }).map((r) => r.id),
    ).toEqual(["next", "mid", "near", "fourth"]);
  });

  it("returns nothing for an unlocated page rather than an arbitrary list", () => {
    expect(selectNearbyRestaurants({ latitude: null, longitude: null }, rows)).toEqual([]);
  });
});

describe("selectNearbyEvents", () => {
  const now = new Date("2026-10-01T17:00:00Z");
  const ev = (id: string, dLat: number, date: string, extra: Record<string, unknown> = {}) => ({
    id,
    latitude: ORIGIN.latitude + dLat,
    longitude: ORIGIN.longitude,
    date,
    ...extra,
  });
  const rows = [
    ev("past", 0.001, "2026-09-30T23:00:00Z"),
    ev("hidden", 0.001, "2026-10-02T23:00:00Z", { is_hidden: true }),
    ev("merged", 0.001, "2026-10-02T23:00:00Z", { is_merged: true }),
    ev("archived", 0.001, "2026-10-02T23:00:00Z", { archived_at: "2026-09-01T00:00:00Z" }),
    ev("undated", 0.001, ""),
    ev("far", 0.05, "2026-10-02T23:00:00Z"),
    ev("b", 0.01, "2026-10-03T23:00:00Z"),
    ev("a", 0.004, "2026-10-10T23:00:00Z"),
    ev("tonight", 0.002, "2026-10-01T23:00:00Z"),
    ev("c", 0.02, "2026-10-04T23:00:00Z"),
  ];

  it("keeps visible, upcoming events within two miles, nearest first, up to three", () => {
    expect(selectNearbyEvents(ORIGIN, rows, { now }).map((e) => e.id)).toEqual(["tonight", "a", "b"]);
  });

  it("drops events another rail on the page already links", () => {
    expect(selectNearbyEvents(ORIGIN, rows, { now, excludeIds: ["tonight"] }).map((e) => e.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("applies the event visibility predicates even if the query let a row through", () => {
    for (const id of ["hidden", "merged", "archived", "past", "undated"]) {
      expect(isLinkableUpcomingEvent(rows.find((r) => r.id === id)!, now)).toBe(false);
    }
  });

  it("keeps a run that started earlier and is still going, not one that is over (WEB-FEAT-062)", () => {
    const running = ev("fair", 0.001, "2026-09-28T14:00:00Z", { end_date: "2026-10-05T03:00:00Z" });
    const over = ev("over", 0.001, "2026-09-20T14:00:00Z", { end_date: "2026-09-30T03:00:00Z" });
    const startedTonight = ev("started", 0.001, "2026-10-01T16:30:00Z");
    expect(isLinkableUpcomingEvent(running, now)).toBe(true);
    expect(isLinkableUpcomingEvent(over, now)).toBe(false);
    expect(isLinkableUpcomingEvent(startedTonight, now)).toBe(false);
    expect(isLinkableUpcomingEvent({ ...running, is_hidden: true }, now)).toBe(false);
    expect(selectNearbyEvents(ORIGIN, [over, running, ...rows], { now }).map((e) => e.id)).toEqual([
      "fair",
      "tonight",
      "a",
    ]);
  });

  it("returns nothing without coordinates", () => {
    expect(selectNearbyEvents({ latitude: undefined, longitude: undefined }, rows, { now })).toEqual([]);
  });
});

describe("orderByIds", () => {
  it("puts rows back in the selector's order and drops ids with no row", () => {
    const rows = [{ id: "c" }, { id: "a" }, { id: "x" }];
    expect(orderByIds(rows, ["a", "b", "c"]).map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("scan projections", () => {
  const cols = (s: string) => new Set(s.split(",").map((c) => c.trim()));

  it("carry every field the selectors read, and no card text", () => {
    const r = cols(NEARBY_RESTAURANT_SCAN_COLUMNS);
    for (const c of ["id", "latitude", "longitude", "status", "business_status", "is_merged", "cuisine"]) {
      expect(r.has(c)).toBe(true);
    }
    const e = cols(NEARBY_EVENT_SCAN_COLUMNS);
    for (const c of ["id", "latitude", "longitude", "date", "end_date", "is_merged", "is_hidden", "archived_at"]) {
      expect(e.has(c)).toBe(true);
    }
    for (const heavy of ["description", "original_description", "enhanced_description", "name", "title"]) {
      expect(r.has(heavy) || e.has(heavy)).toBe(false);
    }
  });
});
