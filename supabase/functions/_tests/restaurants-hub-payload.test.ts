/**
 * The restaurants hub asks for one page (WEB-PERF-029).
 *
 * get_rotated_restaurants returned `to_jsonb(r)` -- the whole row -- and
 * useRestaurants defaulted to limit 1000, while Restaurants.tsx sliced 30 out
 * of it in the browser. A visitor who looked at the first page paid for every
 * restaurant in the database, each carrying four SEO fields, three GEO fields,
 * an AI prompt audit trail, a tsvector and a PostGIS blob.
 *
 * The WEB-PERF-001/009 projection already existed and already fixed this -- on
 * the FALLBACK query path. The default sort goes through the RPC, so the
 * projection applied to the path almost nobody takes.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const MIGRATION = 'supabase/migrations/20260902000017_rotated_restaurants_projection.sql';

Deno.test('the RPC no longer returns the whole row', async () => {
  const sql = codeOnly(await read(MIGRATION));
  assertFalse(
    /to_jsonb\(r\) AS data/.test(sql),
    'the bare whole-row payload must be gone',
  );
  for (const key of [
    'seo_title', 'seo_description', 'seo_keywords', 'seo_h1',
    'geo_summary', 'geo_key_facts', 'geo_faq',
    'search_vector', 'geom', 'writeup_prompt_used',
  ]) {
    assert(sql.includes(`- '${key}'`), `${key} must be removed from the payload`);
  }
});

Deno.test('it is a deny-list, which is what keeps the mobile clients working', async () => {
  // An allow-list drops any column added later, silently, on the day it is
  // added -- and iOS and Android read this RPC, decoding into models this repo
  // does not control the release cycle of.
  const sql = codeOnly(await read(MIGRATION));
  assert(/to_jsonb\(r\)\s*\n?\s*- 'seo_title'/.test(sql), 'subtract from the whole row');
  assertFalse(/jsonb_build_object/.test(sql), 'do not enumerate the kept columns');
});

Deno.test('the signature and return type are unchanged', async () => {
  // Three shipped clients call this by name with these arguments.
  const sql = await read(MIGRATION);
  assert(/rotation_seed integer DEFAULT 0/.test(sql));
  assert(/limit_count integer DEFAULT 30/.test(sql));
  assert(/offset_count integer DEFAULT 0/.test(sql));
  assert(/RETURNS TABLE \(\s*\n\s*restaurant_data jsonb,\s*\n\s*total_count bigint\s*\n\s*\)/.test(sql));

  for (const rel of [
    'ios/DesMoinesInsider/Services/RestaurantsService.swift',
    'android/app/src/main/java/com/desmoines/aipulse/data/remote/RestaurantsRemoteDataSource.kt',
  ]) {
    const src = await read(rel);
    assert(/get_rotated_restaurants/.test(src), `${rel} calls this RPC`);
  }
});

Deno.test('the page asks for its page', async () => {
  const page = codeOnly(await read('src/pages/Restaurants.tsx'));
  assert(/limit: ITEMS_PER_PAGE, offset: \(page - 1\) \* ITEMS_PER_PAGE/.test(page), 'desktop');
  assert(/limit: page \* ITEMS_PER_PAGE, offset: 0/.test(page), 'mobile load-more');
  // The client-side slice is what the query replaces.
  assertFalse(
    /arrangedRestaurants\.slice\(start, start \+ ITEMS_PER_PAGE\)/.test(page),
    'the browser must not be paginating any more',
  );
});

Deno.test('paid placement survives the smaller page', async () => {
  // arrangeSponsored boosts up to two rows to the top of whatever array it is
  // handed, and that only worked because the array was every restaurant -- a
  // sponsored listing ranked 400th by rotation was still pulled onto page 1.
  // Bounding the fetch without this would quietly have ended that, which is a
  // contract question and not a performance decision.
  const hook = codeOnly(await read('src/hooks/useRestaurants.ts'));
  assert(/sponsoredOnly\?: boolean;/.test(hook), 'the filter must exist');
  assert(/\.eq\("is_sponsored", true\)/.test(hook));
  assert(
    /sponsored_until\.is\.null,sponsored_until\.gt\./.test(hook),
    'active sponsorships only, matching isSponsoredActive',
  );
  // The RPC has no sponsorship parameter, so this filter has to force the
  // legacy path rather than change a signature three clients call.
  assert(/!filters\.sponsoredOnly &&/.test(hook));

  const page = codeOnly(await read('src/pages/Restaurants.tsx'));
  assert(/sponsoredOnly: true, limit: SPONSORED_CAP/.test(page));
  assert(/page !== 1 \|\| sponsoredRestaurants\.length === 0/.test(page), 'first page only');
  // A sponsored restaurant also present in this page's rotation must appear
  // once, at the top, not twice.
  assert(/boostedIds\.has\(r\.id\)/.test(page), 'de-duplicated');
});

Deno.test('every visible count reads the total, not the page', async () => {
  // The query returns 30 rows out of 480. Counting the array would say
  // "Showing 1-30 of 30" and announce "Found 30 restaurants" to a screen
  // reader while the header said 480.
  const page = codeOnly(await read('src/pages/Restaurants.tsx'));
  assert(/const totalPages = Math\.ceil\(\(totalCount \|\| 0\) \/ ITEMS_PER_PAGE\)/.test(page));
  assert(/page \* ITEMS_PER_PAGE < \(totalCount \|\| 0\)/.test(page), 'load-more bound');
  assert(/const count = totalCount \|\| 0;/.test(page), 'the screen-reader announcement');
  assertFalse(
    /of \$\{restaurants\.length\} restaurants/.test(page),
    'the results line must not count the fetched array',
  );
});
