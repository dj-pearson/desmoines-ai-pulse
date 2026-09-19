#!/usr/bin/env node
/**
 * The event category vocabulary exists twice and must stay identical
 * (WEB-BE-049).
 *
 * The browser bundle cannot import from supabase/functions - Vite would pull
 * Deno-flavoured module specifiers into the client bundle - so the JSON and the
 * normalizer are mirrored under src/lib. Two copies of a decision table is how
 * the vocabularies diverged in the first place, which is the whole story this
 * closes, so the mirror is checked rather than trusted.
 *
 * The Python crawler is NOT checked here: it reads
 * supabase/functions/_shared/eventCategories.json off disk at import time, so
 * it cannot drift. crawlers/test_categories.py asserts that it loaded the real
 * file rather than its degraded fallback.
 */
import { readFileSync } from 'node:fs';

const SHARED_JSON = 'supabase/functions/_shared/eventCategories.json';
const SRC_JSON = 'src/lib/eventCategories.json';
const SHARED_TS = 'supabase/functions/_shared/eventCategories.ts';
const SRC_TS = 'src/lib/eventCategories.ts';

/** Everything from the first export onward: the list, the table and the logic.
 *  The header comment and the import line differ between the copies on purpose
 *  (one is a Deno import attribute, one is not). */
const MARKER = 'export const EVENT_CATEGORIES';

const problems = [];
const read = (p) => readFileSync(p, 'utf8');

function body(path) {
  const src = read(path);
  const at = src.indexOf(MARKER);
  if (at < 0) {
    problems.push(`${path}: no "${MARKER}" - the mirror check cannot find the code to compare`);
    return null;
  }
  return src.slice(at);
}

const sharedData = JSON.parse(read(SHARED_JSON));
const srcData = JSON.parse(read(SRC_JSON));

if (JSON.stringify(sharedData) !== JSON.stringify(srcData)) {
  problems.push(
    `${SHARED_JSON} and ${SRC_JSON} differ. They are one vocabulary; copy the shared file over the mirror.`,
  );
}

const sharedBody = body(SHARED_TS);
const srcBody = body(SRC_TS);
if (sharedBody && srcBody && sharedBody !== srcBody) {
  problems.push(
    `${SHARED_TS} and ${SRC_TS} differ below "${MARKER}". The normalizer has to make the same decision in both runtimes.`,
  );
}

// A relative import into supabase/ from src/ type-checks and then breaks the
// Vite build, which is the failure this mirror exists to avoid.
if (/from\s+["'][^"']*supabase\/functions/.test(read(SRC_TS))) {
  problems.push(`${SRC_TS} imports from supabase/functions; the browser bundle cannot resolve that.`);
}

// The fallback has to be a member of the list, or normalizeCategory returns a
// value no filter will ever show.
if (!sharedData.categories.includes(sharedData.fallback)) {
  problems.push(`${SHARED_JSON}: fallback "${sharedData.fallback}" is not in categories.`);
}

// Every keyword group has to name a category that exists.
for (const group of sharedData.keywords) {
  if (!sharedData.categories.includes(group.category)) {
    problems.push(`${SHARED_JSON}: keyword group points at "${group.category}", which is not a category.`);
  }
  for (const kw of group.match) {
    if (kw !== kw.toLowerCase()) {
      problems.push(`${SHARED_JSON}: keyword "${kw}" is not lowercase; matching lowercases the input, so it can never fire.`);
    }
    if (kw !== kw.trim() || kw.length === 0) {
      problems.push(`${SHARED_JSON}: keyword ${JSON.stringify(kw)} has stray whitespace.`);
    }
    // Matching is word-prefix, so "art" no longer catches "Party" - but a
    // keyword this short still catches every word beginning with it, and
    // "bar" would catch Barnstormers.
    if (kw.trim().length < 3) {
      problems.push(
        `${SHARED_JSON}: keyword "${kw}" is under 3 characters and will fire on almost any word.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The pSEO category pages select rows with a regex against events.category.
// Normalizing the column can therefore empty a published page without touching
// it: `farmers-markets` matches 'market|farmer', and folding farmers markets
// into Food would have left that pattern matching nothing at all. 31 published
// pages once rendered empty listings for the same class of mismatch
// (WEB-SEO-013), so it is checked rather than remembered.
// ---------------------------------------------------------------------------
const listingFilters = read('src/pseo/listingFilters.ts');
const filterBlock = listingFilters.slice(
  listingFilters.indexOf('export const CATEGORY_FILTERS'),
);
const eventPatterns = [
  ...filterBlock.matchAll(
    /['"]?([\w-]+)['"]?:\s*\{\s*entity:\s*'events',\s*column:\s*'category',\s*pattern:\s*'([^']+)'/g,
  ),
];
if (eventPatterns.length === 0) {
  problems.push(
    'src/pseo/listingFilters.ts: no events/category patterns found. Either the shape changed or this check has stopped checking anything.',
  );
}
for (const [, slug, pattern] of eventPatterns) {
  const re = new RegExp(pattern, 'i');
  const hits = sharedData.categories.filter((c) => re.test(c));
  if (hits.length === 0) {
    problems.push(
      `src/pseo/listingFilters.ts: the /${slug}/* pages match events.category against /${pattern}/i, ` +
        'which matches no canonical category. That page will render an empty listing.',
    );
  }
}

if (problems.length > 0) {
  console.error('[event-categories] the vocabulary is not consistent:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(
  `[event-categories] ${sharedData.categories.length} categories, ${sharedData.keywords.length} keyword groups, ` +
    `mirror in sync, ${eventPatterns.length} pSEO category pattern(s) resolve.`,
);
