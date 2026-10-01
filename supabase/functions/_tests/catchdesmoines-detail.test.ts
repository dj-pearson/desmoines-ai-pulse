/**
 * Catch Des Moines detail-page parsing.
 *
 * Run with:
 *   deno test supabase/functions/_tests/catchdesmoines-detail.test.ts
 *
 * The fixture is shaped like a Simpleview /event/<slug>/<id>/ page: an ld+json
 * Event (here inside @graph, with an image array), and an external link that
 * is not labelled "Visit Website". The live site is not reachable from CI, so
 * this pins the parser, not the site.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import {
  extractExternalUrlFallback,
  extractImage,
  extractOgImage,
  normalizeUrl,
  parseLdJsonEvent,
  placeCoordinates,
  toAdapterEvent,
} from '../_shared/domain-adapters/catchdesmoinesParse.ts';

const DETAIL = 'https://www.catchdesmoines.com/event/some-band/12345/';

const page = (ld: unknown, body = '') => `<!doctype html><html><head>
<meta property="og:image" content="https://assets.simpleviewinc.com/og/some-band.jpg">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head><body>${body}</body></html>`;

const vibrantShow = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', name: 'Some Band' },
    {
      '@type': ['MusicEvent'],
      name: 'Some Band',
      description: 'Live.',
      startDate: '2026-10-17T20:00:00-05:00',
      image: [{ '@type': 'ImageObject', url: 'https://assets.simpleviewinc.com/some-band.jpg' }],
      location: {
        '@type': 'Place',
        name: 'Vibrant Music Hall',
        address: {
          streetAddress: '2938 Grand Prairie Pkwy',
          addressLocality: 'Waukee',
          addressRegion: 'IA',
          postalCode: '50263',
        },
        geo: { latitude: '41.5917', longitude: '-93.8869' },
      },
    },
  ],
};

Deno.test('an Event inside @graph with an array @type is found', () => {
  const ev = parseLdJsonEvent(page(vibrantShow));
  assert.ok(ev, 'no Event parsed');
  assert.equal(ev!.name, 'Some Band');
});

Deno.test('the row carries venue, street address, geo and image', () => {
  const html = page(vibrantShow);
  const row = toAdapterEvent(parseLdJsonEvent(html)!, DETAIL, 'https://www.vibrantmusichall.com/shows/some-band', html);
  assert.ok(row);
  assert.equal(row!.venue, 'Vibrant Music Hall');
  assert.equal(row!.location, '2938 Grand Prairie Pkwy, Waukee, IA 50263');
  assert.equal(row!.latitude, 41.5917);
  assert.equal(row!.longitude, -93.8869);
  assert.equal(row!.image_url, 'https://assets.simpleviewinc.com/some-band.jpg');
  assert.equal(row!.source_url, 'https://www.vibrantmusichall.com/shows/some-band');
  assert.equal(row!.date, '2026-10-17 20:00:00');
});

Deno.test('no ld+json image falls back to og:image', () => {
  const ld = { ...vibrantShow['@graph'][1], image: undefined };
  const html = page(ld);
  const row = toAdapterEvent(parseLdJsonEvent(html)!, DETAIL, null, html);
  assert.equal(row!.image_url, 'https://assets.simpleviewinc.com/og/some-band.jpg');
  // No external link: the listing URL is the source of last resort.
  assert.equal(row!.source_url, DETAIL);
});

Deno.test('image shapes: string, object, array, junk', () => {
  assert.equal(extractImage('https://a/x.jpg'), 'https://a/x.jpg');
  assert.equal(extractImage({ url: 'https://a/y.jpg' }), 'https://a/y.jpg');
  assert.equal(extractImage(['/relative.jpg', { contentUrl: 'https://a/z.jpg' }]), 'https://a/z.jpg');
  assert.equal(extractImage(null), null);
  assert.equal(extractOgImage('<meta content="https://a/o.jpg" property="og:image">'), 'https://a/o.jpg');
});

Deno.test('a geo pair outside Iowa, half a pair, or none is dropped', () => {
  assert.deepEqual(placeCoordinates({ geo: { latitude: 0, longitude: 0 } }), {});
  assert.deepEqual(placeCoordinates({ geo: { latitude: 41.59 } }), {});
  assert.deepEqual(placeCoordinates({ geo: { latitude: 'abc', longitude: -93.6 } }), {});
  assert.deepEqual(placeCoordinates(null), {});
  assert.deepEqual(placeCoordinates({ geo: { latitude: 41.59, longitude: -93.62 } }), {
    latitude: 41.59,
    longitude: -93.62,
  });
});

Deno.test('a city-only address still reads "City, ST"', () => {
  const ld = {
    '@type': 'Event',
    name: 'Market',
    startDate: '2026-10-18',
    location: { name: 'Downtown', address: { addressLocality: 'Des Moines', addressRegion: 'IA' } },
  };
  const row = toAdapterEvent(ld, DETAIL, null);
  assert.equal(row!.location, 'Des Moines, IA');
  assert.equal(row!.date, '2026-10-18', 'a date-only start stays date-only (WEB-BE-037)');
  assert.equal(row!.latitude, undefined);
});

Deno.test('external link fallbacks: linkUrl, then tickets, then "Website"', () => {
  assert.equal(
    extractExternalUrlFallback(`<script>var x = {"linkUrl":"https://organizer.org/e"}</script>`, DETAIL),
    'https://organizer.org/e',
  );
  const html = `
    <a href="https://www.facebook.com/somebandofficial">Facebook</a>
    <a href="https://organizer.org/">Website</a>
    <a href="https://www.etix.com/ticket/p/123?a=1&amp;b=2"><span>Buy Tickets</span></a>`;
  assert.equal(
    extractExternalUrlFallback(html, DETAIL),
    'https://www.etix.com/ticket/p/123?a=1&b=2',
    'a ticket link outranks a bare "Website" link, and &amp; is decoded',
  );
  assert.equal(extractExternalUrlFallback('<a href="/events/">Tickets</a>', DETAIL), null,
    'a link back into Catch Des Moines is never the external source');
});

Deno.test('excluded domains match by host, not by substring', () => {
  assert.equal(normalizeUrl('https://x.com/someband', DETAIL), null);
  assert.equal(normalizeUrl('https://www.dropbox.com/s/flyer', DETAIL), 'https://www.dropbox.com/s/flyer');
  assert.equal(normalizeUrl('https://cdn.simpleviewinc.com/x', DETAIL), null);
  assert.equal(normalizeUrl('javascript:void(0)', DETAIL), null);
});
