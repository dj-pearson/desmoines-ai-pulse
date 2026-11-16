/**
 * firecrawl-scraper reads existing rows once per batch, not once per item
 * (WEB-BE-046 AC2).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/firecrawl-existing-rows.test.ts
 *
 * Events were already read once per run and judged by _shared/eventDedup.ts.
 * Restaurants, playgrounds, attractions and competitor content still sent one
 * `.eq('name', ...)` per item, and competitor content looked up the same
 * competitor once per item. The pure half (keys, batching, the in-run index)
 * is exercised directly; the wiring is pinned against the source.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import {
  ExistingRowIndex,
  KEYS_PER_READ,
  competitorTitle,
  isNameKeyed,
  planReads,
  rowName,
} from '../firecrawl-scraper/existingRows.ts';

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n').map((l) => l.replace(/(?<!:)\/\/.*$/, '')).join('\n');

Deno.test('the stored name and the looked-up key are the same value', () => {
  // A key that differed from the stored name (untruncated, or no default)
  // would never match, and every re-scrape would insert the row again.
  const long = 'x'.repeat(250);
  assert.equal(rowName('restaurants', { name: long }), 'x'.repeat(200));
  assert.equal(rowName('restaurants', {}), 'Unnamed Restaurant');
  assert.equal(rowName('playgrounds', { name: '' }), 'Playground');
  assert.equal(rowName('attractions', { name: 42 }), 'Attraction');
  assert.equal(competitorTitle({ title: 'Guide' }), 'Guide');
  assert.equal(competitorTitle({}), 'Untitled Content');
  assert.ok(isNameKeyed('restaurants') && !isNameKeyed('events') && !isNameKeyed('competitor_analysis'));
});

Deno.test('keys are de-duplicated and read in batches of KEYS_PER_READ', () => {
  const keys = Array.from({ length: KEYS_PER_READ * 2 + 3 }, (_, i) => `Place ${i}`);
  const { batches, singles } = planReads([...keys, 'Place 0', 'Place 1']);
  assert.deepEqual(batches.map((b) => b.length), [KEYS_PER_READ, KEYS_PER_READ, 3]);
  assert.equal(singles.length, 0);
  assert.equal(new Set(batches.flat()).size, keys.length);
});

Deno.test('a name supabase-js cannot quote in .in() gets its own read', () => {
  // supabase-js does not escape a double quote inside an .in() value, so one
  // such name would fail the batched read, and a failed read skips the run.
  const { batches, singles } = planReads(['Joe\'s, Bar (West)', 'The "Hall"', 'Back\\slash']);
  assert.deepEqual(batches, [["Joe's, Bar (West)"]]);
  assert.deepEqual(singles, ['The "Hall"', 'Back\\slash']);
});

Deno.test('the index matches exactly, keeps the first row, and learns in-run inserts', () => {
  const index = new ExistingRowIndex('name', [
    { id: 'a', name: 'Zombie Burger' },
    { id: 'b', name: 'Zombie Burger' },
  ]);
  assert.equal(index.find('Zombie Burger')?.id, 'a');
  // .eq() is exact, so the index must not fold case or whitespace either.
  assert.equal(index.find('zombie burger'), undefined);
  assert.equal(index.find('Zombie Burger '), undefined);
  assert.equal(index.find('Fong\'s Pizza'), undefined);
  index.add({ id: 'c', name: 'Fong\'s Pizza' });
  assert.equal(index.find('Fong\'s Pizza')?.id, 'c');
  assert.equal(index.size, 2);
});

Deno.test('firecrawl-scraper no longer reads per item for any category', async () => {
  const src = codeOnly(await read('supabase/functions/firecrawl-scraper/index.ts'));
  const loopStart = src.indexOf('for (const item of batch)');
  const loopEnd = src.indexOf('if (pendingEventRows.length > 0)');
  assert.ok(loopStart > 0 && loopEnd > loopStart, 'the write loop moved');
  const loop = src.slice(loopStart, loopEnd);

  assert.doesNotMatch(loop, /\.eq\('name', transformedData\.name\)/, 'the per-item name read is back');
  assert.doesNotMatch(loop, /\.eq\('title', transformedData\.title\)/, 'the per-item title read is back');
  assert.doesNotMatch(loop, /from\('competitors'\)/, 'the competitor is looked up once per run, not per item');
  assert.doesNotMatch(loop, /\.select\(/, 'the write loop must not read; the reads happen before it');

  const before = src.slice(0, loopStart);
  assert.match(before, /planReads\(keys\)/, 'existing rows are read in planned batches');
  assert.match(before, /\.in\(keyField, batch\)/, 'a batch is one .in() read');
  assert.match(before, /from\('competitors'\)/, 'the competitor read happens before the loop');

  // The failed read must still skip the item (WEB-BE-048), so its error has to
  // reach the per-item check rather than being dropped.
  assert.match(loop, /dupCheckError = existingRowsError/, 'a failed batched read must fail every item check');
  // An in-run insert has to be visible to a second copy later in the run.
  assert.match(loop, /existingRows\?\.add\(transformedData\)/, 'inserted rows must enter the index');
});

Deno.test('the insert and the lookup share one key rule', async () => {
  const src = codeOnly(await read('supabase/functions/firecrawl-scraper/index.ts'));
  assert.equal((src.match(/name: rowName\(category, item\)/g) || []).length, 3, 'all three name-keyed inserts use rowName');
  assert.match(src, /title: competitorTitle\(item\)/, 'competitor content uses competitorTitle');
  assert.doesNotMatch(src, /\|\| "Unnamed Restaurant"/, 'a second copy of the default has crept back');
});
