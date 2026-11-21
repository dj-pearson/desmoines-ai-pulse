import { describe, it, expect } from "vitest";
import {
  TOP_RATED_HEADING_RULE,
  TOP_RATED_LIMIT,
  TOP_RATED_MIN_REVIEWS,
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
    google_review_count: 100,
    is_merged: false,
    latitude: 41.59,
    longitude: -93.62,
    ...p,
  };
}

describe("rankTopRated", () => {
  it("orders by rating, highest first, then by name when the counts match", () => {
    const ranked = rankTopRated([
      row({ name: "Zed", rating: 4.9 }),
      row({ name: "Alpha", rating: 4.7 }),
      row({ name: "Bravo", rating: 4.9 }),
      row({ name: "Charlie", rating: 5 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Charlie", "Bravo", "Zed", "Alpha"]);
  });

  it("needs 25 Google reviews: a 5.0 from four reviews is not ranked above a 4.8 from thousands", () => {
    const ranked = rankTopRated([
      row({ name: "Four Reviews", rating: 5, google_review_count: 4 }),
      row({ name: "Just Under", rating: 4.9, google_review_count: TOP_RATED_MIN_REVIEWS - 1 }),
      row({ name: "At The Floor", rating: 4.7, google_review_count: TOP_RATED_MIN_REVIEWS }),
      row({ name: "Thousands", rating: 4.8, google_review_count: 3200 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Thousands", "At The Floor"]);
    expect(TOP_RATED_MIN_REVIEWS).toBe(25);
  });

  it("leaves out a row whose review count was never read, rather than guessing", () => {
    const ranked = rankTopRated([
      row({ name: "Unread", rating: 5, google_review_count: null }),
      row({ name: "Absent", rating: 5, google_review_count: undefined }),
      row({ name: "Read", rating: 4.2, google_review_count: 40 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Read"]);
    expect(ineligibleReason(row({ name: "x", google_review_count: null }))).toBe("review count not read");
    expect(ineligibleReason(row({ name: "x", google_review_count: 3 }))).toBe("fewer than 25 Google reviews");
  });

  it("breaks a rating tie by the larger review count, and only then by name", () => {
    const ranked = rankTopRated([
      row({ name: "Aardvark Diner", rating: 4.8, google_review_count: 30 }),
      row({ name: "Zest", rating: 4.8, google_review_count: 2400 }),
      row({ name: "Middle", rating: 4.8, google_review_count: 300 }),
      row({ name: "Bravo", rating: 4.8, google_review_count: 300 }),
      row({ name: "Top", rating: 4.9, google_review_count: 26 }),
    ]);
    // Rating still leads: the 4.9 with 26 reviews stays first. Then count,
    // then name among equal counts.
    expect(ranked.map((r) => r.name)).toEqual(["Top", "Zest", "Bravo", "Middle", "Aardvark Diner"]);
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
    for (const word of [
      "Google star rating",
      `at least ${TOP_RATED_MIN_REVIEWS} Google reviews`,
      "more reviews",
      "open",
      "metro",
      "once per Google listing",
      "bakeries",
    ]) {
      expect(TOP_RATED_RULE).toContain(word);
    }
    // The tie-break is the count now; the rule must not still claim names.
    expect(TOP_RATED_RULE).not.toContain("alphabetical");
  });

  it("has a one-line version for beside the heading that names the floor and the tie-break", () => {
    expect(TOP_RATED_HEADING_RULE).not.toMatch(/[\n.]/);
    expect(TOP_RATED_HEADING_RULE).toContain("Google rating");
    expect(TOP_RATED_HEADING_RULE).toContain(`${TOP_RATED_MIN_REVIEWS}+ reviews`);
    expect(TOP_RATED_HEADING_RULE).toContain("ties to more reviews");
  });
});
