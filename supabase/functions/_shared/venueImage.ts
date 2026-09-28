/**
 * Default hero image per venue, for single-venue event sources.
 *
 * THE COST THIS EXISTS TO REMOVE. fetchAndStoreImage() runs an SSRF check, an
 * HTTP GET, a mime check, a dimension check, a sha256 and a storage upload for
 * every event that carries an image_url. The two dedup passes in that function
 * help but do not solve it: pass 1 matches on the exact source URL, so a venue
 * that stamps a per-event filename on the same artwork misses it, and pass 2
 * matches on content hash only AFTER the bytes have been downloaded - the
 * egress is already spent by the time it dedupes.
 *
 * WHICH SOURCES. A source that declares a single `venue` in
 * eventSourceProfiles.ts is a venue source; one that does not is an aggregator.
 * That partition already exists and is exactly right for this: Hoyt Sherman,
 * Wooly's, Vibrant Music Hall, the Wells Fargo Arena teams, Principal Park, the
 * Playhouse, the Symphony and Horizon all declare one, and Catch Des Moines,
 * SeatGeek and Eventbrite - whose events genuinely each have their own artwork -
 * declare none. Nothing here needs its own list of hosts to drift out of date.
 *
 * KEYED BY VENUE, NOT BY SOURCE. Iowa Barnstormers, Iowa Wild and Iowa Wolves
 * are three sources at one venue and share a single Wells Fargo Arena image.
 *
 * THE EVENT'S OWN VENUE COUNTS TOO. Keying only on the source host meant a
 * Vibrant Music Hall show found through Catch Des Moines or SeatGeek still
 * downloaded its own artwork, even though the same show found on
 * vibrantmusichall.com did not. Aggregators list most of the region's shows, so
 * that was most of the egress. resolveEventImage() now also matches the event's
 * venue text against known_venues (the same conservative matcher that sets
 * coordinates), and a venue with a default image wins whichever site the event
 * came from. An event at a venue with no default keeps its per-event artwork.
 *
 * INERT UNTIL FILLED IN. known_venues.image_url is null for every venue until
 * someone sets it, and a null resolves to null here, which callers treat as
 * "use the per-event image". So deploying this changes nothing on its own.
 */

import { findEventSourceProfile } from "./eventSourceProfiles.ts";
import { matchKnownVenue } from "./venueMatch.ts";

/** Cache TTL. Venue images change about never; 15 minutes is for the operator
 *  who has just set one and is watching the next run. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** A known_venues row that has a default image. */
export interface VenueImageRow {
  name: string;
  aliases: string[] | null;
  image_url: string;
}

interface VenueImageCache {
  fetchedAt: number;
  /** Lowercased venue name / alias -> image URL. Only venues WITH one. */
  byName: Map<string, string>;
  /** The same venues as rows, for matchKnownVenue. */
  venues: VenueImageRow[];
}

let cache: VenueImageCache | null = null;

/** Test seam: drop the cache so a test can set up a different table state. */
export function resetVenueImageCache(): void {
  cache = null;
}

// deno-lint-ignore no-explicit-any
type Client = any;

async function loadCache(supabase: Client): Promise<VenueImageCache> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;

  const byName = new Map<string, string>();
  const { data, error } = await supabase
    .from("known_venues")
    .select("name, aliases, image_url")
    .not("image_url", "is", null);

  // WEB-BE-032: a failed read must not read as "no venue has an image", which
  // would silently restore the per-event downloads this module exists to stop -
  // an outage that costs money and reports nothing. Logged, and the empty cache
  // is NOT stored, so the next call retries instead of serving the failure for
  // fifteen minutes.
  if (error) {
    console.error(`[venueImage] known_venues read failed; falling back to per-event images: ${error.message}`);
    return { fetchedAt: 0, byName, venues: [] };
  }

  const venues: VenueImageRow[] = [];
  for (const row of (data ?? []) as VenueImageRow[]) {
    if (!row.image_url) continue;
    venues.push(row);
    byName.set(row.name.toLowerCase().trim(), row.image_url);
    for (const alias of row.aliases ?? []) {
      if (alias) byName.set(alias.toLowerCase().trim(), row.image_url);
    }
  }

  cache = { fetchedAt: Date.now(), byName, venues };
  return cache;
}

/**
 * The venue this source URL always produces events for, or null when the source
 * is an aggregator. Pure - no database, no network.
 */
export function venueNameForSourceUrl(sourceUrl: string): string | null {
  if (!sourceUrl) return null;
  return findEventSourceProfile(sourceUrl)?.venue?.name ?? null;
}

/**
 * The default image for the venue this source URL belongs to.
 *
 * Returns null - meaning "fall back to the per-event image" - when the source is
 * an aggregator, when the venue has no default set, or when known_venues could
 * not be read. All three are the same instruction to the caller and only the
 * last is a problem, which is why the last one logs.
 */
export async function venueImageForSourceUrl(
  supabase: Client,
  sourceUrl: string,
): Promise<string | null> {
  const venueName = venueNameForSourceUrl(sourceUrl);
  if (!venueName) return null;

  const { byName } = await loadCache(supabase);
  return byName.get(venueName.toLowerCase().trim()) ?? null;
}

/**
 * PURE. The venue-with-a-default-image that this event's venue text names, or
 * null. Uses the same matcher that sets coordinates at ingest, so "Vibrant",
 * "VMH" and "Vibrant Music Hall - Waukee" all resolve and "Music Hall" alone
 * does not.
 */
export function venueImageForVenueText(
  venueText: string | null | undefined,
  venues: readonly VenueImageRow[],
): { venueName: string; imageUrl: string } | null {
  if (!venueText || !venueText.trim() || venues.length === 0) return null;
  const match = matchKnownVenue(venueText, venues);
  if (!match || !match.venue.image_url) return null;
  return { venueName: match.venue.name, imageUrl: match.venue.image_url };
}

/**
 * The whole decision in one call, for an ingest path deciding what to do with a
 * scraped item.
 *
 * `imageUrl` is the resolved value to store. `skipFetch` says whether the caller
 * should skip fetchAndStoreImage entirely - which is the point: not "download it
 * and then dedupe", but "do not download it".
 *
 * Order: the venue the SOURCE belongs to (a single-venue site), then the venue
 * the EVENT names (any site, aggregators included), then the scraped image.
 */
export async function resolveEventImage(
  supabase: Client,
  args: { sourceUrl: string; venueText?: string | null; scrapedImageUrl?: string | null },
): Promise<{ imageUrl: string | null; skipFetch: boolean; venueName: string | null }> {
  const sourceVenue = venueNameForSourceUrl(args.sourceUrl);
  if (sourceVenue || args.venueText) {
    const { byName, venues } = await loadCache(supabase);

    const sourceImage = sourceVenue ? byName.get(sourceVenue.toLowerCase().trim()) : undefined;
    if (sourceVenue && sourceImage) {
      return { imageUrl: sourceImage, skipFetch: true, venueName: sourceVenue };
    }

    const byEventVenue = venueImageForVenueText(args.venueText, venues);
    if (byEventVenue) {
      return { imageUrl: byEventVenue.imageUrl, skipFetch: true, venueName: byEventVenue.venueName };
    }
  }
  return { imageUrl: args.scrapedImageUrl ?? null, skipFetch: false, venueName: sourceVenue };
}
