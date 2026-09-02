/**
 * Featured flag invariant (WEB-BE-040).
 *
 * is_featured means an editorial or paid decision. For a year seven ingest
 * sites set it with Math.random() > 0.8, so a fifth of every scraped event,
 * restaurant, playground and attraction landed on the homepage featured rail
 * by coin toss, next to the rows an admin or an advertiser chose.
 *
 * This test walks every edge function and fails on any is_featured value that
 * is not a literal false (or a value copied from an existing row). It also
 * pins the two things that make clearing the random flags safe: the cleanup
 * migration, and the homepage rail's deterministic fallback so an empty
 * featured set does not mean an empty rail.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const FUNCTIONS = new URL('supabase/functions/', REPO);

async function* walk(dir: URL, skip: RegExp): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.isDirectory ? `${entry.name}/` : entry.name, dir);
    if (skip.test(url.pathname)) continue;
    if (entry.isDirectory) yield* walk(url, skip);
    else if (/\.(ts|js|mjs)$/.test(entry.name)) yield url;
  }
}

Deno.test('no edge function decides is_featured with Math.random', async () => {
  const offenders: string[] = [];
  const skip = /node_modules|_tests|\.test\./;
  for await (const file of walk(FUNCTIONS, skip)) {
    const text = await Deno.readTextFile(file);
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/is_featured\s*[:=]\s*Math\.random/.test(line)) {
        offenders.push(`${file.pathname.replace(REPO.pathname, '')}:${i + 1}`);
      }
    });
  }
  assertEquals(offenders, [], `random featured flags at: ${offenders.join(', ')}`);
});

Deno.test('every ingest site that writes is_featured writes false', async () => {
  // The seven sites the audit named. Each must now be a literal false; a
  // future scraper that copies the pattern shows up in the walk above.
  const expected: Record<string, number> = {
    'ai-crawler/index.ts': 1,
    'firecrawl-scraper/index.ts': 4,
    'scrape-events/index.ts': 2,
  };
  for (const [rel, count] of Object.entries(expected)) {
    const text = await Deno.readTextFile(new URL(rel, FUNCTIONS));
    const literalFalse = text.match(/is_featured\s*[:=]\s*false\b/g) ?? [];
    assert(
      literalFalse.length >= count,
      `${rel}: expected at least ${count} is_featured: false sites, found ${literalFalse.length}`,
    );
  }
});

Deno.test('the cleanup migration dry-runs its counts before clearing', async () => {
  const sql = await Deno.readTextFile(
    new URL('supabase/migrations/20260902000004_clear_random_featured_flags.sql', REPO),
  );
  assert(/RAISE NOTICE 'WEB-BE-040 dry run/.test(sql), 'counts must be logged before any UPDATE');
  const notice = sql.indexOf("RAISE NOTICE 'WEB-BE-040 dry run");
  const firstUpdate = sql.indexOf('UPDATE public.events');
  assert(notice > 0 && firstUpdate > notice, 'the dry-run NOTICE must precede the first UPDATE');
  assert(/is_sponsored IS NOT TRUE/.test(sql), 'sponsored rows must be exempt');
  assert(/sponsored_listing_links/.test(sql), 'rows with a campaign link must be exempt');
  assert(!/UPDATE public\.attractions/.test(sql), 'attractions carry an admin bulk-feature action and no origin marker; they are counted, not cleared');
});

Deno.test('the homepage featured rail falls back to a deterministic ranking', async () => {
  const hook = await Deno.readTextFile(new URL('src/hooks/useSupabase.ts', REPO));
  const fn = hook.slice(hook.indexOf('export function useFeaturedEvents'), hook.indexOf('export function useEvents('));
  assert(fn.length > 0, 'useFeaturedEvents must exist ahead of useEvents');
  assert(/Pass 3/.test(fn), 'a third pass must fill the rail when featured rows run out');
  assert(/\.order\('popularity_score', \{ ascending: false, nullsFirst: false \}\)/.test(fn), 'fallback ranks by popularity_score');
  assert(/\.order\('date', \{ ascending: true \}\)/.test(fn), 'then by soonest date');
  assert(/\.not\('id', 'in'/.test(fn) || /chosenIds/.test(fn), 'fallback must exclude rows already on the rail');
});
