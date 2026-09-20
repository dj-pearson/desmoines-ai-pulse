/**
 * The event category vocabulary is one list, and every writer uses it
 * (WEB-BE-049).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/event-categories.test.ts
 *
 * WHAT THIS IS PROTECTING. There was no canonical list at all. SeatGeek wrote
 * "Comedy" and "Family" that no other path produced, tribeEvents and
 * venueProfile defaulted to "General", the three row builders defaulted to
 * "General" again, and the shared extraction prompt asked for
 * "Music/Sports/Arts/Community/Entertainment/Festival" while showing the model
 * an example that read "category": "Concert". The /events filter chips come
 * from get_event_categories - a SELECT DISTINCT - so every one of those words
 * became a chip, and src/pseo/listingFilters.ts had to match categories with
 * regexes to find anything.
 *
 * The behaviour tests below matter, but the wiring tests matter more: a
 * normalizer nothing calls is the same as no normalizer.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import {
  EVENT_CATEGORIES,
  FALLBACK_CATEGORY,
  isCanonicalCategory,
  normalizeCategory,
} from '../_shared/eventCategories.ts';

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

Deno.test('a canonical value survives unchanged', () => {
  for (const c of EVENT_CATEGORIES) assert.equal(normalizeCategory(c), c);
});

Deno.test('case and surrounding space do not make a new category', () => {
  assert.equal(normalizeCategory('  music '), 'Music');
  assert.equal(normalizeCategory('SPORTS'), 'Sports');
});

Deno.test('the words already in the table map somewhere real', () => {
  // src/pseo/listingFilters.ts names these three as what events.category holds.
  assert.equal(normalizeCategory('Concert'), 'Music');
  assert.equal(normalizeCategory('Music'), 'Music');
  assert.equal(normalizeCategory('Festival'), 'Festival');
});

Deno.test('the submission form labels fold onto the ingest vocabulary', () => {
  // These fourteen were the form's own list and nothing else in the system
  // produced any of them.
  const pairs: [string, string][] = [
    ['Art & Culture', 'Arts'],
    ['Business & Networking', 'Business'],
    ['Family & Kids', 'Family'],
    ['Food & Dining', 'Food'],
    ['Health & Wellness', 'Health'],
    ['Music & Concerts', 'Music'],
    ['Outdoor & Recreation', 'Outdoor'],
    ['Sports & Fitness', 'Sports'],
    ['Education & Learning', 'Education'],
    ['Community Service', 'Community'],
    ['Nightlife', 'Entertainment'],
  ];
  for (const [label, expected] of pairs) {
    assert.equal(normalizeCategory(label), expected, `${label} should normalize to ${expected}`);
  }
});

Deno.test('"General" does not survive', () => {
  // It was the default of tribeEvents, venueProfile and all three row builders,
  // and it means "nobody decided" rather than naming a kind of event.
  assert.equal(normalizeCategory('General'), FALLBACK_CATEGORY);
  assert.ok(!EVENT_CATEGORIES.includes('General'));
});

Deno.test('normalizeCategory is total', () => {
  for (const input of [null, undefined, 42, {}, [], '', '   ', 'Sale-A-Bration']) {
    const out = normalizeCategory(input);
    assert.ok(
      EVENT_CATEGORIES.includes(out),
      `${JSON.stringify(input)} produced ${out}, which is not in the vocabulary`,
    );
  }
});

Deno.test('the keyword order is load-bearing and pinned', () => {
  // "Sports & Fitness" contains both a Sports and a Health keyword; Sports is
  // listed first, so it wins. Reordering the JSON silently refiles events.
  assert.equal(normalizeCategory('Sports & Fitness'), 'Sports');
  // "Trade Show" contains Business's "trade show" and Entertainment's "show".
  assert.equal(normalizeCategory('Trade Show'), 'Business');
  // "Farmers Market" is its own category, not Food. src/pseo/listingFilters.ts
  // selects the /farmers-markets/* pages with /market|farmer/ against this
  // column, and folding them into Food would have emptied every one of those
  // published pages without touching them.
  assert.equal(normalizeCategory('Farmers Market'), 'Markets');
  assert.equal(normalizeCategory('Downtown Farmers Market'), 'Markets');
  // And a marketing event is still business, because Business is matched first.
  assert.equal(normalizeCategory('Marketing Conference'), 'Business');
});

Deno.test('keywords match word prefixes, not raw substrings', () => {
  // A plain includes() filed all three of these under Arts, because every one
  // of them contains "art". This is the single highest-volume way a keyword
  // table silently refiles real events.
  assert.equal(normalizeCategory('Block Party'), 'Other');
  assert.equal(normalizeCategory('Startup Expo'), 'Business');
  assert.notEqual(normalizeCategory('Heart Walk'), 'Arts');
  // And the prefixes it is supposed to catch still fire.
  assert.equal(normalizeCategory('Artist Showcase'), 'Arts');
  assert.equal(normalizeCategory('Art & Culture'), 'Arts');
  assert.equal(normalizeCategory('Community Events'), 'Community');
});

Deno.test('short keywords that would still collide are absent', () => {
  // Word-prefix matching fixes "Party", not "Barnstormers": a 3-letter keyword
  // catches every word beginning with it either way, so "bar" stays out.
  assert.notEqual(normalizeCategory('Barnstormers'), 'Entertainment');
  assert.equal(normalizeCategory('Barbecue Bash'), 'Other');
  // "race" would have caught Terrace under substring matching; it is not a
  // keyword at all.
  assert.equal(normalizeCategory('Terrace Hill Tour'), 'Other');
});

Deno.test('a keyword with a hyphen is matched whole, not split', () => {
  // The value is split on non-letters, so "stand-up" could never match a token.
  // Keywords that are not plain letters fall back to a whole-string match -
  // without it three keywords in the table were dead code.
  assert.equal(normalizeCategory('Stand-Up Night'), 'Comedy');
  assert.equal(normalizeCategory('Trade Show'), 'Business');
  assert.equal(normalizeCategory('Night Life'), 'Entertainment');
});

Deno.test('a job fair is a career event, not a carnival', () => {
  // Business sits before Festival in the JSON for exactly this. Both groups
  // match; order decides.
  assert.equal(normalizeCategory('Job Fair'), 'Business');
  assert.equal(normalizeCategory('Iowa State Fair'), 'Festival');
});

Deno.test('isCanonicalCategory is exact, not fuzzy', () => {
  assert.ok(isCanonicalCategory('Music'));
  assert.ok(!isCanonicalCategory('music'));
  assert.ok(!isCanonicalCategory('Concert'));
  assert.ok(!isCanonicalCategory(null));
});

// ---------------------------------------------------------------------------
// Wiring. A normalizer nothing calls is the same as no normalizer.
// ---------------------------------------------------------------------------

/** Every place a row destined for `events` gets its category. */
const EVENT_ROW_BUILDERS = [
  'supabase/functions/ingest-events/plan.ts',
  'supabase/functions/firecrawl-scraper/index.ts',
  'supabase/functions/ai-crawler/index.ts',
];

/**
 * firecrawl-scraper builds rows for six tables in one switch. Only the events
 * branch is this vocabulary's business - `competitor_content.category` is a
 * different taxonomy (Tourism, Dining, Attractions) written by a different
 * prompt - so the "General" check is scoped to the events case rather than the
 * file.
 */
function eventsRegion(rel: string, src: string): string {
  if (!rel.endsWith('firecrawl-scraper/index.ts')) return src;
  const start = src.indexOf("case 'events':");
  const end = src.indexOf("case 'restaurants':", start);
  assert.ok(start >= 0 && end > start, 'the firecrawl events branch moved; update this slice');
  return src.slice(start, end);
}

Deno.test('every events row builder normalizes its category', async () => {
  for (const rel of EVENT_ROW_BUILDERS) {
    const src = codeOnly(await read(rel));
    assert.match(
      src,
      /category:\s*normalizeCategory\(/,
      `${rel} writes events.category without normalizing it`,
    );
    assert.ok(
      !/category:.*\|\|\s*["']General["']/.test(eventsRegion(rel, src)),
      `${rel} still falls back to "General"`,
    );
  }
});

Deno.test('the python crawler normalizes too', async () => {
  // It writes to `events` directly with a service-role key, so no edge function
  // sees its rows and no TypeScript check covers them.
  const src = await read('crawlers/catchdesmoines_crawler.py');
  assert.match(src, /"category": normalize_category\(/, 'the crawler writes a raw category');
  assert.match(
    src,
    /eventCategories\.json/,
    'the crawler must read the shared vocabulary rather than keep a fourth copy',
  );
});

Deno.test('no adapter emits a category outside the vocabulary', async () => {
  // Adapter literals never pass through normalizeCategory on the venueProfile
  // path, so they have to be canonical at the source.
  const dir = new URL('supabase/functions/_shared/domain-adapters/', REPO);
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const src = codeOnly(await Deno.readTextFile(new URL(entry.name, dir)));
    for (const m of src.matchAll(/category:\s*["']([^"']+)["']/g)) {
      assert.ok(
        isCanonicalCategory(m[1]),
        `${entry.name} emits category "${m[1]}", which is not in the vocabulary`,
      );
    }
  }
});

Deno.test('the shared extraction prompt asks for the vocabulary it will be held to', async () => {
  // The old prompt listed six categories and then showed an example using a
  // seventh. Whatever the model returns is now normalized either way, but a
  // prompt that asks for the wrong words spends the model's attention on
  // producing values that will be thrown away.
  const raw = await read('supabase/functions/_shared/prompts/eventExtraction.json');
  const template = JSON.parse(raw).categories.events.template as string;
  const line = template.split('\n').find((l: string) => l.trim().startsWith('- category:'));
  assert.ok(line, 'the events prompt no longer documents a category field');
  for (const c of EVENT_CATEGORIES) {
    assert.ok(line!.includes(c), `the prompt does not offer "${c}"`);
  }
  const example = template.match(/"category":\s*"([^"]+)"/);
  assert.ok(example, 'the events prompt no longer shows a category example');
  assert.ok(
    isCanonicalCategory(example![1]),
    `the prompt's example uses "${example![1]}", which is not in the vocabulary - this is how "Concert" got into the table`,
  );
});

Deno.test('the submission form offers the canonical list, not its own', async () => {
  const src = await read('src/components/EventSubmissionForm.tsx');
  assert.match(
    src,
    /import \{ EVENT_CATEGORIES \} from ["']@\/lib\/eventCategories["']/,
    'the form must take its options from the shared list',
  );
  assert.ok(
    !/const EVENT_CATEGORIES\s*=/.test(src),
    'the form still declares its own category list',
  );
});
