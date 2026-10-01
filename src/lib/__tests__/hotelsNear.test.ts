import { describe, it, expect } from "vitest";
import {
  HOTELS_NEAR_LIMIT,
  HOTELS_NEAR_MILES,
  coordinatesOf,
  hotelsNear,
  hotelsNearPath,
  isHotelsNearIndexable,
  rankByDistance,
} from "@/lib/hotelsNear";

// Geocoded pairs from supabase/migrations/20261018000045 (OpenStreetMap).
const PRINCIPAL_PARK = { slug: "principal-park", latitude: 41.5802173, longitude: -93.6166144 };
const FAIRGROUNDS = { slug: "iowa-state-fairgrounds", latitude: 41.5954105, longitude: -93.5464497 };

const hotels = [
  { slug: "west-des-moines-marriott", latitude: 41.5888838, longitude: -93.8102601 },
  { slug: "hilton-des-moines-downtown", latitude: 41.5910966, longitude: -93.6239295 },
  { slug: "hampton-inn-suites-des-moines-downtown", latitude: 41.5837169, longitude: -93.6175456 },
  { slug: "residence-inn-des-moines-downtown", latitude: 41.5840472, longitude: -93.6181049 },
  { slug: "ac-hotel-des-moines-east-village", latitude: 41.5902193, longitude: -93.6125011 },
  // Four production hotels have no coordinate the geocoder could vouch for.
  { slug: "comfort-inn-ames", latitude: null, longitude: null },
];

describe("rankByDistance / hotelsNear", () => {
  it("lists the hotels around Principal Park nearest first", () => {
    const out = hotelsNear(PRINCIPAL_PARK, hotels).map((x) => x.item.slug);
    expect(out.slice(0, 2)).toEqual([
      "hampton-inn-suites-des-moines-downtown",
      "residence-inn-des-moines-downtown",
    ]);
    expect(out).toContain("hilton-des-moines-downtown");
  });

  it("leaves out a hotel beyond the radius: West Des Moines is not near the ballpark", () => {
    const out = hotelsNear(PRINCIPAL_PARK, hotels);
    expect(out.map((x) => x.item.slug)).not.toContain("west-des-moines-marriott");
    expect(out.every((x) => x.miles <= HOTELS_NEAR_MILES)).toBe(true);
  });

  it("measures a real distance: the Fairgrounds to the East Village is about 3.4 straight-line miles", () => {
    const [first] = hotelsNear(FAIRGROUNDS, hotels);
    expect(first.item.slug).toBe("ac-hotel-des-moines-east-village");
    expect(first.miles).toBeGreaterThan(3.2);
    expect(first.miles).toBeLessThan(3.6);
  });

  it("skips a hotel with no coordinates instead of ranking it last", () => {
    const out = rankByDistance(PRINCIPAL_PARK, hotels, { maxMiles: 10_000, limit: 50 });
    expect(out.map((x) => x.item.slug)).not.toContain("comfort-inn-ames");
    expect(out).toHaveLength(5);
  });

  it("returns nothing when the venue has no coordinates", () => {
    expect(hotelsNear({ latitude: null, longitude: null }, hotels)).toEqual([]);
    expect(hotelsNear(null, hotels)).toEqual([]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ slug: `h${i}`, latitude: 41.58 + i * 0.0001, longitude: -93.6166 }));
    expect(hotelsNear(PRINCIPAL_PARK, many)).toHaveLength(HOTELS_NEAR_LIMIT);
  });

  it("keeps input order for equal distances", () => {
    const twins = [
      { slug: "a", latitude: 41.59, longitude: -93.62 },
      { slug: "b", latitude: 41.59, longitude: -93.62 },
    ];
    expect(hotelsNear(PRINCIPAL_PARK, twins).map((x) => x.item.slug)).toEqual(["a", "b"]);
  });
});

describe("coordinatesOf", () => {
  it("accepts NUMERIC columns PostgREST returns as strings", () => {
    expect(coordinatesOf({ latitude: "41.5802173", longitude: "-93.6166144" })).toEqual({
      latitude: 41.5802173,
      longitude: -93.6166144,
    });
  });

  it("refuses half a pair, empty strings and (0, 0)", () => {
    expect(coordinatesOf({ latitude: 41.58, longitude: null })).toBeNull();
    expect(coordinatesOf({ latitude: "", longitude: "" })).toBeNull();
    expect(coordinatesOf({ latitude: 0, longitude: 0 })).toBeNull();
  });
});

describe("isHotelsNearIndexable and hotelsNearPath", () => {
  it("indexes a page only with three or more hotels in range", () => {
    expect(isHotelsNearIndexable(0)).toBe(false);
    expect(isHotelsNearIndexable(2)).toBe(false);
    expect(isHotelsNearIndexable(3)).toBe(true);
  });

  it("builds the route App.tsx registers", () => {
    expect(hotelsNearPath("principal-park")).toBe("/stay/near/principal-park");
  });
});
