/**
 * Google Places photo handling, within the Maps Platform terms (WEB-BE-044).
 *
 * THREE THINGS WERE WRONG AND THEY PULL IN DIFFERENT DIRECTIONS.
 *
 * 1. bulk-update-restaurants wrote a Places media URL straight into
 *    restaurants.image_url - WITHOUT the API key, with a comment claiming it
 *    was storing "the photo reference name instead of the full URL with API
 *    key". It is neither: it is a full media URL that 403s, so those rows have
 *    been rendering a broken image ever since. Hot-linking Places media from a
 *    content column is also outside the terms even when it works.
 *
 * 2. backfill-images copies the photo bytes into Supabase Storage and keeps
 *    them. Maps Platform terms permit caching Place content for at most 30
 *    days (place IDs are the exception), so a permanent copy is the violation -
 *    not the copying itself.
 *
 * 3. Nothing carries the attribution Places requires alongside the photo.
 *
 * WHAT THIS MODULE IS. The detector, the URL shape, the 30-day rule and the
 * attribution string, as pure functions, so the guard in imageStorage.ts and
 * the writers can agree and a test can reach all of it. Nothing here fetches.
 */

/** Host that serves Place photo media. */
export const PLACES_HOST = "places.googleapis.com";

/**
 * How long a cached copy of Place content may live. Maps Platform terms:
 * Place content may be cached for up to 30 days; place IDs are exempt and may
 * be stored indefinitely, which is why google_place_id is untouched by all of
 * this.
 */
export const PLACES_CACHE_MAX_AGE_DAYS = 30;

/**
 * The attribution line Places requires wherever its content is shown. Plain
 * text rather than the HTML Google returns in `photos[].authorAttributions`,
 * because that HTML would need sanitising at every render site; the per-photo
 * author attribution is stored separately and rendered next to the photo.
 */
export const GOOGLE_ATTRIBUTION_TEXT = "Some content provided by Google";

/**
 * Is this a Places media URL? Matched on host plus the /media path segment, so
 * a place page link (maps.google.com/...) and a Street View tile are not caught
 * by it - only the endpoint that serves Place photo BYTES, which is the one the
 * terms constrain.
 */
export function isPlacesMediaUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.hostname !== PLACES_HOST) return false;
  // /v1/places/<place>/photos/<photo>/media
  return parsed.pathname.endsWith("/media");
}

export interface PlacesMediaOptions {
  maxWidthPx?: number;
  maxHeightPx?: number;
  /** Server-side only. Never build a URL with a key for anything that reaches a browser or a database column. */
  apiKey?: string;
}

/**
 * Build the media URL for a Place photo resource name
 * ("places/<id>/photos/<ref>"). The resource name is what belongs on a row;
 * this URL is built at fetch time and thrown away.
 */
export function placesMediaUrl(photoName: string, options: PlacesMediaOptions = {}): string {
  const { maxWidthPx = 1600, maxHeightPx = 1200, apiKey } = options;
  const base = `https://${PLACES_HOST}/v1/${photoName}/media?maxHeightPx=${maxHeightPx}&maxWidthPx=${maxWidthPx}`;
  return apiKey ? `${base}&key=${apiKey}` : base;
}

/** The API key, redacted, for a log line. A key in a log is a leaked key. */
export function redactPlacesKey(url: string): string {
  return url.replace(/([?&]key=)[^&]*/i, "$1REDACTED");
}

/**
 * Has a cached copy of Place content aged out of the 30-day window?
 *
 * A null or unparseable timestamp reads as EXPIRED, not as fresh. A copy whose
 * age cannot be established is exactly the copy that should not be served: the
 * rows that predate the provenance columns are all of them.
 */
export function isPlacesCopyExpired(
  fetchedAtIso: string | null | undefined,
  nowMs: number,
  maxAgeDays: number = PLACES_CACHE_MAX_AGE_DAYS,
): boolean {
  if (!fetchedAtIso) return true;
  const at = new Date(fetchedAtIso).getTime();
  if (!Number.isFinite(at)) return true;
  return nowMs - at > maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * The photo resource name inside a media URL, or null. Lets a repair pass turn
 * the broken image_url values already in the table back into something a
 * refresh could use, instead of just discarding them.
 */
export function photoNameFromMediaUrl(url: string): string | null {
  if (!isPlacesMediaUrl(url)) return null;
  const path = new URL(url).pathname.replace(/^\/v1\//, "").replace(/\/media$/, "");
  return path || null;
}
