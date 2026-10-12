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
  isPlacesCopyPath,
  photoProvenance,
  placesCopyPath,
  PLACES_COPY_DELETE_AFTER_DAYS,
  PLACES_COPY_MARKER,
  PLACES_COPY_MAX_AGE_SECONDS,
  PLACES_COPY_REFRESH_AFTER_DAYS,
} from '../_shared/placesPhoto.ts';
import { buildHotelPlaceUpdate, type HotelPlaceRow } from '../_shared/hotelPlaceMatch.ts';

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

// ---------------------------------------------------------------------------
// Hotels (migration 20261020000002). The same guards, applied to the hotel
// writer, plus the ones a Storage copy of the BYTES needs: hotels keep a copy
// so the card has an image, and that copy is what the 30-day rule is about.
// ---------------------------------------------------------------------------

const HOTEL: HotelPlaceRow = {
  id: '0d3c1d2e-1111-4a2b-9c3d-123456789abc',
  name: 'Hotel Fort Des Moines',
  address: '1000 Walnut St',
  city: 'Des Moines',
  state: 'IA',
  zip: '50309',
  latitude: null,
  longitude: null,
  phone: null,
  website: 'https://hotelfortdesmoines.com',
};

Deno.test('hotel provenance stores the reference and the named author', () => {
  const p = photoProvenance(
    [{ name: 'places/ChIJabc/photos/AelY_1', authorAttributions: [{ displayName: 'Jo Smith' }, { displayName: 'Al Lee' }] }],
    '2026-10-11T00:00:00.000Z',
  );
  assert.deepEqual(p, {
    places_photo_name: 'places/ChIJabc/photos/AelY_1',
    places_photo_attribution: 'Jo Smith, Al Lee',
    places_photo_seen_at: '2026-10-11T00:00:00.000Z',
  });
});

Deno.test('no author means the generic Google line, never an invented name', () => {
  const p = photoProvenance([{ name: 'places/X/photos/Y' }], '2026-10-11T00:00:00.000Z');
  assert.equal(p?.places_photo_attribution, GOOGLE_ATTRIBUTION_TEXT);
  assert.equal(photoProvenance([], 'x'), null);
  assert.equal(photoProvenance(undefined, 'x'), null);
  // A media URL where a resource name belongs is refused, not stored.
  assert.equal(photoProvenance([{ name: MEDIA }], 'x'), null);
});

Deno.test('the hotel writer puts no media URL anywhere and touches no curated field', () => {
  const update = buildHotelPlaceUpdate(
    HOTEL,
    {
      id: 'ChIJhotel',
      displayName: { text: 'Hotel Fort Des Moines' },
      formattedAddress: '1000 Walnut St, Des Moines, IA 50309, USA',
      types: ['lodging'],
      location: { latitude: 41.585, longitude: -93.628 },
      nationalPhoneNumber: '(515) 243-1161',
      photos: [{ name: 'places/ChIJhotel/photos/P1', authorAttributions: [{ displayName: 'Jo Smith' }] }],
    },
    '2026-10-11T00:00:00.000Z',
  );
  for (const [k, v] of Object.entries(update)) {
    assert.ok(!isPlacesMediaUrl(v), `${k} holds a Places media URL`);
  }
  for (const curated of ['image_url', 'description', 'short_description', 'avg_nightly_rate', 'amenities', 'star_rating', 'gallery_urls']) {
    assert.ok(!(curated in update), `the enricher wrote ${curated}`);
  }
  assert.equal(update.google_place_id, 'ChIJhotel');
  assert.equal(update.places_photo_name, 'places/ChIJhotel/photos/P1');
  assert.equal(update.places_photo_attribution, 'Jo Smith');
  assert.equal(update.phone, '(515) 243-1161', 'an empty phone is filled');
  assert.equal(update.latitude, 41.585, 'empty coordinates are filled');
  assert.ok(!('website' in update), 'a website we already have is not replaced');
});

Deno.test('the last-line guard drops a media URL that arrives in any field', () => {
  // Places would never send this, which is the point: the guard is the last
  // line, not the first. The website is empty, so without the guard it would
  // be written.
  const update = buildHotelPlaceUpdate(
    { ...HOTEL, website: null },
    { id: 'ChIJhotel', websiteUri: MEDIA },
    '2026-10-11T00:00:00.000Z',
  );
  assert.ok(!('website' in update), 'a Places media URL reached the website column');
  // Control: the same shape with an ordinary URL IS written, so the assertion
  // above fails for the guard and not because website is never filled.
  const control = buildHotelPlaceUpdate(
    { ...HOTEL, website: null },
    { id: 'ChIJhotel', websiteUri: 'https://example.com/' },
    '2026-10-11T00:00:00.000Z',
  );
  assert.equal(control.website, 'https://example.com/');
});

Deno.test('the hotel writer fills only what is empty', () => {
  const update = buildHotelPlaceUpdate(
    { ...HOTEL, phone: '515-000-0000', latitude: 41.1, longitude: -93.1, website: null },
    {
      id: 'ChIJhotel',
      location: { latitude: 41.585, longitude: -93.628 },
      nationalPhoneNumber: '(515) 243-1161',
      websiteUri: 'https://example.com/',
    },
    '2026-10-11T00:00:00.000Z',
  );
  assert.ok(!('phone' in update));
  assert.ok(!('latitude' in update) && !('longitude' in update));
  assert.equal(update.website, 'https://example.com/');
  // A place with no photo writes no provenance at all.
  assert.ok(!('places_photo_name' in update));
});

Deno.test('the copy clocks sit inside the 30-day window', () => {
  assert.ok(PLACES_COPY_REFRESH_AFTER_DAYS < PLACES_COPY_DELETE_AFTER_DAYS);
  assert.ok(PLACES_COPY_DELETE_AFTER_DAYS < PLACES_CACHE_MAX_AGE_DAYS);
  // A cached copy in a browser or at the edge must not outlive the delete.
  assert.ok(PLACES_COPY_MAX_AGE_SECONDS <= 24 * 60 * 60);
});

Deno.test('a copy key names itself, and nothing else looks like one', () => {
  const key = placesCopyPath('hotel', HOTEL.id, 1760140800000, 'jpg');
  assert.equal(key, `hotels/${HOTEL.id}/places-photo-1760140800000.jpg`);
  assert.ok(isPlacesCopyPath(key));
  assert.ok(isPlacesCopyPath(`https://x.supabase.co/storage/v1/object/public/media/${key}?width=640`));
  assert.ok(!isPlacesCopyPath(`hotels/${HOTEL.id}/hero.jpg`));
  assert.ok(!isPlacesCopyPath('events/x/places-photo-gallery.jpg'));
  assert.ok(!isPlacesCopyPath(null));
});

Deno.test('the browser credit and the /media cache key off the same marker', async () => {
  // The card shows the Google credit by recognising the file name; the media
  // route shortens the cache the same way. A drift between either and the
  // server's marker is a Places photo with no credit, or a year of cache.
  const front = await read('src/lib/placesPhotoCredit.ts');
  assert.ok(front.includes(`PLACES_COPY_MARKER = "${PLACES_COPY_MARKER}"`), 'src/lib/placesPhotoCredit.ts marker drifted');
  const route = await read('functions/media/[[path]].ts');
  assert.ok(route.includes('const PLACES_COPY_MAX_AGE = 86_400;'), 'media route Places max-age drifted');
  assert.equal(PLACES_COPY_MAX_AGE_SECONDS, 86_400);
  assert.ok(route.includes(`/\\/${PLACES_COPY_MARKER}\\d+`), 'media route marker drifted');
});

Deno.test('the hotel enricher asks for attributions and never writes image_url', async () => {
  const src = codeOnly(await read('supabase/functions/enrich-hotels-places/index.ts'));
  assert.match(src, /places\.photos\.authorAttributions/, 'authorAttributions must be in the field mask');
  assert.match(src, /buildHotelPlaceUpdate\(/, 'the write goes through the guarded builder');
  assert.ok(!/image_url/.test(src), 'the enricher must not touch image_url; backfill-images owns it');
  assert.match(src, /dryRun\s*=\s*body\?\.dryRun\s*!==\s*false/, 'dry run must be the default');
  assert.match(src, /isUnknownColumnError\(updateError\)/, 'the migration-order retry must be wired');
});

Deno.test('hotel copies go through the refresh path, never fetchAndStoreImage', async () => {
  const hotels = codeOnly(await read('supabase/functions/backfill-images/hotels.ts'));
  assert.ok(!/fetchAndStoreImage/.test(hotels), 'hotels must not use the permanent-copy path');
  assert.match(hotels, /storePlacesPhotoCopy\(/);
  assert.match(hotels, /PLACES_COPY_DELETE_AFTER_DAYS/, 'the expiry pass must exist');
  assert.match(hotels, /removePlacesPhotoCopy\(/, 'an expired copy must be deleted, not just unlinked');
  // The expiry runs before the refresh and fill reads, so a run that dies
  // midway has already done the part that keeps the rule true.
  const expireAt = hotels.indexOf('places_photo_cached_at.lt."${deleteBefore}"');
  const refreshAt = hotels.indexOf('.lt("places_photo_cached_at", refreshBefore)');
  assert.ok(expireAt > 0 && refreshAt > expireAt, 'expire must run before refresh');

  const index = codeOnly(await read('supabase/functions/backfill-images/index.ts'));
  assert.match(index, /requested === "hotels"/, 'backfill-images must dispatch the hotels category');
});

Deno.test('a Places copy writes no media_assets row and gets a short cache', async () => {
  const src = codeOnly(await read('supabase/functions/_shared/imageStorage.ts'));
  const start = src.indexOf('export async function storePlacesPhotoCopy');
  const end = src.indexOf('export async function removePlacesPhotoCopy');
  assert.ok(start > 0 && end > start);
  const body = src.slice(start, end);
  // Control: the slice must hold the whole function. A "/*" inside a string
  // once made codeOnly() swallow everything after it, and the absence checks
  // below then passed over an empty body.
  assert.match(body, /\.upload\(path, buffer/, 'the slice lost the upload call; codeOnly() truncated the function');
  assert.ok(!/media_assets/.test(body), 'a media_assets row would make the copy a dedup target for permanent images');
  assert.ok(!/image_optimization_queue/.test(body), 'optimised variants would be untracked copies');
  assert.match(body, /cacheControl:\s*String\(PLACES_COPY_MAX_AGE_SECONDS\)/);
  assert.match(body, /redactPlacesKey/, 'the key-bearing URL must be redacted in any reason it returns');
});

Deno.test('only backfill-images stores a Places copy', async () => {
  const dir = new URL('supabase/functions/', REPO);
  const callers: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isDirectory || entry.name === '_tests' || entry.name === '_shared') continue;
    for await (const file of Deno.readDir(new URL(`${entry.name}/`, dir))) {
      if (!file.isFile || !file.name.endsWith('.ts')) continue;
      const src = codeOnly(await Deno.readTextFile(new URL(`${entry.name}/${file.name}`, dir)));
      if (/storePlacesPhotoCopy\(/.test(src)) callers.push(`${entry.name}/${file.name}`);
    }
  }
  // Equality rather than "empty": the walk has to find the one caller that
  // exists, or an empty result would pass for the wrong reason.
  assert.deepEqual(callers, ['backfill-images/hotels.ts'], `storePlacesPhotoCopy callers: ${callers.join(', ')}`);
});
