/**
 * The Catch Des Moines adapter maps schema.org @type to a real category
 * (WEB-BE-042 AC3), and both live writers use the same vocabulary (AC5).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/catchdesmoines-category.test.ts
 *
 * THE ADAPTER PARSED @type AND DISCARDED IT, writing `category: "Community"`
 * for every event - concerts, hockey games, theatre runs alike. Two live
 * stacks ingest this source (the daily GitHub Actions Python crawler and this
 * adapter on a 6h cloud job), so whichever landed first set the category, and
 * the one discarding the site's own ld+json was as likely to win as the one
 * paying a model to guess.
 *
 * node:assert rather than std/assert: no network, so this runs in a container
 * where deno.land is unreachable as well as in CI.
 */

import { strict as assert } from 'node:assert';
import { categoryForEventType } from '../_shared/domain-adapters/catchdesmoinesCategory.ts';

const REPO = new URL('../../../', import.meta.url);

Deno.test('schema.org subtypes map to distinct categories', () => {
  assert.equal(categoryForEventType('MusicEvent'), 'Music');
  assert.equal(categoryForEventType('SportsEvent'), 'Sports');
  assert.equal(categoryForEventType('TheaterEvent'), 'Arts');
  assert.equal(categoryForEventType('ComedyEvent'), 'Entertainment');
  assert.equal(categoryForEventType('Festival'), 'Festival');
  assert.equal(categoryForEventType('FoodEvent'), 'Food');
});

Deno.test('the defect itself: a concert is no longer Community', () => {
  assert.notEqual(categoryForEventType('MusicEvent'), 'Community');
  assert.notEqual(categoryForEventType('SportsEvent'), 'Community');
});

Deno.test('an unknown or absent type falls back to Community', () => {
  // Community was what this adapter always wrote, so an unmapped subtype must
  // behave exactly as before rather than inventing a category nothing filters on.
  assert.equal(categoryForEventType('Event'), 'Community');
  assert.equal(categoryForEventType('DeliveryEvent'), 'Community');
  assert.equal(categoryForEventType(undefined), 'Community');
  assert.equal(categoryForEventType(null), 'Community');
  assert.equal(categoryForEventType(42), 'Community');
});

Deno.test('every mapped category is one the Python crawler also emits', async () => {
  // AC5. Two live writers ingest this source and must agree until AC2 retires
  // one. The Python crawler hands Sonnet an explicit vocabulary; this reads it
  // from that file rather than restating it, so a change on either side that
  // breaks the agreement fails here instead of producing two spellings of one
  // category in the table.
  const py = await Deno.readTextFile(
    new URL('crawlers/catchdesmoines_crawler.py', REPO),
  );
  // `?? ''` rather than a truthiness assert: node:assert's `ok` is not declared
  // as an assertion function in the edge type shim, so it does not narrow
  // `string | undefined` and check-edge-types flagged both later uses.
  const line = py.split('\n').find((l) => l.includes('- category:')) ?? '';
  assert.notEqual(line, '', 'crawlers/catchdesmoines_crawler.py no longer declares a category vocabulary');

  const allowed = new Set(
    line.slice(line.indexOf(':') + 1).trim().split('/').map((s) => s.trim()),
  );
  assert.ok(allowed.size >= 5, `parsed too few categories from: ${line}`);

  for (const type of [
    'MusicEvent', 'SportsEvent', 'TheaterEvent', 'ComedyEvent',
    'Festival', 'FoodEvent', 'ChildrensEvent', 'Event',
  ]) {
    const mapped = categoryForEventType(type);
    assert.ok(
      allowed.has(mapped),
      `adapter maps ${type} -> "${mapped}", which the Python crawler never emits (${[...allowed].join('/')})`,
    );
  }
});

Deno.test('the adapter does not stamp a constant category', async () => {
  // The regression this is really guarding: a future edit that goes back to a
  // literal would pass every mapping test above, because the mapper would
  // still be correct - it just would not be called.
  const src = await Deno.readTextFile(
    new URL('supabase/functions/_shared/domain-adapters/catchdesmoines.ts', REPO),
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

  assert.ok(
    /category:\s*categoryForEventType\(/.test(code),
    'toAdapterEvent must derive category from the ld+json @type',
  );
  assert.ok(
    !/category:\s*["'][A-Z]/.test(code),
    'toAdapterEvent hardcodes a category string again',
  );
});
