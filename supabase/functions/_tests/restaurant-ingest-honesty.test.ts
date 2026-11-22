/**
 * Restaurant ingest stores what a source said, or null (eat-drink pass 2, WP5).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/restaurant-ingest-honesty.test.ts
 *
 * WHAT THIS IS PROTECTING.
 *   - restaurant-opening-scraper selected six columns and then tested
 *     `!existing.description`, which was therefore always true, so every run
 *     rewrote description, cuisine, location, phone, website and price_range,
 *     and a closed row came back to life because `closed` had no rank.
 *   - ai-crawler inserted "Unnamed Restaurant", "American", "$$" and an
 *     LLM-read rating as if a source had said them.
 *   - the admin Places tool stored "$" for every price level and "American"
 *     for every cuisine, and offered "Mark Closed" for a renovation.
 *   - data-quality-heal asked restaurants for an `address` column that isn't
 *     there, and the 42703 threw away the whole run.
 *   - check-restaurant-status and search-new-restaurants spent the Places key
 *     for any anonymous caller.
 *
 * The two pure functions are lifted out of their files between
 * `// BEGIN pure:` and `// END pure:` markers and imported from a data: URL,
 * because importing an edge function's index.ts starts its server and reads
 * env the test doesn't have. Everything else is asserted against the source.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(?<!:)\/\/.*$/, '')).join('\n');

/** The block between the markers, as an importable module. */
async function liftPure<T>(rel: string, name: string, exportNames: string[] = []): Promise<T> {
  const src = await read(rel);
  const begin = src.indexOf(`// BEGIN pure: ${name}`);
  const end = src.indexOf(`// END pure: ${name}`);
  assert.ok(begin >= 0 && end > begin, `${rel} must keep the "${name}" pure block markers`);
  const block = src.slice(begin, end);
  assert.doesNotMatch(block, /^\s*import\s/m, `the ${name} block must stay self-contained`);
  const tail = exportNames.length ? `\nexport { ${exportNames.join(', ')} };\n` : '';
  const encoded = btoa(unescape(encodeURIComponent(block + tail)));
  return await import(`data:application/typescript;base64,${encoded}`) as T;
}

/** A top-level `const NAME ... = {...};` or `(...)` body, sliced out of source. */
function sliceBetween(src: string, start: string, stop: string): string {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `expected to find ${start}`);
  const j = src.indexOf(stop, i + start.length);
  assert.ok(j > i, `expected ${stop} after ${start}`);
  return src.slice(i, j);
}

// ---------------------------------------------------------------------------
// restaurant-opening-scraper
// ---------------------------------------------------------------------------

type Existing = Record<string, string | null> & { id: string; name: string };
type Planner = {
  planOpeningUpdate: (existing: Existing, scraped: Record<string, string | null | undefined>) => Record<string, string> | null;
  EXISTING_OPENING_COLUMNS: string;
};
const SCRAPER = 'supabase/functions/restaurant-opening-scraper/index.ts';
const planner = await liftPure<Planner>(SCRAPER, 'planOpeningUpdate');

const FULL_ROW: Existing = {
  id: 'r1',
  name: 'Noce',
  location: '1326 Walnut St, Des Moines, IA',
  status: 'announced',
  opening_date: null,
  opening_timeframe: null,
  description: 'A jazz club with a kitchen, written by a person.',
  cuisine: 'Italian',
  source_url: 'https://example.com/original',
  phone: '515-555-0100',
  website: 'https://nocedsm.com',
  price_range: '$$$',
};

const SCRAPE = {
  name: 'Noce',
  status: 'opening_soon',
  opening_date: '2026-11-01',
  opening_timeframe: 'November 2026',
  description: 'Model-written summary that must not replace the real one.',
  cuisine: 'American',
  location: 'Des Moines, IA',
  source_url: 'https://example.com/scraped',
  phone: '515-555-9999',
  website: 'https://wrong.example.com',
  price_range: '$',
};

Deno.test('a row with a description gets only status and dates', () => {
  const update = planner.planOpeningUpdate(FULL_ROW, SCRAPE);
  assert.deepEqual(update, {
    status: 'opening_soon',
    opening_date: '2026-11-01',
    opening_timeframe: 'November 2026',
  });
});

Deno.test('empty fields are filled, filled fields are left alone', () => {
  const sparse: Existing = { ...FULL_ROW, description: '', cuisine: null, website: '  ' };
  const update = planner.planOpeningUpdate(sparse, SCRAPE) ?? {};
  assert.equal(update.description, SCRAPE.description);
  assert.equal(update.cuisine, SCRAPE.cuisine);
  assert.equal(update.website, SCRAPE.website);
  assert.equal('phone' in update, false, 'a phone already on the row is not rewritten');
  assert.equal('price_range' in update, false);
  assert.equal('source_url' in update, false);
});

Deno.test('location is never rewritten, only filled when empty', () => {
  assert.equal('location' in (planner.planOpeningUpdate(FULL_ROW, SCRAPE) ?? {}), false);
  const noLocation = planner.planOpeningUpdate({ ...FULL_ROW, location: null }, SCRAPE) ?? {};
  assert.equal(noLocation.location, 'Des Moines, IA');
});

Deno.test('a closed row is never touched', () => {
  assert.equal(planner.planOpeningUpdate({ ...FULL_ROW, status: 'closed' }, SCRAPE), null);
  assert.equal(
    planner.planOpeningUpdate({ ...FULL_ROW, status: 'closed', description: null }, { ...SCRAPE, status: 'open' }),
    null,
  );
});

Deno.test('status only moves forward, and never off a status it does not rank', () => {
  assert.equal(planner.planOpeningUpdate({ ...FULL_ROW, status: 'open' }, { ...SCRAPE, opening_date: null, opening_timeframe: null }), null);
  assert.equal(
    planner.planOpeningUpdate({ ...FULL_ROW, status: 'temporarily_closed' }, { ...SCRAPE, opening_date: null, opening_timeframe: null }),
    null,
  );
  assert.equal(planner.planOpeningUpdate({ ...FULL_ROW, status: null }, SCRAPE)?.status, 'opening_soon');
});

Deno.test('nothing new plans no update at all', () => {
  const same = { ...SCRAPE, status: 'announced', opening_date: null, opening_timeframe: null };
  assert.equal(planner.planOpeningUpdate(FULL_ROW, same), null);
});

Deno.test('the scraper selects every column the planner reads, and uses the planner', async () => {
  const src = codeOnly(await read(SCRAPER));
  for (const col of ['description', 'cuisine', 'source_url', 'phone', 'website', 'price_range', 'status', 'location']) {
    assert.ok(planner.EXISTING_OPENING_COLUMNS.split(/,\s*/).includes(col), `lookup must select ${col}`);
  }
  assert.match(src, /\.select\(EXISTING_OPENING_COLUMNS\)/);
  assert.match(src, /planOpeningUpdate\(existing/);
  assert.doesNotMatch(src, /if \(restaurant\.description\) updateData\.description/, 'the unconditional overwrite is gone');
});

// ---------------------------------------------------------------------------
// ai-crawler
// ---------------------------------------------------------------------------

Deno.test('ai-crawler restaurant transforms store null, not guesses', async () => {
  const src = codeOnly(await read('supabase/functions/ai-crawler/index.ts'));
  const transforms = sliceBetween(src, 'case "restaurants": {', 'case "playgrounds":');
  assert.doesNotMatch(transforms, /Unnamed Restaurant|New Restaurant"/, 'a nameless item is dropped, not named');
  assert.doesNotMatch(transforms, /"American"|'American'/);
  assert.doesNotMatch(transforms, /\|\| "\$\$"/);
  assert.doesNotMatch(transforms, /\|\| "Des Moines, IA"/);
  assert.doesNotMatch(transforms, /rating:\s*item\.rating/, 'a model-read rating is never stored');
  assert.equal([...transforms.matchAll(/rating: null,/g)].length, 2, 'both restaurant transforms write rating: null');
  assert.equal([...transforms.matchAll(/return null;/g)].length, 2, 'both drop an item with no name');
});

// ---------------------------------------------------------------------------
// Admin Places tool
// ---------------------------------------------------------------------------

const PLACES_TOOL = 'src/components/GooglePlacesRestaurantTools.tsx';

Deno.test('Places price levels map to dollar signs, or null', async () => {
  const { placesPriceRange } = await liftPure<{ placesPriceRange: (l: string | null | undefined) => string | null }>(
    PLACES_TOOL,
    'placesPriceRange',
    ['placesPriceRange'],
  );
  assert.equal(placesPriceRange('PRICE_LEVEL_INEXPENSIVE'), '$');
  assert.equal(placesPriceRange('PRICE_LEVEL_MODERATE'), '$$', 'this was "$" via Array(enum).fill');
  assert.equal(placesPriceRange('PRICE_LEVEL_EXPENSIVE'), '$$$');
  assert.equal(placesPriceRange('PRICE_LEVEL_VERY_EXPENSIVE'), '$$$$');
  assert.equal(placesPriceRange('PRICE_LEVEL_FREE'), null);
  assert.equal(placesPriceRange('PRICE_LEVEL_UNSPECIFIED'), null);
  assert.equal(placesPriceRange(undefined), null, 'no level is null, not "$$"');
});

Deno.test('the Places tool stores null cuisine and description and only marks permanent closures', async () => {
  const src = codeOnly(await read(PLACES_TOOL));
  assert.doesNotMatch(src, /"American"|'American'/);
  assert.doesNotMatch(src, /Discovered via Google/);
  assert.doesNotMatch(src, /Array\(restaurant\.price_level\)/);
  assert.match(src, /price_range: placesPriceRange\(restaurant\.price_level\)/);
  assert.match(src, /restaurant\.google_status === "CLOSED_PERMANENTLY" \?/, 'the button is offered only for a permanent closure');
  assert.match(src, /if \(restaurantStatus\.google_status !== "CLOSED_PERMANENTLY"\) return;/, 'and markAsClosed refuses anything else');
  assert.match(src, /Needs review/);
});

// ---------------------------------------------------------------------------
// data-quality-heal
// ---------------------------------------------------------------------------

Deno.test('every ADDR_COLS column exists in the schema snapshot', async () => {
  const src = codeOnly(await read('supabase/functions/data-quality-heal/index.ts'));
  const block = sliceBetween(src, 'const ADDR_COLS', '};');
  const snapshot = JSON.parse(await read('scripts/db-snapshot.json')) as { columns: string[] };
  const columns = new Set(snapshot.columns);
  const entries = [...block.matchAll(/(\w+):\s*\[([^\]]*)\]/g)];
  assert.ok(entries.length >= 3, 'expected an entry per table');
  for (const [, table, list] of entries) {
    for (const col of [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])) {
      assert.ok(columns.has(`${table}.${col}`), `${table}.${col} is not in scripts/db-snapshot.json`);
    }
  }
});

Deno.test('one table failing does not end the heal run', async () => {
  const src = codeOnly(await read('supabase/functions/data-quality-heal/index.ts'));
  assert.match(src, /tableErrors\[table\] =/);
  assert.match(src, /ctx\.meta\(\{ kpi, stages: stageCounts, tableErrors \}\)/);
});

// ---------------------------------------------------------------------------
// Paid-API functions
// ---------------------------------------------------------------------------

for (const fn of ['check-restaurant-status', 'search-new-restaurants']) {
  Deno.test(`${fn} checks the caller and rate-limits before spending the Places key`, async () => {
    const src = codeOnly(await read(`supabase/functions/${fn}/index.ts`));
    const auth = src.indexOf('await requireAdminOrApiKey(req, corsHeaders)');
    const limit = src.indexOf('await checkRateLimitPersistent(req');
    const body = src.indexOf('await req.json()');
    const google = src.indexOf('GOOGLE_SEARCH_API');
    assert.ok(auth > 0, 'requireAdminOrApiKey must be called');
    assert.ok(limit > auth, 'the rate limit runs after auth');
    assert.ok(body > limit && google > limit, 'both before the body is read or the key is touched');
  });
}

Deno.test('check-restaurant-status refuses a batch over the admin tool chunk size', async () => {
  const fnSrc = codeOnly(await read('supabase/functions/check-restaurant-status/index.ts'));
  const toolSrc = codeOnly(await read(PLACES_TOOL));
  const max = Number(fnSrc.match(/const MAX_BATCH = (\d+);/)?.[1]);
  const chunk = Number(toolSrc.match(/const STATUS_CHECK_BATCH = (\d+);/)?.[1]);
  assert.ok(max > 0 && chunk > 0);
  assert.ok(chunk <= max, `the tool sends ${chunk} per call and the function accepts ${max}`);
  assert.match(fnSrc, /restaurants\.length > MAX_BATCH/);
});

// ---------------------------------------------------------------------------
// firecrawl-scraper (WEB-BE-068)
// ---------------------------------------------------------------------------

const FIRECRAWL = 'supabase/functions/firecrawl-scraper/index.ts';
type Facts = Record<string, string | null>;
const { restaurantFacts } = await liftPure<{ restaurantFacts: (item: Record<string, unknown>) => Facts }>(
  FIRECRAWL,
  'restaurantFacts',
);

Deno.test('firecrawl-scraper stores null for a restaurant fact the page did not give', () => {
  const facts = restaurantFacts({ name: 'Noce' });
  assert.equal(facts.cuisine, null, 'was "American"');
  assert.equal(facts.location, null, 'was "Des Moines, IA"');
  assert.equal(facts.price_range, null, 'was "$$"');
  assert.equal(facts.description, null);
  assert.equal(facts.phone, null);
  assert.equal(facts.website, null);
  const blank = restaurantFacts({ cuisine: '  ', location: '', price_range: 3, description: null });
  assert.equal(blank.cuisine, null, 'whitespace is not a cuisine');
  assert.equal(blank.location, null);
  assert.equal(blank.price_range, null, 'a non-string is not a price');
});

Deno.test('firecrawl-scraper keeps what the page said, trimmed and bounded', () => {
  const facts = restaurantFacts({
    cuisine: ' Italian ',
    location: '1326 Walnut St, Des Moines, IA',
    price_range: '$$$',
    description: 'x'.repeat(600),
    phone: '515-555-0100',
    website: 'https://nocedsm.com',
  });
  assert.equal(facts.cuisine, 'Italian');
  assert.equal(facts.location, '1326 Walnut St, Des Moines, IA');
  assert.equal(facts.price_range, '$$$');
  assert.equal(facts.description?.length, 500);
  assert.equal(facts.phone, '515-555-0100');
  assert.equal(facts.website, 'https://nocedsm.com');
});

Deno.test('firecrawl-scraper never stores a rating, even when the page shows one', () => {
  assert.equal(restaurantFacts({ rating: 4.7 }).rating, null);
  assert.equal(restaurantFacts({ rating: '4.7' }).rating, null);
});

Deno.test('the firecrawl-scraper restaurant row is built from restaurantFacts and nothing else', async () => {
  const src = codeOnly(await read(FIRECRAWL));
  const row = sliceBetween(src, "case 'restaurants':", "case 'playgrounds':");
  assert.match(row, /\.\.\.restaurantFacts\(item\)/);
  for (const col of ['cuisine', 'location', 'rating', 'price_range', 'description', 'phone', 'website']) {
    assert.doesNotMatch(row, new RegExp(`\\b${col}:`), `${col} is set only by restaurantFacts`);
  }
  assert.doesNotMatch(row, /"American"|'American'|"\$\$"|'\$\$'/);
});

// ---------------------------------------------------------------------------
// enhance-content (WEB-BE-068)
// ---------------------------------------------------------------------------

const ENHANCE = 'supabase/functions/enhance-content/index.ts';
type EnhancePlan = { update: Record<string, unknown>; refused: string[] };
const enhance = await liftPure<{
  planEnhanceUpdate: (type: string, data: Record<string, unknown>) => EnhancePlan;
  ENHANCE_WRITABLE: Record<string, readonly string[]>;
}>(ENHANCE, 'planEnhanceUpdate');

const MODEL_GUESS = {
  description: '  A neighborhood trattoria.  ',
  phone: '(515) 555-0100',
  website: 'https://example.com',
  location: '123 Main St, Des Moines, IA',
  cuisine: 'American',
  price_range: '$$',
  rating: 4.5,
  is_featured: true,
  status: 'ok',
};

Deno.test('enhance-content writes only a description for a restaurant', () => {
  assert.deepEqual([...enhance.ENHANCE_WRITABLE.restaurant], ['description']);
  const { update, refused } = enhance.planEnhanceUpdate('restaurant', MODEL_GUESS);
  assert.deepEqual(update, { description: 'A neighborhood trattoria.' });
  assert.deepEqual(
    refused.sort(),
    ['cuisine', 'is_featured', 'location', 'phone', 'price_range', 'rating', 'website'],
    'every other key is refused and reported; status is the control field and is dropped quietly',
  );
});

Deno.test('enhance-content refuses an unknown key, a non-string value and an unknown type', () => {
  assert.deepEqual(enhance.planEnhanceUpdate('restaurant', { owner_email: 'a@b.c' }), {
    update: {},
    refused: ['owner_email'],
  });
  assert.deepEqual(enhance.planEnhanceUpdate('restaurant', { description: 42 }).refused, ['description']);
  assert.deepEqual(enhance.planEnhanceUpdate('restaurant', { description: '   ' }).update, {});
  assert.deepEqual(enhance.planEnhanceUpdate('mystery', { description: 'x' }), { update: {}, refused: ['description'] });
});

Deno.test('enhance-content never writes a rating for any type', () => {
  for (const [type, cols] of Object.entries(enhance.ENHANCE_WRITABLE)) {
    assert.equal(cols.includes('rating'), false, `${type} must not list rating`);
    assert.ok(enhance.planEnhanceUpdate(type, { rating: '4.5' }).refused.includes('rating'));
  }
});

Deno.test('enhance-content updates the row with the plan, and asks only for whitelisted fields', async () => {
  const src = codeOnly(await read(ENHANCE));
  assert.match(src, /planEnhanceUpdate\(contentType, enhancedData\)/);
  assert.match(src, /\.update\(update\)/);
  assert.doesNotMatch(src, /\.update\(enhancedData\)/, 'the raw model response never reaches the row');
  assert.match(src, /availableFields: \[\.\.\.\(ENHANCE_WRITABLE\[type\]/, 'the prompt lists the whitelist');
  assert.doesNotMatch(src, /"rating": 4\.5/, 'no rating example in the prompt');
});
