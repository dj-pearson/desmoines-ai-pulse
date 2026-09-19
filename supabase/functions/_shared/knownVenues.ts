/**
 * The known-venues lookup, shared by every ingestion path (WEB-BE-050).
 *
 * WHY IT MOVED HERE. firecrawl-scraper held the cache, the query and the
 * matcher wrapper privately, and it was the ONLY ingestion path that set
 * coordinates on an event. ai-crawler set none at all - `grep latitude
 * supabase/functions/ai-crawler/index.ts` returned nothing - so whether an
 * event appeared on the map depended on which scraper happened to find it,
 * and four nightly backfill jobs existed to paper over the difference.
 *
 * COORDINATES ARE THE ONLY THING THIS SETS FOR A NEW CALLER, deliberately.
 * firecrawl also rewrites the event's venue name, its street address and its
 * location string from a match, and WEB-BE-039 is the story about how that
 * went wrong when the matcher was loose. `matchKnownVenue` is conservative now
 * (exact and alias always canonicalize; a partial needs length, word
 * boundaries and coverage), but widening what ai-crawler overwrites is a
 * separate decision from filling in a latitude that was null.
 *
 * The cache is per-isolate and five minutes old at most. known_venues is 46
 * rows; the point is not the bytes, it is that a batch of 50 events would
 * otherwise issue 50 identical queries.
 */
import { matchKnownVenue, type MatchableVenue } from "./venueMatch.ts";

export interface KnownVenue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

export const VENUES_CACHE_TTL_MS = 5 * 60 * 1000;

const SELECT_COLUMNS =
  "id, name, aliases, address, city, state, zip, latitude, longitude, phone, email, website";

let cache: KnownVenue[] | null = null;
let loadedAt = 0;

/** Test/debug helper: forget the cached venues. */
export function clearKnownVenuesCache(): void {
  cache = null;
  loadedAt = 0;
}

/**
 * All active known venues, cached per isolate.
 *
 * A FAILED READ IS NOT AN EMPTY SET, and it is not cached either. Caching []
 * after an error would silently disable venue matching for the rest of the
 * isolate's life - and the symptom, events with no coordinates, is the exact
 * thing the backfills were built to hide.
 */
// deno-lint-ignore no-explicit-any
export async function loadKnownVenues(supabase: any): Promise<KnownVenue[]> {
  const now = Date.now();
  if (cache && now - loadedAt < VENUES_CACHE_TTL_MS) return cache;

  const { data, error } = await supabase
    .from("known_venues")
    .select(SELECT_COLUMNS)
    .eq("is_active", true);

  if (error) {
    console.error("[knownVenues] could not load known venues:", error.message ?? error);
    return cache ?? [];
  }

  const venues: KnownVenue[] = data ?? [];
  cache = venues;
  loadedAt = now;
  console.log(`[knownVenues] loaded ${venues.length} active venue(s)`);
  return venues;
}

/**
 * The known venue this text names, or null. Null is the common and correct
 * answer: a refused match means the caller keeps what the source said.
 */
// deno-lint-ignore no-explicit-any
export async function findKnownVenue(supabase: any, venueText: string): Promise<KnownVenue | null> {
  if (!venueText || !venueText.trim()) return null;
  const venues = await loadKnownVenues(supabase);
  const match = matchKnownVenue(venueText, venues as unknown as MatchableVenue[]);
  if (!match) {
    console.log(`[knownVenues] no confident match for "${venueText}" - keeping the extracted value`);
    return null;
  }
  console.log(
    `[knownVenues] ${match.kind} match: "${venueText}" -> "${match.venue.name}" (via "${match.matchedOn}")`,
  );
  return match.venue as unknown as KnownVenue;
}

/**
 * PURE. The lat/lng fields to spread into a row, or {} when the venue has no
 * usable pair.
 *
 * BOTH OR NEITHER. A row with a latitude and no longitude is worse than a row
 * with neither: every distance query and every map marker reads the pair, and
 * a half-filled row looks geocoded to the backfills that would otherwise fix
 * it. (0, 0) is also refused - it is the Atlantic, and it is what an unset
 * numeric column looks like when something coerced a null.
 */
export function venueCoordinates(
  venue: Pick<KnownVenue, "latitude" | "longitude"> | null,
): { latitude: number; longitude: number } | Record<string, never> {
  if (!venue) return {};
  const { latitude, longitude } = venue;
  if (typeof latitude !== "number" || typeof longitude !== "number") return {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return {};
  if (latitude === 0 && longitude === 0) return {};
  return { latitude, longitude };
}
