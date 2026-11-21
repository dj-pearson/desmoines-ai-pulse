/**
 * Fallback image-source helpers used when scraping a record's source_url
 * fails to yield an image. Tried in order:
 *   1) Existing venue/restaurant/attraction in our DB with the same name
 *   2) Their website (re-scraped for og:image / JSON-LD)
 *   3) Category default (admin-supplied generic image)
 * Google Places is not in the chain (WEB-BE-044): getGooglePlacesPhotos below
 * serves the admin picker only, and hotels copy their Places photo through
 * the 30-day refresh path in backfill-images/hotels.ts.
 */

import { extractImageFromHtml } from "./imageStorage.ts";
import { fetchPublicUrl } from "./fetchGuard.ts";
import { placesMediaUrl } from "./placesPhoto.ts";

/**
 * Look up a venue by name in restaurants and attractions tables.
 * Returns whatever we find, prioritising an already-stored Supabase image
 * (since that's known-good) over a website to scrape.
 */
export async function findExistingVenueRecord(
  supabase: any,
  venueName: string | null,
): Promise<{ imageUrl: string | null; website: string | null; lat: number | null; lng: number | null } | null> {
  if (!venueName) return null;
  const trimmed = venueName.trim();
  if (trimmed.length < 3) return null;

  // Try exact match first, then ilike — restaurants then attractions
  const tables = ["restaurants", "attractions"] as const;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const storageBase = `${supabaseUrl}/storage/v1/object/public/media/`;

  for (const table of tables) {
    const { data: exact, error: exactError } = await supabase
      .from(table)
      .select("image_url, website, latitude, longitude")
      .ilike("name", trimmed)
      .limit(1)
      .maybeSingle();
    // WEB-BE-032. Best-effort by design - a miss falls through to the next
    // fallback - but a FAILED read is not a miss, and the next fallback is a
    // paid Google Places call. Silently paying for a lookup because a local
    // read broke is worth a log line.
    if (exactError) console.warn(`[imageFallbacks] exact venue lookup on ${table} failed: ${exactError.message}`);

    if (exact) {
      const hasGoodImage =
        typeof exact.image_url === "string" && exact.image_url.startsWith(storageBase);
      return {
        imageUrl: hasGoodImage ? exact.image_url : null,
        website: exact.website ?? null,
        lat: exact.latitude ?? null,
        lng: exact.longitude ?? null,
      };
    }

    // Looser match — venue strings often include suffixes like "Des Moines Civic Center"
    const { data: fuzzy, error: fuzzyError } = await supabase
      .from(table)
      .select("image_url, website, latitude, longitude")
      .ilike("name", `%${trimmed}%`)
      .limit(1)
      .maybeSingle();
    // Same for the looser match.
    if (fuzzyError) console.warn(`[imageFallbacks] fuzzy venue lookup on ${table} failed: ${fuzzyError.message}`);

    if (fuzzy) {
      const hasGoodImage =
        typeof fuzzy.image_url === "string" && fuzzy.image_url.startsWith(storageBase);
      return {
        imageUrl: hasGoodImage ? fuzzy.image_url : null,
        website: fuzzy.website ?? null,
        lat: fuzzy.latitude ?? null,
        lng: fuzzy.longitude ?? null,
      };
    }
  }
  return null;
}

/**
 * Re-scrape a website for an image — same logic as scraping the source_url
 * but reusable for venue websites discovered in step 1.
 */
export async function scrapeImageFromWebsite(website: string): Promise<string | null> {
  try {
    // The venue website is a stored or scraped value, not ours: resolve the
    // host and re-check every redirect, so a 302 cannot reach an internal
    // address. A refusal throws and lands in the catch below as "no image".
    const response = await fetchPublicUrl(website, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;

    const reader = response.body?.getReader();
    if (!reader) return null;
    let html = "";
    let bytesRead = 0;
    const MAX = 200 * 1024;
    while (bytesRead < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      bytesRead += value.byteLength;
    }
    reader.cancel();
    return extractImageFromHtml(html, website);
  } catch {
    return null;
  }
}

/**
 * Up to `maxPhotos` photo URLs from the top matching Place, for the manual
 * image picker so admins can choose. Text Search (New), biased to Des Moines.
 *
 * There is no single-photo variant any more: backfill-images was its only
 * caller, and fetchAndStoreImage refuses the media URL it returned, so every
 * call was a billed search whose answer was thrown away (WEB-BE-044 AC2).
 */
export async function getGooglePlacesPhotos(
  venueName: string,
  lat: number | null,
  lng: number | null,
  maxPhotos: number = 6,
): Promise<string[]> {
  const apiKey = Deno.env.get("GOOGLE_SEARCH_API");
  if (!apiKey) return [];
  if (!venueName || venueName.trim().length < 3) return [];

  try {
    const body: Record<string, unknown> = {
      textQuery: venueName,
      maxResultCount: 1,
    };
    if (lat != null && lng != null) {
      body.locationBias = {
        circle: { center: { latitude: lat, longitude: lng }, radius: 25_000 },
      };
    } else {
      body.locationBias = {
        circle: { center: { latitude: 41.5868, longitude: -93.625 }, radius: 50_000 },
      };
    }

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const photos: Array<{ name?: string }> = data?.places?.[0]?.photos ?? [];
    return photos
      .slice(0, maxPhotos)
      .map((p) => p.name)
      .filter((n): n is string => !!n)
      // NOTE (WEB-BE-044): these URLs carry the API key and this function's only
      // caller, find-image-candidates, returns them in an HTTP response to the
      // admin browser. Admin-gated, so the exposure is narrow, but the key is
      // still readable in a network tab. Fixing it needs more than stripping
      // the key: a key-less media URL 403s, and image-proxy - which could add
      // the key server-side - requires an Authorization header that an <img>
      // tag cannot send. Recorded rather than half-fixed.
      .map((n) => placesMediaUrl(n, { apiKey }));
  } catch {
    return [];
  }
}

/**
 * Per-category default image URL. Empty values mean "no default for this
 * category — leave the record without an image". Once you upload generic
 * hero images to Supabase Storage (e.g. media/defaults/event-music.jpg)
 * fill these in and they'll be used as a last resort.
 *
 * The existence of a default is a deliberate UX trade-off: a generic
 * category photo is usually better than a blank tile in lists.
 */
const CATEGORY_DEFAULTS: Record<string, string> = {
  // Events — keyed by lowercased event.category
  music: "",
  concert: "",
  sports: "",
  family: "",
  food: "",
  arts: "",
  theater: "",
  festival: "",
  community: "",
  // Generic fallbacks per content type
  events: "",
  restaurants: "",
  attractions: "",
  playgrounds: "",
};

export function getCategoryDefaultImage(
  contentType: string,
  recordCategory?: string | null,
): string | null {
  if (recordCategory) {
    const key = recordCategory.toLowerCase().trim();
    if (CATEGORY_DEFAULTS[key]) return CATEGORY_DEFAULTS[key];
  }
  return CATEGORY_DEFAULTS[contentType] || null;
}
