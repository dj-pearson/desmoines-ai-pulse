/**
 * A show at a venue with a default image takes that image, whichever site it
 * was found on.
 *
 * Run with:
 *   deno test supabase/functions/_tests/venue-image-by-event-venue.test.ts
 *
 * Before this, resolveEventImage() keyed only on the SOURCE host, so a Vibrant
 * Music Hall show found on vibrantmusichall.com used Vibrant's image while the
 * same show found through Catch Des Moines or SeatGeek downloaded and stored
 * its own artwork. Aggregators list most of the region's shows.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import {
  resetVenueImageCache,
  resolveEventImage,
  venueImageForVenueText,
  type VenueImageRow,
} from '../_shared/venueImage.ts';
import { ingestCoordinates } from '../_shared/knownVenues.ts';

const VIBRANT = 'https://media.example/venues/vibrant.webp';
const ROWS: VenueImageRow[] = [
  { name: 'Vibrant Music Hall', aliases: ['Vibrant', 'VMH', 'Vibrant Hall'], image_url: VIBRANT },
  { name: 'Hoyt Sherman Place', aliases: ['Hoyt Sherman'], image_url: 'https://media.example/venues/hoyt.webp' },
];

/** Just enough of a supabase client for loadCache's one query. */
function fakeClient(rows: VenueImageRow[], error: { message: string } | null = null) {
  const q = {
    select: () => q,
    not: () => Promise.resolve({ data: error ? null : rows, error }),
  };
  return { from: () => q };
}

Deno.test('the event venue text resolves through the conservative matcher', () => {
  assert.equal(venueImageForVenueText('Vibrant Music Hall', ROWS)?.imageUrl, VIBRANT);
  assert.equal(venueImageForVenueText('VMH', ROWS)?.venueName, 'Vibrant Music Hall');
  assert.equal(venueImageForVenueText('Hall', ROWS), null, 'a short fragment is not a venue');
  assert.equal(venueImageForVenueText('The Lift', ROWS), null);
  assert.equal(venueImageForVenueText('', ROWS), null);
});

Deno.test('a Catch Des Moines show at Vibrant skips the per-event download', async () => {
  resetVenueImageCache();
  const r = await resolveEventImage(fakeClient(ROWS), {
    sourceUrl: 'https://www.etix.com/ticket/p/123',
    venueText: 'Vibrant Music Hall',
    scrapedImageUrl: 'https://assets.simpleviewinc.com/some-band.jpg',
  });
  assert.deepEqual(r, { imageUrl: VIBRANT, skipFetch: true, venueName: 'Vibrant Music Hall' });
});

Deno.test('a show at a venue with no default keeps its own artwork', async () => {
  resetVenueImageCache();
  const r = await resolveEventImage(fakeClient(ROWS), {
    sourceUrl: 'https://www.catchdesmoines.com/event/x/1/',
    venueText: 'Some Brewery Taproom',
    scrapedImageUrl: 'https://assets.simpleviewinc.com/x.jpg',
  });
  assert.equal(r.skipFetch, false);
  assert.equal(r.imageUrl, 'https://assets.simpleviewinc.com/x.jpg');
});

Deno.test('a single-venue source still wins without any venue text', async () => {
  resetVenueImageCache();
  const r = await resolveEventImage(fakeClient(ROWS), {
    sourceUrl: 'https://www.vibrantmusichall.com/shows/x',
    scrapedImageUrl: 'https://www.vibrantmusichall.com/x.jpg',
  });
  assert.equal(r.skipFetch, true);
  assert.equal(r.imageUrl, VIBRANT);
});

Deno.test('a failed known_venues read falls back to the per-event image', async () => {
  resetVenueImageCache();
  const r = await resolveEventImage(fakeClient([], { message: 'boom' }), {
    sourceUrl: 'https://www.etix.com/x',
    venueText: 'Vibrant Music Hall',
    scrapedImageUrl: 'https://a/x.jpg',
  });
  assert.deepEqual(r, { imageUrl: 'https://a/x.jpg', skipFetch: false, venueName: null });
});

Deno.test('ingestCoordinates: known venue first, then the source pair, both or neither', () => {
  const known = { latitude: 41.5917, longitude: -93.8869 };
  const source = { latitude: 41.6, longitude: -93.6 };
  assert.deepEqual(ingestCoordinates(known, source), known);
  assert.deepEqual(ingestCoordinates(null, source), source);
  assert.deepEqual(ingestCoordinates({ latitude: 41.5, longitude: null }, source), source);
  assert.deepEqual(ingestCoordinates(null, { latitude: 41.6 }), {});
  assert.deepEqual(ingestCoordinates(null, null), {});
});
