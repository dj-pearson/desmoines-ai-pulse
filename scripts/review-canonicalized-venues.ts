#!/usr/bin/env tsx
/**
 * Events canonicalized onto the wrong venue (WEB-BE-039 AC5).
 *
 *   npx tsx scripts/review-canonicalized-venues.ts          # human-readable
 *   npx tsx scripts/review-canonicalized-venues.ts --json   # machine-readable
 *
 * READ-ONLY, and it works with VITE_SUPABASE_ANON_KEY. There is no --apply:
 * the story asks for a list the owner reviews, and re-canonicalizing a row
 * needs a judgement about which venue is right that nothing here can make.
 *
 * WHY THIS EXISTS. The partial match in firecrawl-scraper fired when either
 * string contained the other, guarded by `searchText.length >= 5 ||
 * venueLower.length >= 5` - an OR whose right-hand side is about the KNOWN
 * venue and is therefore always true. A venue that scraped as "Park" matched
 * Principal Park, and the row took that venue's name, its street address and
 * its coordinates. The rules are fixed (venueMatch.ts, and the RPC in
 * 20260919000002); the rows written before that are not.
 *
 * WHAT IT CANNOT DO, said plainly: it cannot find rows by the length of the
 * text that matched them, because the overwrite destroyed that text. See the
 * header of scripts/lib/venueCanonicalizationReview.ts. It finds the effect,
 * using the one piece of provenance the overwrite left alone - source_url.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { venueForSourceUrl } from './reclaim-venue-images.ts';
import {
  reviewEvent,
  summarize,
  type EventReview,
  type ReviewableEvent,
  type ReviewableVenue,
} from './lib/venueCanonicalizationReview.ts';

const JSON_OUT = process.argv.includes('--json');

/** Reads a key from the environment, falling back to .env. */
function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync('.env')) return undefined;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && line.slice(0, i).trim() === key) {
      return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return undefined;
}

async function main() {
  const url = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
  const key = env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: venueRows, error: venuesError } = await supabase
    .from('known_venues')
    .select('name, aliases, latitude, longitude');
  if (venuesError) throw new Error(`known_venues read failed: ${venuesError.message}`);
  const venues = (venueRows ?? []) as unknown as ReviewableVenue[];
  // Zero venues means nothing can be canonicalized and every row would read as
  // fine. That is a clean bill of health produced by a failed read, which is
  // the shape this repo keeps getting caught by.
  if (venues.length === 0) throw new Error('known_venues returned no rows - refusing to report "no problems"');

  const events: ReviewableEvent[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, venue, location, latitude, longitude, source_url')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`events read failed: ${error.message}`);
    events.push(...((data ?? []) as unknown as ReviewableEvent[]));
    if (!data || data.length < 1000) break;
  }
  if (events.length === 0) throw new Error('zero events read - refusing to report "no problems"');

  const reviews: EventReview[] = events.map((e) => reviewEvent(e, venues, venueForSourceUrl));
  const suspect = reviews.filter((r) => r.verdict === 'suspect');
  const stats = summarize(reviews);

  if (JSON_OUT) {
    console.log(JSON.stringify({ stats, suspect }, null, 2));
    return;
  }

  console.log(
    `[venue-review] ${stats.total} event(s): ${stats.ok} consistent, ${stats.suspect} suspect, ` +
      `${stats.unknown} not checkable (aggregator or unrecognised source).`,
  );

  if (suspect.length === 0) {
    console.log('\nNo event is stored at a venue its source does not cover.');
    // The not-checkable count is the honest caveat on that sentence.
    console.log(
      `${stats.unknown} event(s) came from aggregators, where the URL says nothing about the venue.`,
    );
    return;
  }

  const byPair = new Map<string, EventReview[]>();
  for (const r of suspect) {
    const k = `${r.expectedVenue} -> ${r.storedVenue}`;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k)!.push(r);
  }

  console.log(`\n${suspect.length} event(s) stored at a venue their source does not cover:\n`);
  for (const [pair, rows] of [...byPair.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${pair}  (${rows.length})`);
    for (const r of rows.slice(0, 5)) {
      console.log(`    ${r.id}${r.coordinatesMoved ? '  [coordinates moved too]' : ''}`);
    }
    if (rows.length > 5) console.log(`    ... and ${rows.length - 5} more`);
  }

  console.log(
    `\n${stats.coordinatesMoved} of them are pinned at the wrong venue's coordinates, so the map ` +
      `is wrong as well as the address.\n` +
      `Nothing was changed. Re-canonicalizing needs a judgement about which venue is right.`,
  );
}

// Guarded so the pure helpers can be imported by a test without this talking to
// a database on import.
if (process.argv[1] && process.argv[1].endsWith('review-canonicalized-venues.ts')) {
  main().catch((err) => {
    console.error(`[venue-review] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
