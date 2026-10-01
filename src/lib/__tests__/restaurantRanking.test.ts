import { describe, it, expect } from "vitest";
import {
  TOP_RATED_LIMIT,
  TOP_RATED_RULE,
  hasMetroCoordinates,
  ineligibleReason,
  isCounterNotRestaurant,
  rankTopRated,
  rankedAreaLabel,
  rankedFacts,
  type RankedRestaurantRow,
} from "@/lib/restaurantRanking";

let n = 0;
function row(p: Partial<RankedRestaurantRow> & { name: string }): RankedRestaurantRow {
  n += 1;
  return {
    id: `id-${String(n).padStart(3, "0")}`,
    slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    cuisine: "American",
    city: null,
    location: "100 Grand Ave, Des Moines, IA 50309, USA",
    neighborhood: null,
    price_range: "$$",
    rating: 4.5,
    status: "open",
    business_status: null,
    google_place_id: `place-${n}`,
    is_merged: false,
    latitude: 41.59,
    longitude: -93.62,
    ...p,
  };
}

describe("rankTopRated", () => {
  it("orders by rating, highest first, then by name", () => {
    const ranked = rankTopRated([
      row({ name: "Zed", rating: 4.9 }),
      row({ name: "Alpha", rating: 4.7 }),
      row({ name: "Bravo", rating: 4.9 }),
      row({ name: "Charlie", rating: 5 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Charlie", "Bravo", "Zed", "Alpha"]);
  });

  it("reads numeric ratings that PostgREST sends as strings", () => {
    const ranked = rankTopRated([row({ name: "A", rating: "4.6" }), row({ name: "B", rating: "4.8" })]);
    expect(ranked.map((r) => r.name)).toEqual(["B", "A"]);
  });

  it("stops at the limit", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ name: `Place ${String(i).padStart(2, "0")}` }));
    expect(rankTopRated(rows)).toHaveLength(TOP_RATED_LIMIT);
  });

  it("drops closed, not-yet-open, merged and Google-closed rows", () => {
    const ranked = rankTopRated([
      row({ name: "Closed", rating: 5, status: "closed" }),
      row({ name: "Soon", rating: 5, status: "opening_soon" }),
      row({ name: "Announced", rating: 5, status: "announced" }),
      row({ name: "Merged", rating: 5, is_merged: true }),
      row({ name: "Gone", rating: 5, business_status: "CLOSED_PERMANENTLY" }),
      row({ name: "Paused", rating: 5, business_status: "CLOSED_TEMPORARILY" }),
      row({ name: "New", rating: 4.1, status: "newly_opened" }),
      row({ name: "Open", rating: 4 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["New", "Open"]);
  });

  it("drops rows outside the metro box and rows with no coordinates", () => {
    const ranked = rankTopRated([
      row({ name: "San Antonio", rating: 5, latitude: 29.61, longitude: -98.6 }),
      row({ name: "Ames", rating: 5, latitude: 42.03, longitude: -93.62 }),
      row({ name: "Nowhere", rating: 5, latitude: null, longitude: null }),
      row({ name: "Adel", rating: 4.2, latitude: 41.61, longitude: -94.02 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Adel"]);
  });

  it("drops unrated rows and rows with no page to link to", () => {
    const ranked = rankTopRated([
      row({ name: "Unrated", rating: null }),
      row({ name: "No slug", rating: 5, slug: null }),
      row({ name: "Rated", rating: 3.2 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Rated"]);
  });

  it("drops bakeries, coffee shops and dessert shops but keeps restaurants that bake", () => {
    const ranked = rankTopRated([
      row({ name: "Bakery", rating: 5, cuisine: "Bakery" }),
      row({ name: "Coffee", rating: 5, cuisine: "Coffee/Beverages" }),
      row({ name: "Cone", rating: 5, cuisine: "Ice Cream" }),
      row({ name: "Yogurt", rating: 5, cuisine: "Frozen Yogurt" }),
      row({ name: "Triple", rating: 4.9, cuisine: "American/Bakery/Steakhouse" }),
      row({ name: "Cafe", rating: 4.8, cuisine: "Cafe" }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Triple", "Cafe"]);
  });

  it("counts one Google listing once, keeping the higher-ranked row", () => {
    const ranked = rankTopRated([
      row({ name: "Mi Patria Ecuadorian Restaurant", rating: 4.8, google_place_id: "same" }),
      row({ name: "Mi Patria", rating: 4.8, google_place_id: "same" }),
      row({ name: "Other", rating: 4.7, google_place_id: null }),
      row({ name: "Another", rating: 4.7, google_place_id: null }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Mi Patria", "Another", "Other"]);
  });
});

describe("isCounterNotRestaurant", () => {
  it("needs every part of the cuisine to be a counter word", () => {
    expect(isCounterNotRestaurant("Bakery")).toBe(true);
    expect(isCounterNotRestaurant("Coffee/Café")).toBe(true);
    expect(isCounterNotRestaurant("Café (Boba Tea/Desserts)")).toBe(true);
    expect(isCounterNotRestaurant("American, Coffee")).toBe(false);
    expect(isCounterNotRestaurant("Cafe")).toBe(false);
    expect(isCounterNotRestaurant(null)).toBe(false);
  });
});

describe("hasMetroCoordinates", () => {
  it("uses the geo.ts metro box and refuses a missing point", () => {
    expect(hasMetroCoordinates({ latitude: 41.73, longitude: -93.6 })).toBe(true);
    expect(hasMetroCoordinates({ latitude: 47.4, longitude: -122.3 })).toBe(false);
    expect(hasMetroCoordinates({ latitude: null, longitude: -93.6 })).toBe(false);
  });
});

describe("ineligibleReason", () => {
  it("names the first failing condition", () => {
    expect(ineligibleReason(row({ name: "x", rating: null }))).toBe("no rating");
    expect(ineligibleReason(row({ name: "x", status: "closed" }))).toBe("not open");
    expect(ineligibleReason(row({ name: "x" }))).toBeNull();
  });
});

describe("rankedFacts", () => {
  it("is cuisine, area, price and the Google rating, from the row", () => {
    expect(
      rankedFacts(
        row({
          name: "x",
          cuisine: "Japanese",
          location: "4100 University Ave, West Des Moines, IA 50266, US",
          price_range: "$$",
          rating: 5,
        }),
      ),
    ).toEqual(["Japanese", "West Des Moines", "$$", "5.0 on Google"]);
  });

  it("names a mapped neighbourhood ahead of the city", () => {
    expect(rankedAreaLabel({ neighborhood: "east-village", city: "Des Moines", location: null })).toBe("East Village");
    expect(rankedAreaLabel({ neighborhood: null, city: "Ankeny", location: null })).toBe("Ankeny");
  });

  it("leaves out what the row does not have", () => {
    expect(rankedFacts(row({ name: "x", cuisine: null, price_range: null, location: null, city: null }))).toEqual([
      "4.5 on Google",
    ]);
  });
});

describe("TOP_RATED_RULE", () => {
  it("is one sentence that names every condition the code applies", () => {
    expect(TOP_RATED_RULE.match(/\.\s/g)).toBeNull();
    for (const word of ["Google star rating", "alphabetical", "open", "metro", "each Google listing once", "bakeries"]) {
      expect(TOP_RATED_RULE).toContain(word);
    }
  });
});
