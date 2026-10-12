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

/** One Places photo as Text Search / Place Details return it. */
export interface PlacesPhotoLike {
  name?: string;
  authorAttributions?: Array<{ displayName?: string; uri?: string }>;
}

export interface PlacesPhotoProvenance {
  places_photo_name: string;
  places_photo_attribution: string;
  places_photo_seen_at: string;
}

/**
 * The three provenance columns for the first photo in a Places response, or
 * null when there is no usable photo. The same rule bulk-update-restaurants
 * applies inline: the RESOURCE NAME, the author names joined, and the generic
 * Google line only when Places named no author.
 *
 * `authorAttributions` is only present when the field mask asks for it; a
 * caller that forgets gets the generic line, never an invented author.
 */
export function photoProvenance(
  photos: PlacesPhotoLike[] | null | undefined,
  seenAtIso: string,
): PlacesPhotoProvenance | null {
  const photo = photos?.[0];
  if (!photo?.name || isPlacesMediaUrl(photo.name)) return null;
  const authors = (photo.authorAttributions ?? [])
    .map((a) => a?.displayName?.trim())
    .filter((n): n is string => !!n);
  return {
    places_photo_name: photo.name,
    places_photo_attribution: authors.join(", ") || GOOGLE_ATTRIBUTION_TEXT,
    places_photo_seen_at: seenAtIso,
  };
}

// ---------------------------------------------------------------------------
// Storage copies of the bytes (hotels, 20261020000002).
//
// fetchAndStoreImage still refuses Places media outright: its copies are
// permanent and deduplicated through media_assets. The hotel path keeps a copy
// it can find and delete, under a file name that says what it is, and the
// backfill job replaces or removes it on these two clocks.
// ---------------------------------------------------------------------------

/** Replace a copy once it is this old. Leaves 9 days of 6-hourly retries. */
export const PLACES_COPY_REFRESH_AFTER_DAYS = 20;

/**
 * Delete a copy that is still this old after the refresh attempts. One day
 * under the 30-day limit, so a missed run or two cannot push it over.
 */
export const PLACES_COPY_DELETE_AFTER_DAYS = PLACES_CACHE_MAX_AGE_DAYS - 1;

/**
 * Seconds a browser or the /media edge cache may hold a copy. A long max-age
 * would let a cached copy outlive the deletion, so this is a day, not the year
 * other media gets.
 */
export const PLACES_COPY_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * The file-name marker for a Places copy. src/lib/placesPhotoCredit.ts keys
 * the Google credit off the same marker (pinned by places-photo-terms.test.ts),
 * so a card can tell a Places photo from any other image without a column.
 */
export const PLACES_COPY_MARKER = "places-photo-";

/** `<type>s/<id>/places-photo-<ms>.<ext>` - a new key per copy, so no cache serves old bytes under it. */
export function placesCopyPath(mediaContentType: string, contentId: string, fetchedAtMs: number, ext: string): string {
  return `${mediaContentType}s/${contentId}/${PLACES_COPY_MARKER}${Math.floor(fetchedAtMs)}.${ext}`;
}

/** Does this Storage key, or a URL ending in one, name a Places copy? */
export function isPlacesCopyPath(pathOrUrl: unknown): boolean {
  if (typeof pathOrUrl !== "string" || !pathOrUrl) return false;
  const path = pathOrUrl.split("?")[0];
  return new RegExp(`/${PLACES_COPY_MARKER}\\d+\\.[A-Za-z0-9]{2,5}$`).test(path);
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
