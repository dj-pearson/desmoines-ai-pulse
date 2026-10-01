/**
 * Google Places photos stay inside the Maps Platform terms (WEB-BE-044).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/places-photo-terms.test.ts
 *
 * WHAT THIS IS PROTECTING. bulk-update-restaurants wrote
 *   image_url = 'https://places.googleapis.com/v1/<photo>/media?maxWidthPx=1200&maxHeightPx=800'
 * under a comment claiming it stored "the photo reference name instead of the
 * full URL with API key". It stored neither - a full media URL with the key
 * omitted, which 403s, so those restaurants render a broken image. And
 * backfill-images copies Place photo bytes into Supabase Storage permanently,
 * while the terms allow caching Place content for at most 30 days.
 *
 * The three assertions that matter are the detector (everything else keys off
 * it), the expiry rule defaulting to EXPIRED when the age is unknown, and the
 * wiring: a guard nothing calls is not a guard.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import {
  GOOGLE_ATTRIBUTION_TEXT,
  isPlacesCopyExpired,
  isPlacesMediaUrl,
  photoNameFromMediaUrl,
  placesMediaUrl,
  PLACES_CACHE_MAX_AGE_DAYS,
  redactPlacesKey,
} from '../_shared/placesPhoto.ts';

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const MEDIA = 'https://places.googleapis.com/v1/places/ChIJabc/photos/AelY_xyz/media?maxHeightPx=1200&maxWidthPx=1600';

Deno.test('the detector catches the media endpoint, with or without a key', () => {
  assert.ok(isPlacesMediaUrl(MEDIA));
  assert.ok(isPlacesMediaUrl(`${MEDIA}&key=AIzaSomething`));
  assert.ok(isPlacesMediaUrl('https://places.googleapis.com/v1/places/X/photos/Y/media'));
});

Deno.test('the detector does not catch things the terms do not constrain', () => {
  // A place ID may be stored indefinitely, a Maps link is a link, and a
  // Street View tile is served by a different host with different rules.
  assert.ok(!isPlacesMediaUrl('https://maps.google.com/?cid=123'));
  assert.ok(!isPlacesMediaUrl('https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=x'));
  assert.ok(!isPlacesMediaUrl('https://places.googleapis.com/v1/places:searchText'));
  assert.ok(!isPlacesMediaUrl('https://example.com/places.googleapis.com/v1/x/media'));
  assert.ok(!isPlacesMediaUrl(null));
  assert.ok(!isPlacesMediaUrl('not a url'));
});

Deno.test('the resource name survives a round trip', () => {
  const name = 'places/ChIJabc/photos/AelY_xyz';
  assert.equal(photoNameFromMediaUrl(placesMediaUrl(name)), name);
  // The reference contains slashes; a naive parse loses everything after the
  // first one, which is what makes this worth pinning.
  assert.equal(photoNameFromMediaUrl(MEDIA), 'places/ChIJabc/photos/AelY_xyz');
  assert.equal(photoNameFromMediaUrl('https://example.com/x'), null);
});

Deno.test('a key is never left in a log line', () => {
  const withKey = placesMediaUrl('places/X/photos/Y', { apiKey: 'AIzaSECRET' });
  assert.ok(withKey.includes('AIzaSECRET'));
  assert.ok(!redactPlacesKey(withKey).includes('AIzaSECRET'));
});

Deno.test('an undated copy is expired, not fresh', () => {
  // Every row written before the provenance column existed has no timestamp,
  // and defaulting those to fresh would exempt exactly the copies that have
  // been sitting in Storage longest.
  assert.equal(isPlacesCopyExpired(null, Date.now()), true);
  assert.equal(isPlacesCopyExpired(undefined, Date.now()), true);
  assert.equal(isPlacesCopyExpired('not a date', Date.now()), true);
});

Deno.test('the 30-day window is the boundary', () => {
  assert.equal(PLACES_CACHE_MAX_AGE_DAYS, 30);
  const now = Date.UTC(2026, 8, 19);
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
  assert.equal(isPlacesCopyExpired(daysAgo(29), now), false);
  assert.equal(isPlacesCopyExpired(daysAgo(31), now), true);
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

Deno.test('fetchAndStoreImage refuses a Places photo unless the refresh path is used', async () => {
  // AC6. Every ingestion path funnels image bytes through this one function,
  // which is why the guard lives there rather than at each caller.
  const src = codeOnly(await read('supabase/functions/_shared/imageStorage.ts'));
  assert.match(
    src,
    /isPlacesMediaUrl\(sourceImageUrl\)\s*&&\s*!options\.allowPlacesRefresh/,
    'imageStorage must refuse a Places media URL by default',
  );
  // Before the SSRF check, or a URL that fails SSRF would return first and the
  // licensing refusal would be unreachable for it - harmless today, and the
  // kind of ordering that rots.
  const guardAt = src.indexOf('allowPlacesRefresh');
  const ssrfAt = src.indexOf('validateURLForSSRF(sourceImageUrl');
  assert.ok(guardAt > 0 && ssrfAt > guardAt, 'the Places refusal must come before the SSRF check');
});

Deno.test('nothing opts in to the refresh path yet', async () => {
  // The flag exists so the guard can be lifted in one place once a refresh job
  // exists. If a caller starts passing it, this test is the prompt to check
  // that the job actually refreshes within the window.
  const dir = new URL('supabase/functions/', REPO);
  const optIns: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isDirectory || entry.name === '_tests') continue;
    for await (const file of Deno.readDir(new URL(`${entry.name}/`, dir))) {
      if (!file.isFile || !file.name.endsWith('.ts')) continue;
      const src = codeOnly(await Deno.readTextFile(new URL(`${entry.name}/${file.name}`, dir)));
      if (/allowPlacesRefresh:\s*true/.test(src)) optIns.push(`${entry.name}/${file.name}`);
    }
  }
  assert.deepEqual(
    optIns,
    [],
    `these opt in to storing Places photos: ${optIns.join(', ')}. A refresh job has to replace the copy within ${PLACES_CACHE_MAX_AGE_DAYS} days.`,
  );
});

Deno.test('bulk-update-restaurants stores the reference, not the media URL', async () => {
  const src = codeOnly(await read('supabase/functions/bulk-update-restaurants/index.ts'));
  assert.ok(
    !/update\.image_url\s*=\s*`https:\/\/places\.googleapis\.com/.test(src),
    'the Places media URL is being written into image_url again',
  );
  assert.match(src, /update\.places_photo_name\s*=\s*photo\.name/, 'the photo resource name must be recorded');
  assert.match(
    src,
    /photos\.authorAttributions/,
    'authorAttributions must be in the field mask, or Places returns it empty and the attribution is invented',
  );
  assert.match(src, /isPlacesMediaUrl\(update\.image_url\)/, 'the write needs its own last-line guard');
});

Deno.test('the attribution string is a constant, not retyped per call site', () => {
  assert.equal(typeof GOOGLE_ATTRIBUTION_TEXT, 'string');
  assert.ok(GOOGLE_ATTRIBUTION_TEXT.length > 0);
});
