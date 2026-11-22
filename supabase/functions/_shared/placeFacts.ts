/**
 * WEB-BE-070: the Google facts on a restaurant row that go stale - rating,
 * review count, phone, website, price level, reservability and the listing
 * link - read from one Place Details answer.
 *
 * THE GAP. The full enrichment skips rows whose `enhanced` is 'completed', and
 * the only recurring job asked Places for hours and status. So the rating on
 * the page was whatever Google said on the day the row was first enriched,
 * shown with no date; the review count was fetched by the admin tool and
 * dropped; reservable and google_maps_uri were missing on most rows because
 * those columns arrived after the rows were completed; and the enrichment mask
 * had no priceLevel at all, while the page and the FAQPage JSON-LD said
 * "Google lists" a price that came from page text, a model or a default.
 *
 * One builder, used by the stale refresh and the full enrichment, so the two
 * cannot disagree about what a Places answer means.
 *
 * THE NULL RULE. A field Google left out, or answered with something unusable,
 * is absent from the update, never null. Places omits fields for many reasons
 * (the place has no website listed, the field is not in the mask, a partial
 * answer) and none of them mean the stored value is wrong.
 *
 * Fields an owner or admin locked (WEB-BE-069) are removed afterwards by
 * withoutLockedFields, which also drops each locked field's companions
 * (restaurantFieldLocks.ts LOCK_COMPANIONS), so a locked rating does not get a
 * fresh Google count and date attached to it.
 */

/**
 * Google's price level as the dollar signs the site shows. FREE and
 * UNSPECIFIED have no dollar sign and map to nothing. The admin Places tool
 * (GooglePlacesRestaurantTools.tsx) keeps its own copy in a pure block, and
 * _tests/place-facts.test.ts asserts the two maps are equal.
 */
export const PLACES_PRICE_RANGE: Readonly<Record<string, string>> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

export function placesPriceRange(level: unknown): string | null {
  if (typeof level !== 'string') return null;
  return PLACES_PRICE_RANGE[level] ?? null;
}

/** The value price_range_source takes when Google supplied price_range. */
export const PRICE_SOURCE_GOOGLE = 'google';

export interface GoogleFactsUpdate {
  rating?: number;
  google_review_count?: number;
  google_rating_checked_at?: string;
  phone?: string;
  website?: string;
  price_range?: string;
  price_range_source?: typeof PRICE_SOURCE_GOOGLE;
  /**
   * Stamped with price_range_source on every Google price write. The trigger
   * in migration 20261121000130 clears price_range_source when price_range
   * changes in an update that did not move this stamp, which is how an admin
   * edit or an AI writer stops the page crediting Google with their value.
   */
  price_range_source_at?: string;
  reservable?: boolean;
  google_maps_uri?: string;
}

/**
 * Columns added by migration 20261121000130. A write that includes them is
 * retried without them when PostgREST says a column does not exist, so a
 * function deployed before the migration still writes everything else.
 */
export const GOOGLE_FACT_NEW_COLUMNS = [
  'google_review_count',
  'google_rating_checked_at',
  'price_range_source',
  'price_range_source_at',
] as const;

/** The update without the columns migration 20261121000130 adds. */
export function withoutNewFactColumns<T extends object>(update: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (!(GOOGLE_FACT_NEW_COLUMNS as readonly string[]).includes(key)) out[key] = value;
  }
  return out as T;
}

function httpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function nonEmpty(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value ? value : null;
}

/**
 * The columns one Place Details answer supports, under the null rule above.
 *
 * rating: a number in (0, 5], rounded to one place. Places reports no rating
 * for a place with no reviews; that is absent here, not 0.
 * google_review_count: a whole number >= 0. Zero is a real answer.
 * google_rating_checked_at: set whenever either of the two above is.
 */
export function buildGoogleFactsUpdate(
  details: unknown,
  checkedAt: string = new Date().toISOString(),
): GoogleFactsUpdate {
  if (!details || typeof details !== 'object') return {};
  const place = details as Record<string, unknown>;
  const update: GoogleFactsUpdate = {};

  const rating = place.rating;
  if (typeof rating === 'number' && Number.isFinite(rating) && rating > 0 && rating <= 5) {
    update.rating = Math.round(rating * 10) / 10;
  }
  const count = place.userRatingCount;
  if (typeof count === 'number' && Number.isInteger(count) && count >= 0) {
    update.google_review_count = count;
  }
  if ('rating' in update || 'google_review_count' in update) {
    update.google_rating_checked_at = checkedAt;
  }

  const phone = nonEmpty(place.nationalPhoneNumber);
  if (phone) update.phone = phone;
  const website = httpUrl(place.websiteUri);
  if (website) update.website = website;

  const price = placesPriceRange(place.priceLevel);
  if (price) {
    update.price_range = price;
    update.price_range_source = PRICE_SOURCE_GOOGLE;
    update.price_range_source_at = checkedAt;
  }

  if (typeof place.reservable === 'boolean') update.reservable = place.reservable;
  const mapsUri = httpUrl(place.googleMapsUri);
  if (mapsUri) update.google_maps_uri = mapsUri;

  return update;
}
