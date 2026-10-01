/**
 * Structured data states only what a column holds (WEB-SEO-024).
 *
 * public.attractions and public.playgrounds have location, latitude and
 * longitude and NO city and NO postal_code. Both schema components published
 * `addressLocality: Des Moines` and `postalCode: 50309` for every row, so every
 * attraction in Ames, Ankeny, Waukee and Altoona was published as being
 * downtown -- the same locality defect SEO-007 fixed for events, on two other
 * tables.
 *
 * Coordinates fell back to 41.5868,-93.625, the middle of downtown. A wrong pin
 * is worse than no pin: a user navigates to it. For a playground, which is
 * somewhere a parent drives to, that is the sharpest version of the problem on
 * the site.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

/** The entity node only. The publisher node on the same page may say Des Moines. */
async function entityNode(rel: string, start: string, end: string): Promise<string> {
  const src = codeOnly(await read(rel));
  const from = src.indexOf(start);
  assert(from > 0, `${rel}: cannot find ${start}`);
  const to = src.indexOf(end, from);
  return src.slice(from, to > from ? to : undefined);
}

Deno.test('no entity claims a postcode or a city no column holds', async () => {
  for (const [rel, start, end] of [
    ['src/components/EnhancedAttractionSEO.tsx', 'const attractionSchema', 'publisher:'],
    ['src/components/EnhancedPlaygroundSEO.tsx', 'const playgroundSchema', 'publisher:'],
  ] as const) {
    const block = await entityNode(rel, start, end);
    assertFalse(/postalCode:/.test(block), `${rel} claims a postcode`);
    assertFalse(/addressLocality: BRAND\.city/.test(block), `${rel} claims a city for every row`);
    // The region and the country are true of the whole set and stay.
    assert(/addressRegion: BRAND\.state/.test(block));
  }
});

Deno.test('geo is emitted only from real coordinates', async () => {
  // The restaurant node moved into buildRestaurantSchema (restaurantMeta.ts)
  // in the Eat & Drink second pass; it is checked where it lives now.
  for (const [rel, start, end, col] of [
    ['src/components/EnhancedAttractionSEO.tsx', 'const attractionSchema', 'publisher:', 'attraction'],
    ['src/lib/restaurantMeta.ts', 'export function buildRestaurantSchema', 'areaServed:', 'row'],
  ] as const) {
    const block = await entityNode(rel, start, end);
    assert(
      new RegExp(`\\.\\.\\.\\(${col}\\.latitude != null && ${col}\\.longitude != null`).test(block),
      `${rel} must omit geo rather than guess it`,
    );
    assertFalse(/41\.58/.test(block), `${rel} still falls back to the downtown pin`);
  }

  // The playground names the same test once, as hasCoords, because the ICBM and
  // geo.position meta tags use it too (explore pass 2).
  const playgroundRel = 'src/components/EnhancedPlaygroundSEO.tsx';
  const playgroundSrc = codeOnly(await read(playgroundRel));
  assert(
    /const hasCoords = playground\.latitude != null && playground\.longitude != null/.test(playgroundSrc),
    `${playgroundRel}: hasCoords must test both coordinates`,
  );
  const block = await entityNode(playgroundRel, 'const playgroundSchema', 'publisher:');
  assert(/\.\.\.\(hasCoords\b/.test(block), `${playgroundRel} must omit geo rather than guess it`);
  assertFalse(/41\.58/.test(block), `${playgroundRel} still falls back to the downtown pin`);
});

Deno.test('invented properties are gone', async () => {
  const attraction = await entityNode('src/components/EnhancedAttractionSEO.tsx', 'const attractionSchema', 'publisher:');
  // "Family, Couples, Solo travelers, Groups" for every row says nothing, and
  // is false the moment one attraction is not suitable for one of them.
  assertFalse(/touristType:/.test(attraction));
  assertFalse(/publicAccess:/.test(attraction));
  // is_free IS a column, so this can be stated -- when it is set.
  assert(/attraction\.is_free != null && \{ isAccessibleForFree: attraction\.is_free \}/.test(attraction));

  const restaurant = await entityNode('src/lib/restaurantMeta.ts', 'export function buildRestaurantSchema', 'areaServed:');
  assertFalse(/paymentAccepted:/.test(restaurant), 'card acceptance was claimed for cash-only rooms');
  // Every restaurant in Des Moines takes dollars. That is a safe default, not
  // an invented fact, and it is the difference this story turns on.
  assert(/currenciesAccepted: "USD"/.test(restaurant));
});

Deno.test('a playground claims no admission price it has no column for', async () => {
  // This used to assert isAccessibleForFree: true on the grounds that a public
  // playground is free by definition. Explore pass 2 (WP4 item 2) found the
  // table also holds paid indoor play spaces, so the claim was dropped until a
  // column can back it (plan D9). Once that column exists, assert it the way
  // the attraction test above does.
  const block = await entityNode('src/components/EnhancedPlaygroundSEO.tsx', 'const playgroundSchema', 'publisher:');
  assertFalse(/isAccessibleForFree:/.test(block), 'no column backs a free-admission claim');
  assertFalse(/publicAccess:/.test(block));
});

Deno.test('a check keeps the placeholders out', async () => {
  const script = await read('scripts/check-schema-placeholders.mjs');
  assert(/ENTITY_NODES/.test(script));
  // It must scan the ENTITY node only: the publisher node on the same page
  // legitimately carries the city's coordinates.
  assert(/publisher:/.test(script), 'the scan must stop before the publisher node');
  assert(/codeOnly/.test(script), 'and strip comments, which explain the removed values');

  const pkg = JSON.parse(await read('package.json'));
  assert(pkg.scripts['check-schema-placeholders']);
  assert(pkg.scripts.validate.includes('check-schema-placeholders'));
});
