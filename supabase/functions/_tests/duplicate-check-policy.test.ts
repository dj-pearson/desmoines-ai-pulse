/**
 * A duplicate check that fails skips the item; it never inserts (WEB-BE-048).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/duplicate-check-policy.test.ts
 *
 * WHAT THIS IS PROTECTING. ai-crawler's policy on a failed duplicate check was
 * "On error, still add the item to avoid losing data". That check is the only
 * thing between a re-crawl and a duplicate row, so one PostgREST hiccup
 * re-inserted the whole batch. firecrawl-scraper documents the opposite policy
 * and it is the right one: a skip costs one cycle of latency and the next
 * scheduled run re-scrapes the item, while a wrong insert has to be found and
 * cleaned up by hand.
 *
 * And ai-crawler's events branch escaped its ilike pattern while the
 * restaurant/playground/attraction branch did not, so a name carrying a
 * percent or an underscore turned the check into a wildcard match - which,
 * because the check gates the insert, silently drops a real record.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import { sanitizeLikeInput } from '../_shared/validation.ts';

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n').map((l) => l.replace(/(?<!:)\/\/.*$/, '')).join('\n');

/** The duplicate-check body of ai-crawler, comments stripped. */
async function checkBody(): Promise<string> {
  const src = codeOnly(await read('supabase/functions/ai-crawler/index.ts'));
  const from = src.indexOf('async function checkForDuplicates');
  const to = src.indexOf('return { newItems, duplicates', from);
  assert.ok(from >= 0 && to > from, 'checkForDuplicates moved');
  return src.slice(from, to);
}

Deno.test('the wildcard characters that matter are escaped', () => {
  // A stored title already carries a literal percent: "Monday Pop Up Hours and
  // 10% Bourbon". In an ilike that percent matches anything.
  assert.equal(sanitizeLikeInput('10% Bourbon'), '10\\% Bourbon');
  assert.equal(sanitizeLikeInput('a_b'), 'a\\_b');
  assert.equal(sanitizeLikeInput('back\\slash'), 'back\\\\slash');
  // Apostrophes stay: stripping them turned "Chef George's" into "Chef Georges"
  // and MISSED the real duplicate.
  assert.equal(sanitizeLikeInput("Chef George's"), "Chef George's");
});

Deno.test('every ilike in the duplicate check is escaped, not just the events one', async () => {
  const body = await checkBody();
  const ilikes = [...body.matchAll(/\.ilike\(\s*"[^"]+",\s*([^)]+)\)/g)].map((m) => m[1].trim());
  assert.ok(ilikes.length >= 3, `expected the title, venue and name patterns, found ${ilikes.length}`);
  for (const arg of ilikes) {
    assert.ok(
      arg.startsWith('sanitizeLikeInput('),
      `an ilike pattern is unescaped: ${arg}`,
    );
  }
});

Deno.test('a failed duplicate check does not push the item', async () => {
  const body = await checkBody();
  assert.ok(
    !/On error, still add the item/.test(body),
    'the insert-on-error policy is back',
  );
  // Both the returned-error branch and the thrown branch count and skip.
  const pushes = (body.match(/newItems\.push\(/g) || []).length;
  assert.equal(
    pushes,
    1,
    `newItems.push appears ${pushes} times; only the "no existing row" branch may push`,
  );
  const counted = (body.match(/checkErrors\+\+/g) || []).length;
  assert.equal(counted, 2, 'both the error branch and the catch must count a skip');
});

Deno.test('a skipped item is an error, not a duplicate', async () => {
  // Folding it into `duplicates` would make a run where PostgREST was
  // unreachable look like a run where the page had not changed - the exact
  // distinction WEB-BE-043's zero-result rule depends on.
  const src = codeOnly(await read('supabase/functions/ai-crawler/index.ts'));
  assert.match(
    src,
    /errors: insertErrors\.length \+ checkErrors/,
    'the ledger must count a skipped check as an error',
  );
  assert.match(
    src,
    /ctx\.failed\(insertErrors\.length \+ checkErrors\)/,
    'the run must fail-count a skipped check',
  );
  assert.match(src, /skippedAfterCheckError/, 'the response should say how many were skipped');
});

Deno.test('firecrawl-scraper still holds the policy ai-crawler now matches', async () => {
  // The reference implementation. If this one ever flips, the two paths
  // disagree about what a failed check means and the next person has no way to
  // tell which is right.
  const src = codeOnly(await read('supabase/functions/firecrawl-scraper/index.ts'));
  const from = src.indexOf('if (dupCheckError)');
  assert.ok(from >= 0, 'firecrawl no longer branches on a duplicate-check error');
  assert.match(src.slice(from, from + 400), /continue;/, 'firecrawl must skip the item on a failed check');
});

Deno.test('the python crawler applies the same two rules', async () => {
  // It writes to `events` directly with a service-role key, so no edge function
  // and no TypeScript check ever sees its rows.
  const src = await read('crawlers/catchdesmoines_crawler.py');
  assert.match(src, /sanitize_like\(self\._record_title\(event\)\)/, 'the title pattern must be escaped');
  assert.match(src, /sanitize_like\(self\._record_venue\(event\)\)/, 'the venue pattern must be escaped');
  assert.match(
    src,
    /self\.duplicate_check_errors \+= 1\s*\n\s*return True/,
    'a failed check must skip (return True) and be counted',
  );
});
