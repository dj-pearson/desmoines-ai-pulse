/**
 * The credit a Google Places photo has to carry wherever it is shown.
 *
 * Hotel images copied from Google Places by backfill-images live under a
 * Storage key ending `places-photo-<ms>.<ext>`
 * (supabase/functions/_shared/placesPhoto.ts, PLACES_COPY_MARKER). The credit
 * keys off that file name rather than off a column, so it still renders on a
 * surface whose query did not select places_photo_attribution: the worst case
 * there is the Google line without the author's name, never a Places photo
 * with no credit at all.
 */

/** Must equal PLACES_COPY_MARKER in _shared/placesPhoto.ts (pinned by places-photo-terms.test.ts). */
export const PLACES_COPY_MARKER = "places-photo-";

const COPY = new RegExp(`/${PLACES_COPY_MARKER}\\d+\\.[A-Za-z0-9]{2,5}$`);

/**
 * The generic line Places uses when it names no author (GOOGLE_ATTRIBUTION_TEXT
 * on the server). Not an author's name, so it is not shown as one.
 */
const GENERIC_ATTRIBUTION = "Some content provided by Google";

/** Is this image URL a Google Places photo copy? */
export function isPlacesPhotoCopy(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false;
  return COPY.test(imageUrl.split(/[?#]/)[0]);
}

/**
 * "Photo: <author>, Google Maps", "Photo: Google Maps" when no author is
 * known, or null when the image is not a Places photo.
 */
export function placesPhotoCredit(
  imageUrl: string | null | undefined,
  attribution: string | null | undefined,
): string | null {
  if (!isPlacesPhotoCopy(imageUrl)) return null;
  const author = attribution?.trim();
  return author && author !== GENERIC_ATTRIBUTION ? `Photo: ${author}, Google Maps` : "Photo: Google Maps";
}
