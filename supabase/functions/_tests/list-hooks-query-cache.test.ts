/**
 * Every list hook is a TanStack query (WEB-PERF-028).
 *
 * PrerenderSignal publishes `<html data-queries-settled>` from useIsFetching(),
 * which counts TanStack queries and nothing else. A hook that fetches with
 * useState + useEffect is invisible to that count, so the route reports settled
 * while its request is still in flight -- which is how scripts/prerender.mjs
 * captured a skeleton on 2 of 4 builds. The same hooks also cached nothing
 * across navigation and refetched on every mount.
 *
 * These are source assertions rather than behavioural ones because what must
 * not come back is a code path: the next person to write a list hook here has
 * to reach for useQuery.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

/** Hooks that fetch a list or an entity for a rendered route. */
const CONVERTED_HOOKS = [
  'src/hooks/useAttractions.ts',
  'src/hooks/usePlaygrounds.ts',
  'src/hooks/useArticles.ts',
  'src/hooks/useProfile.ts',
  'src/hooks/useRestaurants.ts',
  'src/hooks/useHotels.ts',
];

Deno.test('no converted hook fetches outside TanStack Query', async () => {
  for (const rel of CONVERTED_HOOKS) {
    const src = await read(rel);

    assert(src.includes('useQuery'), `${rel} must fetch through useQuery`);

    // The precise shape that made a route lie to the prerenderer: an effect
    // whose body kicks off the fetch. Mutations may still be plain async
    // functions, which is why this looks for useEffect at all rather than for
    // the word "await".
    assertFalse(
      /useEffect\(\(\) => \{\s*fetch[A-Z]\w*\(\);/.test(src),
      `${rel} still starts a fetch from an effect`,
    );
    assertFalse(
      /const \[state, setState\] = useState</.test(src),
      `${rel} still holds list results in component state`,
    );
  }
});

Deno.test('every list query is keyed from the shared queryKeys factory', async () => {
  // Ad-hoc key arrays are how two hooks end up unable to invalidate each other.
  for (const rel of CONVERTED_HOOKS) {
    const src = await read(rel);
    assert(
      /from ['"]@\/lib\/queryKeys['"]/.test(src),
      `${rel} must key off queryKeys, not a literal array`,
    );
  }
});

Deno.test('mutations invalidate rather than re-running a local fetch', async () => {
  for (const rel of ['src/hooks/useAttractions.ts', 'src/hooks/useRestaurants.ts', 'src/hooks/useHotels.ts']) {
    const src = await read(rel);
    assert(
      src.includes('invalidateQueries'),
      `${rel}: a write must invalidate the cache, or the list it just changed stays stale`,
    );
  }
});

Deno.test('PrerenderSignal still derives its flag from useIsFetching', async () => {
  // If this ever stops being true, the assertions above stop meaning anything.
  const src = await read('src/components/PrerenderSignal.tsx');
  assert(src.includes('useIsFetching'), 'the settled flag must count TanStack queries');
  assert(src.includes('data-queries-settled'), 'and publish it where prerender.mjs reads it');
});

Deno.test('page filters are applied by Postgres, not by the browser', async () => {
  // WEB-PERF-028 AC4. Both pages used to fetch the whole table and filter it in
  // a useMemo, which is also why their filters could not be paginated.
  const attractions = await read('src/pages/Attractions.tsx');
  assertFalse(
    /useAttractions\(\{\}\)/.test(attractions),
    'Attractions.tsx must pass its URL filters to the hook',
  );
  assert(
    /type: selectedType !== "all"/.test(attractions),
    'the type filter belongs in the query',
  );

  const playgrounds = await read('src/pages/Playgrounds.tsx');
  assertFalse(
    /usePlaygrounds\(\)/.test(playgrounds),
    'Playgrounds.tsx must pass its filters to the hook',
  );
  assert(
    /age_range: selectedAgeRange !== "all"/.test(playgrounds),
    'the age-range filter belongs in the query',
  );
});

Deno.test('filter options come from their own query, not from the filtered list', async () => {
  // The trap this pins: derive a dropdown from the list you just filtered and
  // it loses every option that was filtered out, and the "Browse By" counts
  // collapse to the current view.
  const attractionsHook = await read('src/hooks/useAttractions.ts');
  assert(attractionsHook.includes('export function useAttractionTypeCounts'));
  assert(
    /\.select\("type"\)/.test(attractionsHook),
    'the type facet must be a single-column scan, not a second full fetch',
  );

  const playgroundsHook = await read('src/hooks/usePlaygrounds.ts');
  assert(playgroundsHook.includes('export function usePlaygroundFacets'));
  assert(
    /\.select\("age_range,location,amenities"\)/.test(playgroundsHook),
    'one narrow query must answer all three playground facets',
  );

  const attractionsPage = await read('src/pages/Attractions.tsx');
  assertFalse(
    /allAttractions\.filter\(\(a\) => a\.type === type\)/.test(attractionsPage),
    'counts must not be recomputed from the filtered list',
  );
});

Deno.test('the hotels list stops selecting columns it never renders', async () => {
  // WEB-PERF-028 AC3.
  const hook = await read('src/hooks/useHotels.ts');
  assert(hook.includes('HOTEL_LIST_COLUMNS'), 'the list query must use the projection');
  assertFalse(
    /from\("hotels"\)\s*\.select\("\*", \{ count: "exact" \}\)/.test(hook),
    'select("*") must be gone from the list path',
  );

  const cols = await read('src/lib/listColumns.ts');
  const hotels = cols.slice(cols.indexOf('export const HOTEL_LIST_COLUMNS'));
  for (const heavy of ['seo_title', 'seo_description', 'seo_keywords', 'seo_h1', 'geo_summary', 'geo_key_facts', 'geo_faq', 'gallery_urls']) {
    assertFalse(hotels.includes(heavy), `${heavy} does not belong in a list projection`);
  }
});

Deno.test('the attraction projection carries the columns the page reads', async () => {
  // arrangeSponsored() and isSponsoredActive() read these two, and they were
  // missing, so the sponsored boost on /attractions had never once fired.
  const cols = await read('src/lib/listColumns.ts');
  const line = cols.slice(cols.indexOf('export const ATTRACTION_LIST_COLUMNS'), cols.indexOf('export const HOTEL_LIST_COLUMNS'));
  assert(line.includes('is_sponsored'), 'arrangeSponsored reads is_sponsored');
  assert(line.includes('sponsored_until'), 'and sponsored_until');

  const page = await read('src/pages/Attractions.tsx');
  assert(
    page.includes('arrangeSponsored'),
    'the sponsored boost must survive moving the sort to Postgres',
  );
});
