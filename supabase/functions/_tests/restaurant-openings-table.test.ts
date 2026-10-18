/**
 * WEB-BE-054: restaurant openings are restaurants rows.
 *
 * Both ingest paths used to disagree - ai-crawler wrote restaurants, while
 * firecrawl-scraper mapped the category to a restaurant_openings table and then
 * had no case for it, so it dropped every opening it extracted.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */
import { strict as assert } from 'node:assert';
import {
  normalizeOpeningStatus,
  OPENING_TABLE,
  openingDateOnly,
} from '../_shared/restaurantOpening.ts';

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(?<!:)\/\/.*$/, '')).join('\n');

Deno.test('openings go to the restaurants table', () => {
  assert.equal(OPENING_TABLE, 'restaurants');
});

Deno.test('status is one the restaurants CHECK and the public list accept', () => {
  assert.equal(normalizeOpeningStatus('opening_soon'), 'opening_soon');
  assert.equal(normalizeOpeningStatus(' Newly_Opened '), 'newly_opened');
  assert.equal(normalizeOpeningStatus('coming_soon'), 'announced');
  assert.equal(normalizeOpeningStatus(undefined), 'announced');
  assert.equal(normalizeOpeningStatus('open'), 'announced', 'an opening is never stored as already open');
});

Deno.test('opening date keeps a leading ISO date and invents nothing', () => {
  assert.equal(openingDateOnly('2026-12-05'), '2026-12-05');
  assert.equal(openingDateOnly('2026-10-01T00:00:00Z'), '2026-10-01');
  assert.equal(openingDateOnly('sometime in spring'), null);
  assert.equal(openingDateOnly(null), null);
});

Deno.test('no ingest path writes the restaurant_openings table', async () => {
  for (const fn of ['firecrawl-scraper', 'ai-crawler']) {
    const src = codeOnly(await read(`supabase/functions/${fn}/index.ts`));
    assert.doesNotMatch(src, /\.from\(\s*['"]restaurant_openings['"]/, `${fn} must not query restaurant_openings`);
    assert.doesNotMatch(src, /restaurant_openings:\s*['"]restaurant_openings['"]/, `${fn} must not map the category to that table`);
    assert.match(src, /from "\.\.\/_shared\/restaurantOpening\.ts"/, `${fn} must use the shared opening module`);
  }
});

Deno.test('firecrawl has a restaurant_openings case, so openings are not dropped', async () => {
  const src = codeOnly(await read('supabase/functions/firecrawl-scraper/index.ts'));
  assert.match(src, /case 'restaurant_openings': \{/);
  assert.match(src, /status: normalizeOpeningStatus\(item\.status\)/);
  assert.match(src, /restaurant_openings: OPENING_TABLE/);
});
