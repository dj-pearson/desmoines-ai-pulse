/**
 * The ranked list at the top of /restaurants (SEO-038), from stored columns
 * and nothing else.
 *
 * WHY A RULE AND NOT PICKS. SEO-010 and SEO-026 both stopped at "editorial
 * picks with reasons", because a reason needs somebody who has eaten there and
 * a generated one reads well and is worth nothing. A rule a reader can check
 * against Google is the honest version of "best": it says what it measured.
 *
 * WHAT THE TABLE CAN BACK, measured against production 2026-10-01:
 *   rating            418 of 448 open rows, every one with a google_place_id;
 *                     bulk-update-restaurants copies it from Google Places
 *   review count      google_review_count since WEB-BE-070: Google's
 *                     userRatingCount, read with the rating. Null until a
 *                     Places refresh reads it for that row.
 *   popularity_score  computed nightly from rating, count, views and hours
 *                     freshness since WEB-BE-076 (20261121000170); a blend,
 *                     so not something a reader can check against Google
 *
 * So the ranking is the Google rating, highest first, over rows with at least
 * TOP_RATED_MIN_REVIEWS Google reviews (WEB-BE-076, owner decision: 25), ties
 * broken by the larger review count and then by name, among rows that are
 * open, inside the metro, and a place you sit down to eat. A row whose count
 * has not been read yet is left out: the floor cannot be checked for it.
 *
 * THE RATING IS GOOGLE'S, so it never becomes AggregateRating in our JSON-LD
 * (Google's review-snippet policy wants first-party ratings; WEB-SEO-025). The
 * ItemList of these 20 carries no rating at all.
 */
import { DES_MOINES_METRO_BOUNDS } from "@/lib/geo";
import { NEIGHBORHOOD_BOUNDARIES } from "@/lib/neighborhoodBoundaries";
import { isPermanentlyClosedRestaurant, isVisitableStatus } from "@/lib/restaurantStatus";
import { restaurantLocality } from "@/lib/restaurantMeta";

export interface RankedRestaurantRow {
  id: string;
  name: string;
  slug: string | null;
  cuisine: string | null;
  city: string | null;
  location: string | null;
  neighborhood?: string | null;
  price_range: string | null;
  rating: number | string | null;
  status: string | null;
  business_status?: string | null;
  google_place_id: string | null;
  /** Google's review count (WEB-BE-070). Null or absent: not read yet. */
  google_review_count?: number | null;
  is_merged?: boolean | null;
  latitude: number | null;
  longitude: number | null;
}

/** How many the hub lists. The ItemList carries the same rows. */
export const TOP_RATED_LIMIT = 20;

/**
 * The fewest Google reviews a row needs to be ranked (WEB-BE-076). The owner
 * set it at 25: below that a single visit's review moves the average by a
 * tenth of a star or more.
 */
export const TOP_RATED_MIN_REVIEWS = 25;

/**
 * The selection rule, printed on the page beside the heading. It has to say
 * what rankTopRated does, in that order, and nothing it does not.
 */
export const TOP_RATED_RULE =
  `Ranked by Google star rating among places with at least ${TOP_RATED_MIN_REVIEWS} Google reviews, ties going to the one with more reviews, counting open restaurants inside the Des Moines metro once per Google listing and leaving out bakeries, coffee shops and dessert shops.`;

/**
 * The rule in one line, printed beside the heading so the list never appears
 * without it. TOP_RATED_RULE is the full version under the list.
 */
export const TOP_RATED_HEADING_RULE = `By Google rating, ${TOP_RATED_MIN_REVIEWS}+ reviews, ties to more reviews`;

/** Where the numbers come from, said under the rule. */
export const TOP_RATED_CAVEAT =
  "The ratings and review counts are Google's, copied into our listings when we last checked each place.";

/**
 * Cuisine words that mark a counter rather than a restaurant. A row is left
 * out when every part of its cuisine is one of these or a neutral word, and at
 * least one is one of these: "Bakery", "Coffee/Beverages" and "Coffee/Cafe"
 * go; "Cafe" alone and "American/Bakery/Steakhouse" stay.
 */
const NOT_A_RESTAURANT =
  /^(bakery|bakeries|coffee|coffee shop|beverages|ice cream|frozen yogurt|desserts?|gelato|donuts?|cupcakes?)$/i;
/** Words that say nothing either way, so they neither keep nor drop a row. */
const NEUTRAL_PART = /^(caf[eé]s?|tea|boba|boba tea|shop)$/i;

function cuisineParts(cuisine: string | null | undefined): string[] {
  return (cuisine ?? "")
    .split(/[,/()&+]| and /i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function isCounterNotRestaurant(cuisine: string | null | undefined): boolean {
  const parts = cuisineParts(cuisine);
  return (
    parts.some((p) => NOT_A_RESTAURANT.test(p)) &&
    parts.every((p) => NOT_A_RESTAURANT.test(p) || NEUTRAL_PART.test(p))
  );
}

/**
 * Inside the metro box from geo.ts. Unlike isInMetro, a row with no
 * coordinates is OUT: a ranked list makes a claim about where a place is,
 * and the rows with no lat/lng include addresses in other states.
 */
export function hasMetroCoordinates(row: Pick<RankedRestaurantRow, "latitude" | "longitude">): boolean {
  const { latitude, longitude } = row;
  if (latitude == null || longitude == null) return false;
  return (
    latitude >= DES_MOINES_METRO_BOUNDS.minLatitude &&
    latitude <= DES_MOINES_METRO_BOUNDS.maxLatitude &&
    longitude >= DES_MOINES_METRO_BOUNDS.minLongitude &&
    longitude <= DES_MOINES_METRO_BOUNDS.maxLongitude
  );
}

/** Google's review count as a whole number, or null when it was never read. */
export function reviewCountOf(row: Pick<RankedRestaurantRow, "google_review_count">): number | null {
  const n = row.google_review_count;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

export function ratingOf(row: Pick<RankedRestaurantRow, "rating">): number | null {
  if (row.rating == null || row.rating === "") return null;
  const n = typeof row.rating === "number" ? row.rating : Number(row.rating);
  return Number.isFinite(n) && n > 0 && n <= 5 ? n : null;
}

/** Open for business today, by our status and Google's. */
export function isOpenForRanking(row: Pick<RankedRestaurantRow, "status" | "business_status" | "is_merged">): boolean {
  if (row.is_merged === true) return false;
  if (!isVisitableStatus(row.status)) return false;
  if (isPermanentlyClosedRestaurant(row)) return false;
  return (row.business_status ?? "").trim().toUpperCase() !== "CLOSED_TEMPORARILY";
}

/** Why a row is not ranked, or null when it is eligible. Exported for tests and the measure script. */
export function ineligibleReason(row: RankedRestaurantRow): string | null {
  if (!row.slug) return "no slug";
  if (ratingOf(row) == null) return "no rating";
  if (!isOpenForRanking(row)) return "not open";
  if (!hasMetroCoordinates(row)) return "outside the metro or no coordinates";
  if (isCounterNotRestaurant(row.cuisine)) return "bakery, coffee or dessert";
  const reviews = reviewCountOf(row);
  if (reviews == null) return "review count not read";
  if (reviews < TOP_RATED_MIN_REVIEWS) return `fewer than ${TOP_RATED_MIN_REVIEWS} Google reviews`;
  return null;
}

/**
 * TOP_RATED_RULE as code: eligible rows (which includes the review floor),
 * rating descending, then review count descending, then name ascending, the
 * first row per Google listing kept. Pure, so the page and the tests run
 * the same function.
 */
export function rankTopRated<T extends RankedRestaurantRow>(rows: readonly T[], limit = TOP_RATED_LIMIT): T[] {
  const sorted = rows
    .filter((r) => ineligibleReason(r) === null)
    .sort(
      (a, b) =>
        (ratingOf(b) ?? 0) - (ratingOf(a) ?? 0) ||
        (reviewCountOf(b) ?? 0) - (reviewCountOf(a) ?? 0) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
        a.id.localeCompare(b.id),
    );
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of sorted) {
    const key = row.google_place_id?.trim() || `row:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Where the row says it is: the mapped neighbourhood (SEO-060) by its name,
 * else the address's city. Null when the row says neither.
 */
export function rankedAreaLabel(row: Pick<RankedRestaurantRow, "neighborhood" | "city" | "location">): string | null {
  const hood = row.neighborhood ? NEIGHBORHOOD_BOUNDARIES.find((n) => n.slug === row.neighborhood) : undefined;
  if (hood) return hood.name;
  return restaurantLocality(row);
}

/**
 * The one factual line under each name, from the row: cuisine, area, price
 * tier, Google rating. A part the row does not have is left out, never filled.
 */
export function rankedFacts(row: RankedRestaurantRow): string[] {
  const rating = ratingOf(row);
  return [
    row.cuisine?.trim() || null,
    rankedAreaLabel(row),
    row.price_range?.trim() || null,
    rating != null ? `${rating.toFixed(1)} on Google` : null,
  ].filter((p): p is string => Boolean(p));
}
