/**
 * WEB-BE-070: what the restaurant page and the edge shell may say about
 * Google's rating and price.
 */
import { describe, it, expect } from "vitest";
import {
  checkedDateLabel,
  googleRatingSummary,
  priceFromGoogle,
  priceSentence,
  restaurantReviewCount,
  reviewCountLabel,
} from "@/lib/googleFacts";
import { restaurantPageTitle, restaurantSeoKeywords } from "@/lib/restaurantMeta";
import { entityShellRewrites } from "../../../functions/_middleware";

describe("priceFromGoogle", () => {
  it("is true only for a price Google supplied", () => {
    expect(priceFromGoogle({ price_range_source: "google" })).toBe(true);
    for (const source of [null, undefined, "", "admin", "owner", "Google"]) {
      expect(priceFromGoogle({ price_range_source: source })).toBe(false);
    }
  });

  it("phrases the price sentence with and without Google", () => {
    expect(priceSentence("Lucca", "$$", true)).toBe("Google lists Lucca at $$ on its one-to-four-dollar-sign scale.");
    expect(priceSentence("Lucca", "$$", false)).not.toMatch(/Google/);
  });
});

describe("restaurantReviewCount", () => {
  it("is Google's count beside a rating", () => {
    expect(restaurantReviewCount({ rating: 4.5, google_review_count: 312 })).toBe(312);
  });

  it("is null without a rating, a count, or with zero", () => {
    expect(restaurantReviewCount({ rating: null, google_review_count: 312 })).toBeNull();
    expect(restaurantReviewCount({ rating: 0, google_review_count: 312 })).toBeNull();
    expect(restaurantReviewCount({ rating: 4.5, google_review_count: null })).toBeNull();
    expect(restaurantReviewCount({ rating: 4.5, google_review_count: 0 })).toBeNull();
    expect(restaurantReviewCount({ rating: 4.5 })).toBeNull();
  });
});

describe("googleRatingSummary", () => {
  it("carries the rating, count and check date", () => {
    expect(
      googleRatingSummary({ rating: 4.4, google_review_count: 1, google_rating_checked_at: "2026-11-21T15:00:00Z" }),
    ).toEqual({ rating: 4.4, reviewCount: 1, checkedAt: "2026-11-21T15:00:00Z" });
  });

  it("says when the check date is not recorded instead of inventing one", () => {
    expect(googleRatingSummary({ rating: 4.4 })).toEqual({ rating: 4.4, reviewCount: null, checkedAt: null });
    expect(googleRatingSummary({ rating: 4.4, google_rating_checked_at: "garbage" })?.checkedAt).toBeNull();
  });

  it("is null with no rating", () => {
    expect(googleRatingSummary({ rating: null, google_review_count: 10 })).toBeNull();
    expect(googleRatingSummary({})).toBeNull();
  });
});

describe("labels", () => {
  it("formats counts and Central dates", () => {
    expect(reviewCountLabel(1)).toBe("1 review");
    expect(reviewCountLabel(1234)).toBe("1,234 reviews");
    // 03:00 UTC on the 22nd is still the 21st in Des Moines.
    expect(checkedDateLabel("2026-11-22T03:00:00Z")).toBe("November 21, 2026");
    expect(checkedDateLabel(null)).toBeNull();
  });
});

describe("page and edge shell agree on Reviews", () => {
  const row = {
    id: "1",
    name: "Lucca",
    location: "420 E Locust St, Des Moines, IA 50309",
    rating: 4.6,
    google_review_count: 312,
  };

  it("the page's title and keywords say Reviews with a Google count", () => {
    const input = { ...row, reviewCount: restaurantReviewCount(row) };
    expect(restaurantPageTitle(input)).toMatch(/Reviews/);
    expect(restaurantSeoKeywords(input)).toContain("Lucca reviews");
  });

  it("the shell's title follows the same count", () => {
    const title = (r: Record<string, unknown>) =>
      entityShellRewrites({
        pageUrl: "https://example.test/restaurants/lucca",
        sbBase: "https://sb.test",
        type: "restaurant",
        entity: { id: "1", title: "Lucca", row: r },
      }).find((rule) => rule.selector === "title");
    const withCount = JSON.stringify(title(row));
    expect(withCount).toMatch(/Reviews/);
    expect(withCount).toContain(restaurantPageTitle({ ...row, reviewCount: 312 }));
    // Counter-assertion: no count, no Reviews, on either side.
    const without = { ...row, google_review_count: null };
    expect(JSON.stringify(title(without))).not.toMatch(/Reviews/);
    expect(restaurantPageTitle({ ...without, reviewCount: restaurantReviewCount(without) })).not.toMatch(/Reviews/);
  });
});
