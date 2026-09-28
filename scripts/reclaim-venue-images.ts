#!/usr/bin/env tsx
/**
 * Repoint single-venue events at their venue's default image, then reclaim the
 * per-event images that repointing orphans.
 *
 * WHAT THIS IS FOR. Every ingest path downloaded a per-event image and stored
 * it. For an aggregator that is right. For a single-venue source - Hoyt Sherman,
 * Wooly's, Vibrant Music Hall, the Wells Fargo Arena teams, Principal Park, the
 * Playhouse, the Symphony, Horizon - it produced hundreds of near-duplicates of
 * the same venue or team artwork. supabase/functions/_shared/venueImage.ts stops
 * that happening again; this reclaims what is already there.
 *
 *   npx tsx scripts/reclaim-venue-images.ts            # DRY RUN, the default
 *   npx tsx scripts/reclaim-venue-images.ts --apply    # actually change things
 *   npx tsx scripts/reclaim-venue-images.ts --venue "Hoyt Sherman Place"
 *   npx tsx scripts/reclaim-venue-images.ts --source-only  # skip aggregator rows
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * ── THE ONE PROPERTY THAT MATTERS ─────────────────────────────────────────────
 *
 * STORAGE FILES ARE SHARED. imageStorage.ts dedupes twice - once on source URL,
 * once on content hash - and both paths call insertSharedAssetRow, which writes
 * a NEW media_assets row pointing at an EXISTING file_path. So one file can back
 * many events, and deleting a file because one of its events no longer needs it
 * would blank the image on every other event using it.
 *
 * This script therefore never deletes a file because a row was deleted. It
 * deletes media_assets rows first, then re-counts references per file_path and
 * removes only the files that NOTHING points at any more. A file shared with a
 * Catch Des Moines event survives, which is the whole point.
 *
 * ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────────
 *
 * - It will not touch an aggregator's event (Catch Des Moines, SeatGeek,
 *   Eventbrite) unless the event's own venue matches a known venue that has a
 *   default image - the same rule ingest applies (venueImage.ts). Pass
 *   --source-only for the old behaviour: single-venue sources only.
 * - It will not touch a venue with no image_url set. Set those first; a dry run
 *   with none set reports zero and changes nothing.
 * - It will not delete an event, or a known_venues row, or anything in a bucket
 *   other than the one the media_assets row names.
 * - It will not run destructively without --apply.
 *
 * ── UNVERIFIED AGAINST A REAL DATABASE ────────────────────────────────────────
 *
 * Written in a container with no Supabase credentials and no network route to
 * one (the agent proxy answers 403 to CONNECT for anything but package
 * registries). The URL-to-venue mapping is unit-tested offline in
 * scripts/__tests__/reclaim-venue-images.test.mjs; the database and storage
 * calls are NOT. Run the dry run, read the numbers, and only then --apply.
 */
import { createClient } from '@supabase/supabase-js';
// The single source of truth for host -> venue, imported rather than copied.
// A second copy of this table is exactly the drift that put the crisis floor and
// the trial notice on one of two code paths (WEB-LEGAL-005/006). The module has
// no imports of its own, so it loads under tsx unchanged.
import {
  EVENT_SOURCE_PROFILES,
  type EventSourceProfile,
} from '../supabase/functions/_shared/eventSourceProfiles.ts';
// The matcher ingest uses to pick a venue image and coordinates. Imported, not
// copied, for the same reason as the profiles above; it has no imports either.
import { matchKnownVenue } from '../supabase/functions/_shared/venueMatch.ts';

const APPLY = process.argv.includes('--apply');
const SOURCE_ONLY = process.argv.includes('--source-only');
const VENUE_FILTER = (() => {
  const i = process.argv.indexOf('--venue');
  return i !== -1 ? process.argv[i + 1] : null;
})();

/**
 * Built inside main(), not at module scope. The mapping helpers below are
 * imported by the test, and a module that demands credentials on import - or
 * calls process.exit when they are missing - cannot be imported at all.
 */
function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  return createClient(url, key);
}

const bytes = (n: number) =>
  n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;

/** Host of a URL, lowercased, or null when it will not parse. */
function hostOf(raw: string): string | null {
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** The same longest-suffix match findEventSourceProfile() uses in the edge functions. */
export function profileForUrl(raw: string): EventSourceProfile | null {
  const host = hostOf(raw);
  if (!host) return null;
  let best: EventSourceProfile | null = null;
  let bestLen = -1;
  for (const p of EVENT_SOURCE_PROFILES) {
    for (const domain of p.hosts) {
      if (hostMatches(host, domain) && domain.length > bestLen) {
        best = p;
        bestLen = domain.length;
      }
    }
  }
  return best;
}

/** The venue an event's source_url always belongs to, or null for an aggregator. */
export function venueForSourceUrl(raw: string): string | null {
  return profileForUrl(raw)?.venue?.name ?? null;
}

export interface VenueImageRow {
  name: string;
  aliases: string[] | null;
  image_url: string;
}

/**
 * The venue whose default image an event should use, or null. The source's
 * venue first (a single-venue site), then the event's own venue text matched
 * against the venues that have an image - which is how a Vibrant show listed
 * by Catch Des Moines resolves. Mirrors resolveEventImage() in venueImage.ts.
 */
export function venueImageForEvent(
  e: { source_url: string | null; venue: string | null },
  venues: readonly VenueImageRow[],
  opts: { sourceOnly?: boolean } = {},
): { canonical: string; imageUrl: string; via: 'source' | 'venue' } | null {
  const sourceVenue = e.source_url ? venueForSourceUrl(e.source_url) : null;
  if (sourceVenue) {
    const key = sourceVenue.toLowerCase().trim();
    const row = venues.find(
      (v) => v.name.toLowerCase().trim() === key || (v.aliases ?? []).some((a) => a.toLowerCase().trim() === key),
    );
    if (row) return { canonical: row.name, imageUrl: row.image_url, via: 'source' };
  }
  if (opts.sourceOnly || !e.venue) return null;
  const match = matchKnownVenue(e.venue, venues);
  return match ? { canonical: match.venue.name, imageUrl: match.venue.image_url, via: 'venue' } : null;
}

async function main() {
  const supabase = client();
  console.log(APPLY ? '=== APPLY ===\n' : '=== DRY RUN (nothing will change) ===\n');

  // ── 1. Venues that HAVE a default image ────────────────────────────────────
  const { data: venues, error: venuesError } = await supabase
    .from('known_venues')
    .select('name, aliases, image_url')
    .not('image_url', 'is', null);
  if (venuesError) throw new Error(`known_venues read failed: ${venuesError.message}`);

  const venueRows = ((venues ?? []) as VenueImageRow[]).filter(
    (v) => v.image_url && (!VENUE_FILTER || v.name === VENUE_FILTER),
  );

  if (venueRows.length === 0) {
    console.log('No venue has known_venues.image_url set, so there is nothing to repoint.');
    console.log('Set one per venue first - this script is inert until then.');
    return;
  }
  console.log(`${venueRows.length} venue(s) carry a default image.\n`);

  // ── 2. Events at those venues ──────────────────────────────────────────────
  //
  // Paged: events is well past PostgREST's default 1000-row cap, and a silent
  // truncation here would under-report without saying so.
  const events: { id: string; source_url: string | null; venue: string | null; image_url: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('events')
      .select('id, source_url, venue, image_url')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`events read failed: ${error.message}`);
    events.push(...((data ?? []) as typeof events));
    if (!data || data.length < 1000) break;
  }

  const targets: { id: string; from: string | null; to: string; venue: string }[] = [];
  const perVenue = new Map<string, number>();
  let viaVenue = 0;
  for (const e of events) {
    const hit = venueImageForEvent(e, venueRows, { sourceOnly: SOURCE_ONLY });
    if (!hit) continue; // aggregator at an unknown venue, or venue has no default
    if (e.image_url === hit.imageUrl) continue; // already repointed
    targets.push({ id: e.id, from: e.image_url, to: hit.imageUrl, venue: hit.canonical });
    perVenue.set(hit.canonical, (perVenue.get(hit.canonical) ?? 0) + 1);
    if (hit.via === 'venue') viaVenue++;
  }
  if (viaVenue > 0) {
    console.log(`${viaVenue} of these come from aggregators, matched on the event's venue (--source-only skips them).`);
  }

  console.log(`${targets.length} event(s) to repoint:`);
  for (const [v, n] of [...perVenue.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${v}`);
  }
  if (targets.length === 0) return;

  // ── 3. The media_assets rows those events own ──────────────────────────────
  const ids = targets.map((t) => t.id);
  const assets: { id: string; file_path: string; bucket_id: string; file_size: number }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('media_assets')
      .select('id, file_path, bucket_id, file_size')
      // "event" is CONTENT_TYPE_MAP.events in _shared/imageStorage.ts, which is
      // what fetchAndStoreImage stamps on the row.
      .eq('content_type', 'event')
      .in('content_id', ids.slice(i, i + 200));
    if (error) throw new Error(`media_assets read failed: ${error.message}`);
    assets.push(...((data ?? []) as typeof assets));
  }
  console.log(`\n${assets.length} media_assets row(s) belong to those events.`);

  // ── 4. Which FILES would that orphan ───────────────────────────────────────
  //
  // Count every reference to each file_path, not just the ones being removed.
  // A file shared with an event this script is not touching must survive.
  const paths = [...new Set(assets.map((a) => a.file_path))];
  const totalRefs = new Map<string, number>();
  for (let i = 0; i < paths.length; i += 200) {
    const chunk = paths.slice(i, i + 200);
    const { data, error } = await supabase.from('media_assets').select('file_path').in('file_path', chunk);
    if (error) throw new Error(`reference count failed: ${error.message}`);
    for (const r of (data ?? []) as { file_path: string }[]) {
      totalRefs.set(r.file_path, (totalRefs.get(r.file_path) ?? 0) + 1);
    }
  }
  const removingRefs = new Map<string, number>();
  for (const a of assets) removingRefs.set(a.file_path, (removingRefs.get(a.file_path) ?? 0) + 1);

  const sizeOf = new Map<string, { size: number; bucket: string }>();
  for (const a of assets) sizeOf.set(a.file_path, { size: a.file_size ?? 0, bucket: a.bucket_id });

  const orphaned = paths.filter((p) => (totalRefs.get(p) ?? 0) - (removingRefs.get(p) ?? 0) <= 0);
  const shared = paths.length - orphaned.length;
  const reclaimable = orphaned.reduce((n, p) => n + (sizeOf.get(p)?.size ?? 0), 0);

  console.log(`  ${orphaned.length} file(s) would be left referenced by nothing  -> ${bytes(reclaimable)}`);
  console.log(`  ${shared} file(s) are shared with events this run does not touch -> KEPT`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to repoint the events, delete the');
    console.log('media_assets rows, and remove the orphaned files.');
    return;
  }

  // ── 5. Repoint the events ──────────────────────────────────────────────────
  let repointed = 0;
  for (const t of targets) {
    const { error } = await supabase.from('events').update({ image_url: t.to }).eq('id', t.id);
    if (error) {
      console.error(`  ! repoint failed for ${t.id}: ${error.message}`);
      continue;
    }
    repointed++;
  }
  console.log(`\nRepointed ${repointed}/${targets.length} event(s).`);

  // ── 6. Delete the media_assets rows, THEN re-check the files ───────────────
  //
  // The order is load-bearing. Deleting rows first and re-counting afterwards
  // means the "is anything still using this file" question is answered against
  // the state that will actually exist, not against a prediction of it.
  let rowsDeleted = 0;
  const assetIds = assets.map((a) => a.id);
  for (let i = 0; i < assetIds.length; i += 200) {
    const chunk = assetIds.slice(i, i + 200);
    const { error } = await supabase.from('media_assets').delete().in('id', chunk);
    if (error) {
      console.error(`  ! media_assets delete failed: ${error.message}`);
      continue;
    }
    rowsDeleted += chunk.length;
  }
  console.log(`Deleted ${rowsDeleted}/${assetIds.length} media_assets row(s).`);

  const stillReferenced = new Set<string>();
  for (let i = 0; i < paths.length; i += 200) {
    const { data, error } = await supabase
      .from('media_assets')
      .select('file_path')
      .in('file_path', paths.slice(i, i + 200));
    if (error) {
      console.error(`  ! post-delete reference check failed, keeping every file: ${error.message}`);
      console.error('    Re-run to remove them once the read works. Nothing is lost by waiting.');
      return;
    }
    for (const r of (data ?? []) as { file_path: string }[]) stillReferenced.add(r.file_path);
  }

  const toRemove = paths.filter((p) => !stillReferenced.has(p));
  const byBucket = new Map<string, string[]>();
  for (const p of toRemove) {
    const bucket = sizeOf.get(p)?.bucket ?? 'media';
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), p]);
  }

  let filesRemoved = 0;
  for (const [bucket, list] of byBucket) {
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const { error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) {
        console.error(`  ! storage delete failed (${bucket}): ${error.message}`);
        continue;
      }
      filesRemoved += chunk.length;
    }
  }
  const removedBytes = toRemove.reduce((n, p) => n + (sizeOf.get(p)?.size ?? 0), 0);
  console.log(`Removed ${filesRemoved}/${toRemove.length} file(s), reclaiming ${bytes(removedBytes)}.`);
}

// Only when run directly. The mapping helpers above are imported by
// scripts/__tests__/reclaim-venue-images.test.mjs, and a module that starts
// talking to a database on import is not testable.
if (process.argv[1] && process.argv[1].endsWith('reclaim-venue-images.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
