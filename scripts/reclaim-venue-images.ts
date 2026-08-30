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
 * - It will not touch an event whose source is an aggregator.
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

const APPLY = process.argv.includes('--apply');
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

async function main() {
  const supabase = client();
  console.log(APPLY ? '=== APPLY ===\n' : '=== DRY RUN (nothing will change) ===\n');

  // ── 1. Venues that HAVE a default image ────────────────────────────────────
  const { data: venues, error: venuesError } = await supabase
    .from('known_venues')
    .select('name, aliases, image_url')
    .not('image_url', 'is', null);
  if (venuesError) throw new Error(`known_venues read failed: ${venuesError.message}`);

  const venueImage = new Map<string, { canonical: string; imageUrl: string }>();
  for (const v of (venues ?? []) as { name: string; aliases: string[] | null; image_url: string }[]) {
    if (VENUE_FILTER && v.name !== VENUE_FILTER) continue;
    venueImage.set(v.name.toLowerCase().trim(), { canonical: v.name, imageUrl: v.image_url });
    for (const a of v.aliases ?? []) {
      if (a) venueImage.set(a.toLowerCase().trim(), { canonical: v.name, imageUrl: v.image_url });
    }
  }

  if (venueImage.size === 0) {
    console.log('No venue has known_venues.image_url set, so there is nothing to repoint.');
    console.log('Set one per venue first - this script is inert until then.');
    return;
  }
  console.log(`${venueImage.size} venue name/alias key(s) carry a default image.\n`);

  // ── 2. Events from single-venue sources ────────────────────────────────────
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, title, source_url, image_url')
    .not('source_url', 'is', null);
  if (eventsError) throw new Error(`events read failed: ${eventsError.message}`);

  const targets: { id: string; from: string | null; to: string; venue: string }[] = [];
  const perVenue = new Map<string, number>();
  for (const e of (events ?? []) as { id: string; source_url: string; image_url: string | null }[]) {
    const venueName = venueForSourceUrl(e.source_url);
    if (!venueName) continue; // aggregator: leave alone
    const hit = venueImage.get(venueName.toLowerCase().trim());
    if (!hit) continue; // venue has no default set
    if (e.image_url === hit.imageUrl) continue; // already repointed
    targets.push({ id: e.id, from: e.image_url, to: hit.imageUrl, venue: hit.canonical });
    perVenue.set(hit.canonical, (perVenue.get(hit.canonical) ?? 0) + 1);
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
