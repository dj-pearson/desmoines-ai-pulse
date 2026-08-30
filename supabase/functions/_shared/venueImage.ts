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
 * INERT UNTIL FILLED IN. known_venues.image_url is null for every venue until
 * someone sets it, and a null resolves to null here, which callers treat as
 * "use the per-event image". So deploying this changes nothing on its own.
 */

import { findEventSourceProfile } from "./eventSourceProfiles.ts";

/** Cache TTL. Venue images change about never; 15 minutes is for the operator
 *  who has just set one and is watching the next run. */
const CACHE_TTL_MS = 15 * 60 * 1000;

interface VenueImageCache {
  fetchedAt: number;
  /** Lowercased venue name / alias -> image URL. Only venues WITH one. */
  byName: Map<string, string>;
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
    return { fetchedAt: 0, byName };
  }

  for (const row of (data ?? []) as { name: string; aliases: string[] | null; image_url: string }[]) {
    if (!row.image_url) continue;
    byName.set(row.name.toLowerCase().trim(), row.image_url);
    for (const alias of row.aliases ?? []) {
      if (alias) byName.set(alias.toLowerCase().trim(), row.image_url);
    }
  }

  cache = { fetchedAt: Date.now(), byName };
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
 * The whole decision in one call, for an ingest path deciding what to do with a
 * scraped item.
 *
 * `imageUrl` is the resolved value to store. `skipFetch` says whether the caller
 * should skip fetchAndStoreImage entirely - which is the point: not "download it
 * and then dedupe", but "do not download it".
 */
export async function resolveEventImage(
  supabase: Client,
  args: { sourceUrl: string; scrapedImageUrl?: string | null },
): Promise<{ imageUrl: string | null; skipFetch: boolean; venueName: string | null }> {
  const venueName = venueNameForSourceUrl(args.sourceUrl);
  const venueImage = venueName ? await venueImageForSourceUrl(supabase, args.sourceUrl) : null;

  if (venueImage) {
    return { imageUrl: venueImage, skipFetch: true, venueName };
  }
  return { imageUrl: args.scrapedImageUrl ?? null, skipFetch: false, venueName };
}
