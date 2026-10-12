/**
 * backfill-images, category "hotels": Google Places photo copies kept inside
 * the Maps Platform 30-day rule (migration 20261020000002).
 *
 * WHY HOTELS ARE NOT ON THE SCRAPE CHAIN. The other categories try the source
 * page, a venue record, Places and a category default, and send whatever they
 * find through fetchAndStoreImage - which refuses Places media, because its
 * copies are permanent. Hotels have one source, their own place's photo, and
 * a copy that is meant to be replaced:
 *
 *   1. EXPIRE. A copy older than PLACES_COPY_DELETE_AFTER_DAYS (29) is deleted
 *      from Storage, and image_url is cleared if it still points at it. This
 *      is what keeps the rule true when refreshes keep failing, so it runs
 *      first and is not capped by batchSize.
 *   2. REFRESH. A copy older than PLACES_COPY_REFRESH_AFTER_DAYS (20) is
 *      replaced with fresh bytes under a new key; the old key is then deleted.
 *   3. FILL. An active hotel with a google_place_id and no image gets a copy.
 *
 * A hotel whose image an editor set is never touched: pass 3 needs an empty
 * image_url, and passes 1-2 only clear or replace image_url while it is still
 * this job's copy.
 *
 * Every copy starts from a Place Details read rather than the stored
 * places_photo_name: Google says a photo name can expire, and the read also
 * refreshes the stored reference and its attribution.
 *
 * These guarantees hold only while the job runs, which is why
 * 20261020000003 schedules it.
 */
import { removePlacesPhotoCopy, storePlacesPhotoCopy } from "../_shared/imageStorage.ts";
import {
  PLACES_COPY_DELETE_AFTER_DAYS,
  PLACES_COPY_REFRESH_AFTER_DAYS,
  photoProvenance,
  type PlacesPhotoLike,
} from "../_shared/placesPhoto.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A failed hotel is retried after a day, not the week the scrape chain waits:
 * the usual failure here is a transient Places or Storage error, not a page
 * with no image on it.
 */
const HOTEL_RETRY_MS = DAY_MS;

/** ISO without milliseconds, so it parses inside a PostgREST .or() filter. */
const isoNoMs = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

export interface HotelsOutcome {
  status: number;
  body: Record<string, unknown>;
}

interface HotelImageRow {
  id: string;
  name: string;
  google_place_id: string | null;
  image_url: string | null;
  places_photo_cached_at: string | null;
  places_photo_cached_path: string | null;
}

interface HotelDetail {
  id: string;
  name: string;
  action:
    | "copied"
    | "refreshed"
    | "expired"
    | "would_copy"
    | "would_refresh"
    | "would_expire"
    | "no_photo"
    | "editor_image_kept"
    | "failed";
  imageUrl?: string | null;
  attribution?: string;
  reason?: string;
}

/** Is image_url still the copy this job made? */
export function urlIsCopy(imageUrl: string | null, path: string | null): boolean {
  return !!imageUrl && !!path && imageUrl.split("?")[0].endsWith(`/${path}`);
}

async function freshPhotos(placeId: string, apiKey: string): Promise<PlacesPhotoLike[]> {
  const res = await fetchWithTimeout(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    method: "GET",
    // authorAttributions named explicitly, as bulk-update-restaurants does:
    // the attribution is what the card has to show.
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "photos,photos.authorAttributions" },
  });
  if (!res.ok) throw new Error(`Places details ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.photos) ? data.photos : [];
}

const COLS = "id, name, google_place_id, image_url, places_photo_cached_at, places_photo_cached_path";

export async function backfillHotels(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  { batchSize, dryRun }: { batchSize: number; dryRun: boolean },
): Promise<HotelsOutcome> {
  const apiKey = Deno.env.get("GOOGLE_SEARCH_API");
  if (!apiKey && !dryRun) {
    return { status: 500, body: { error: "GOOGLE_SEARCH_API is not set; hotel photos need Place Details and photo media" } };
  }
  const nowMs = Date.now();
  const deleteBefore = isoNoMs(nowMs - PLACES_COPY_DELETE_AFTER_DAYS * DAY_MS);
  const refreshBefore = isoNoMs(nowMs - PLACES_COPY_REFRESH_AFTER_DAYS * DAY_MS);
  const retryBefore = isoNoMs(nowMs - HOTEL_RETRY_MS);
  const details: HotelDetail[] = [];

  // -- 1. Expire --
  const { data: expiring, error: expireReadError } = await supabase
    .from("hotels")
    .select(COLS)
    .not("places_photo_cached_path", "is", null)
    .or(`places_photo_cached_at.is.null,places_photo_cached_at.lt."${deleteBefore}"`)
    .limit(200);
  if (expireReadError) return { status: 500, body: { error: `hotels expiry read failed: ${expireReadError.message}` } };

  let expired = 0;
  const expiredIds = new Set<string>();
  for (const row of (expiring ?? []) as HotelImageRow[]) {
    if (dryRun) {
      details.push({ id: row.id, name: row.name, action: "would_expire", imageUrl: row.image_url });
      continue;
    }
    const update: Record<string, unknown> = { places_photo_cached_at: null, places_photo_cached_path: null };
    if (urlIsCopy(row.image_url, row.places_photo_cached_path)) update.image_url = null;
    // Row first, then the object: a failed delete leaves an unreferenced file
    // (logged), never a row pointing at a missing one.
    const { error } = await supabase.from("hotels").update(update).eq("id", row.id);
    if (error) {
      details.push({ id: row.id, name: row.name, action: "failed", reason: `expiry update failed: ${error.message}` });
      continue;
    }
    const removed = await removePlacesPhotoCopy(supabase, row.places_photo_cached_path);
    if (!removed.ok) {
      console.error(`[backfill-images:hotels] could not delete expired copy ${row.places_photo_cached_path}: ${removed.reason}`);
    }
    expired++;
    expiredIds.add(row.id);
    details.push({ id: row.id, name: row.name, action: "expired", reason: removed.ok ? undefined : removed.reason });
  }

  // -- 2. Refresh candidates, then 3. fill candidates --
  const { data: stale, error: staleError } = await supabase
    .from("hotels")
    .select(COLS)
    .not("google_place_id", "is", null)
    .not("places_photo_cached_path", "is", null)
    .lt("places_photo_cached_at", refreshBefore)
    .order("places_photo_cached_at", { ascending: true })
    .limit(batchSize);
  if (staleError) return { status: 500, body: { error: `hotels refresh read failed: ${staleError.message}` } };

  const { data: missing, error: missingError } = await supabase
    .from("hotels")
    .select(COLS)
    .eq("is_active", true)
    .not("google_place_id", "is", null)
    .or("image_url.is.null,image_url.eq.")
    .or(`image_checked_at.is.null,image_checked_at.lt."${retryBefore}"`)
    .order("image_checked_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);
  if (missingError) return { status: 500, body: { error: `hotels fill read failed: ${missingError.message}` } };

  const seen = new Set<string>();
  const work: Array<{ row: HotelImageRow; refresh: boolean }> = [];
  for (const row of (stale ?? []) as HotelImageRow[]) {
    if (expiredIds.has(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    work.push({ row, refresh: true });
  }
  for (const row of (missing ?? []) as HotelImageRow[]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    work.push({ row, refresh: false });
  }
  const batch = work.slice(0, batchSize);

  let updated = 0;
  let failed = 0;
  for (const { row, refresh } of batch) {
    if (dryRun) {
      details.push({ id: row.id, name: row.name, action: refresh ? "would_refresh" : "would_copy", imageUrl: row.image_url });
      continue;
    }
    const stamp = new Date().toISOString();

    // An editor replaced our copy: keep their image, drop ours.
    if (refresh && !urlIsCopy(row.image_url, row.places_photo_cached_path)) {
      await supabase.from("hotels").update({ places_photo_cached_at: null, places_photo_cached_path: null }).eq("id", row.id);
      await removePlacesPhotoCopy(supabase, row.places_photo_cached_path);
      details.push({ id: row.id, name: row.name, action: "editor_image_kept", imageUrl: row.image_url });
      continue;
    }

    try {
      const provenance = photoProvenance(await freshPhotos(row.google_place_id!, apiKey!), stamp);
      if (!provenance) {
        // No photo on Google. An existing copy stays until pass 1 expires it.
        await supabase.from("hotels").update({ image_checked_at: stamp }).eq("id", row.id);
        details.push({ id: row.id, name: row.name, action: "no_photo", reason: "Place Details returned no photo" });
        continue;
      }

      const copy = await storePlacesPhotoCopy(supabase, {
        photoName: provenance.places_photo_name,
        apiKey: apiKey!,
        category: "hotels",
        contentId: row.id,
      });
      if (!copy.ok) {
        failed++;
        await supabase.from("hotels").update({ image_checked_at: stamp }).eq("id", row.id);
        details.push({ id: row.id, name: row.name, action: "failed", reason: copy.reason });
        continue;
      }

      const update = {
        ...provenance,
        image_url: copy.publicUrl,
        places_photo_cached_at: copy.fetchedAt,
        places_photo_cached_path: copy.path,
        image_checked_at: stamp,
        updated_at: stamp,
      };
      // Conditional on the row still holding what was read, so an image an
      // editor set during this run is not overwritten.
      let q = supabase.from("hotels").update(update).eq("id", row.id);
      q = refresh
        ? q.eq("places_photo_cached_path", row.places_photo_cached_path)
        : q.or("image_url.is.null,image_url.eq.");
      const { data: hit, error: updateError } = await q.select("id");
      if (updateError || !hit || hit.length === 0) {
        failed++;
        await removePlacesPhotoCopy(supabase, copy.path);
        details.push({
          id: row.id,
          name: row.name,
          action: "failed",
          reason: updateError ? `DB update failed: ${updateError.message}` : "row changed during the run; new copy discarded",
        });
        continue;
      }
      if (refresh && row.places_photo_cached_path && row.places_photo_cached_path !== copy.path) {
        const removed = await removePlacesPhotoCopy(supabase, row.places_photo_cached_path);
        if (!removed.ok) {
          console.error(`[backfill-images:hotels] could not delete replaced copy ${row.places_photo_cached_path}: ${removed.reason}`);
        }
      }
      updated++;
      details.push({
        id: row.id,
        name: row.name,
        action: refresh ? "refreshed" : "copied",
        imageUrl: copy.publicUrl,
        attribution: provenance.places_photo_attribution,
      });
    } catch (error) {
      failed++;
      await supabase.from("hotels").update({ image_checked_at: stamp }).eq("id", row.id);
      details.push({ id: row.id, name: row.name, action: "failed", reason: (error as Error).message });
    }
  }

  return {
    status: 200,
    body: {
      category: "hotels",
      dryRun,
      batchSize,
      expired,
      wouldExpire: details.filter((d) => d.action === "would_expire").length,
      processed: batch.length,
      updated,
      failed,
      // A floor on rows still due after this batch (each read is capped at
      // batchSize). The working set drains on its own
      // (each processed row is filled or stamped), so there is no offset.
      remaining: Math.max(work.length - batch.length, 0),
      nextOffset: null,
      details,
    },
  };
}
