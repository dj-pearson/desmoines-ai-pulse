/**
 * Coordinates are set at ingest, by every path, or by none (WEB-BE-050).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/ingest-coordinates.test.ts
 *
 * WHAT THIS IS PROTECTING. Only firecrawl-scraper set latitude and longitude on
 * an event, from a known-venue match it held privately. ai-crawler set none -
 * `grep latitude supabase/functions/ai-crawler/index.ts` returned nothing - so
 * whether an event reached the map depended on which scraper happened to find
 * it, and FOUR nightly jobs (nightly-coordinate-backfill 02:00,
 * backfill-coordinates-nightly 04:30, data-quality-heal-nightly 02:30,
 * data-quality-sweeper 08:00) all re-geocoded to paper over the difference.
 * CLAUDE.md said "geocoding triggers maintain lat/lng"; the trigger only
 * RAISE NOTICEs.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import { venueCoordinates, VENUES_CACHE_TTL_MS } from '../_shared/knownVenues.ts';

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(?<!:)\/\/.*$/, '')).join('\n');

Deno.test('a venue with a real pair contributes both', () => {
  assert.deepEqual(
    venueCoordinates({ latitude: 41.5868, longitude: -93.625 }),
    { latitude: 41.5868, longitude: -93.625 },
  );
});

Deno.test('half a pair contributes nothing', () => {
  // A row with a latitude and no longitude is worse than a row with neither:
  // every distance query reads the pair, and a half-filled row looks geocoded
  // to the backfill that would otherwise fix it.
  assert.deepEqual(venueCoordinates({ latitude: 41.5868, longitude: null }), {});
  assert.deepEqual(venueCoordinates({ latitude: null, longitude: -93.625 }), {});
  assert.deepEqual(venueCoordinates({ latitude: null, longitude: null }), {});
  assert.deepEqual(venueCoordinates(null), {});
});

Deno.test('(0, 0) is refused', () => {
  // Null Island is in the Atlantic, and it is what a null looks like after
  // something coerced it to a number.
  assert.deepEqual(venueCoordinates({ latitude: 0, longitude: 0 }), {});
  // A real zero on one axis is not Null Island and is kept.
  assert.deepEqual(venueCoordinates({ latitude: 0, longitude: -93.625 }), {
    latitude: 0,
    longitude: -93.625,
  });
});

Deno.test('NaN and Infinity are refused', () => {
  assert.deepEqual(venueCoordinates({ latitude: NaN, longitude: -93.6 }), {});
  assert.deepEqual(venueCoordinates({ latitude: 41.5, longitude: Infinity }), {});
});

Deno.test('the venue cache is short enough to pick up an edit the same hour', () => {
  assert.equal(VENUES_CACHE_TTL_MS, 5 * 60 * 1000);
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

Deno.test('ai-crawler sets coordinates at ingest', async () => {
  const src = codeOnly(await read('supabase/functions/ai-crawler/index.ts'));
  assert.match(
    src,
    /venueCoordinates\(venueMatches\[idx\]/,
    'ai-crawler must spread the matched venue coordinates into the events row',
  );
  assert.match(
    src,
    /findKnownVenue\(supabase,/,
    'ai-crawler must resolve the venue through the shared lookup',
  );
});

Deno.test('the stub trigger no longer claims to geocode', async () => {
  // auto_geocode_location() only ever RAISE NOTICEd. Its geom half is real, so
  // the function could not simply be dropped - the fix is to say what it does.
  const sql = await read('supabase/migrations/20260919000005_geocode_trigger_truth.sql');
  assert.match(sql, /sync_geom_from_latlng/, 'the replacement function must exist');
  assert.match(sql, /CREATE OR REPLACE TRIGGER|DROP TRIGGER/, 'the triggers must be repointed');
});

Deno.test('CLAUDE.md no longer claims a geocoding trigger maintains lat/lng', async () => {
  // The claim was false for as long as the stub existed, and it is the reason
  // four backfill jobs were written instead of one.
  const doc = await read('CLAUDE.md');
  assert.ok(
    !/geocoding triggers maintain lat\/lng/i.test(doc),
    'CLAUDE.md still claims geocoding triggers maintain lat/lng',
  );
});
