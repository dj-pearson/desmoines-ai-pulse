/**
 * WEB-BE-070: what the restaurant page may say about Google's rating and price.
 *
 * No imports, so functions/_middleware.ts can use it as well as the page, and
 * the edge shell's title agrees with the React page's.
 *
 * The rating was shown in four places with no date and no count, and the price
 * was credited to Google ("on Google", "Google lists ... at $$") whatever had
 * written it. The columns behind these helpers come from migration
 * 20261121000130 and are written by supabase/functions/_shared/placeFacts.ts.
 */

export interface GoogleFactsRow {
  rating?: number | null;
  google_review_count?: number | null;
  google_rating_checked_at?: string | null;
  price_range_source?: string | null;
}

/** True only when Google's priceLevel supplied the stored price_range. */
export function priceFromGoogle(row: Pick<GoogleFactsRow, "price_range_source">): boolean {
  return row.price_range_source === "google";
}

/**
 * Google's review count when the page shows it: a whole number above zero,
 * beside a rating. This is what restaurantMeta's reviewCount takes on both the
 * page and the edge shell, so "Reviews" in the title follows a count the page
 * actually shows.
 */
export function restaurantReviewCount(row: Pick<GoogleFactsRow, "rating" | "google_review_count">): number | null {
  const rating = Number(row.rating);
  const count = row.google_review_count;
  if (!Number.isFinite(rating) || rating <= 0) return null;
  if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) return null;
  return count;
}

export interface GoogleRatingSummary {
  rating: number;
  /** Null when Google's count was never read for this row. */
  reviewCount: number | null;
  /** ISO instant of the last read, or null when the row predates the check date. */
  checkedAt: string | null;
}

/** The rating, its count and its check date, or null when there is no rating to show. */
export function googleRatingSummary(row: GoogleFactsRow): GoogleRatingSummary | null {
  const rating = Number(row.rating);
  if (row.rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  const at = row.google_rating_checked_at;
  const checkedAt = typeof at === "string" && at && !Number.isNaN(new Date(at).getTime()) ? at : null;
  return { rating, reviewCount: restaurantReviewCount(row), checkedAt };
}

/** "1,234 reviews" / "1 review". */
export function reviewCountLabel(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "review" : "reviews"}`;
}

/** A check date as a Central calendar date, e.g. "November 21, 2026". */
export function checkedDateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
}

/** The FAQ / summary sentence about price, crediting Google only when Google supplied it. */
export function priceSentence(name: string, tier: string, fromGoogle: boolean): string {
  return fromGoogle
    ? `Google lists ${name} at ${tier} on its one-to-four-dollar-sign scale.`
    : `${name} is listed at ${tier} on a one-to-four-dollar-sign scale.`;
}
