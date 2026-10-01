/**
 * Detail-route handling in the Pages middleware (WEB-SEO-020, WEB-SEO-030).
 *
 * Two defects in one branch.
 *
 * WEB-SEO-020: on /events|restaurants|attractions|articles/<slug> the middleware
 * matched a CRAWLER_UA list, fetched "/" from ASSETS, rewrote og:* onto the
 * homepage body and removed EVERY ld+json block. So the better a page had been
 * prerendered, the more that branch destroyed -- and the list included
 * Google-InspectionTool and GoogleOther, meaning URL Inspection was shown
 * something no user ever saw.
 *
 * WEB-SEO-030: every un-prerendered entity URL answered 200 with a
 * self-canonical. Under public/_routes.json's include ["/*"], that made a dead
 * slug and a real page that missed the build budget byte-identical to a
 * crawler, and roughly 860 of them indexable duplicates of the homepage.
 *
 * The status decision is a pure function so the three cases can be asserted
 * without a Pages runtime; the rest is asserted against the source, because
 * what must not come back is a code path.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '../_middleware.ts'), 'utf8');

const { detailShellStatus, isHomepageShell, resolveEntity, resolveEntityCached, detailResponsePlan } = await import('../_middleware.ts');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}

console.log('\nmiddleware detail status (WEB-SEO-020 / WEB-SEO-030)\n');

const NOW = new Date('2026-09-02T12:00:00Z');

test('a resolved slug keeps its 200 and stays indexable', () => {
  const v = detailShellStatus('event', 'some-show-2026-10-04', true, NOW);
  assert.equal(v.status, 200);
  assert.equal(v.noindex, false);
});

test('a dead slug is a 404, not a 200 duplicate of the homepage', () => {
  for (const type of ['restaurant', 'attraction', 'article', 'playground', 'hotel']) {
    const v = detailShellStatus(type, 'no-such-thing', false, NOW);
    assert.equal(v.status, 404, `${type} should 404`);
    assert.equal(v.noindex, true, `${type} should be noindex`);
  }
});

test('an event that finished more than 30 days ago is 410 Gone', () => {
  // The slug carries its own date, which is the only date available once the
  // row cannot be found.
  const v = detailShellStatus('event', 'rodney-carrington-2025-11-05', false, NOW);
  assert.equal(v.status, 410);
  assert.equal(v.noindex, true);
  assert.equal(v.reason, 'event-long-past');
});

test('a recently finished or upcoming event is 404, not 410', () => {
  // Inside the window a missing row is more likely a slug or ingest problem
  // than a page that is permanently gone, and 410 is not reversible in a
  // crawler's mind the way a 404 is.
  const recent = detailShellStatus('event', 'last-week-show-2026-08-30', false, NOW);
  assert.equal(recent.status, 404);

  const future = detailShellStatus('event', 'next-month-show-2026-10-30', false, NOW);
  assert.equal(future.status, 404);
});

test('an event slug with no date suffix falls back to 404', () => {
  const v = detailShellStatus('event', 'no-date-here', false, NOW);
  assert.equal(v.status, 404);
});

test('a prerendered page is not the homepage shell, so it passes through', () => {
  const origin = 'https://desmoinesinsider.com';
  const prerendered = `<html><head><link rel="canonical" href="${origin}/events/a-show-2026-10-04"></head></html>`;
  assert.equal(isHomepageShell(prerendered, origin), false);

  const shell = `<html><head><link rel="canonical" href="${origin}/"></head></html>`;
  assert.equal(isHomepageShell(shell, origin), true);
});

test('the middleware returns a non-shell response untouched', () => {
  assert.match(
    SRC,
    /if \(!isHomepageShell\(html, url\.origin\)\) return passthrough\(\);/,
    'a prerendered page must be returned before anything rewrites it',
  );
  // The old branch fetched the homepage for every crawler on a detail route.
  assert.doesNotMatch(
    SRC,
    /ASSETS\.fetch\(new URL\("\/"/,
    'nothing may fetch the homepage to answer a detail URL any more',
  );
});

test('no user-agent list decides what a requester is shown', () => {
  assert.doesNotMatch(SRC, /Google-InspectionTool|GoogleOther/, 'inspection tools must see what users see');
  assert.doesNotMatch(SRC, /function isCrawler/, 'the UA branch is gone entirely');
  assert.doesNotMatch(SRC, /const CRAWLER_UA =/, 'and so is its regex');
});

test('the fallback path replaces the homepage JSON-LD with the entity node, never strips without replacing', () => {
  // The BEHAVIOUR is proved in middleware-entity-shell.test.mjs, which runs
  // these rules through lol-html and reads the document that comes out
  // ("exactly one ld+json block remains"). What is worth asserting from the
  // source is the structural invariant.
  //
  // This test used to say "never stripped". That protected against an older
  // branch that removed every block and put nothing back. The shell's blocks
  // are the HOMEPAGE's (FAQPage, LocalBusiness, ItemLists), so at an entity URL
  // they are claims about the wrong page; they are now removed, and the only
  // acceptable removal is one paired with the entity's own node.
  assert.match(SRC, /\{ selector: "head", appendHtml: jsonLdScript\(node\) \}/, 'the entity gets its own node');
  //
  // COMMENTS STRIPPED BEFORE MATCHING. The slice runs to `function
  // entityShell(`, and that declaration's doc comment - which sits before it -
  // recounts the old branch that "removed every ld+json block". A check that
  // fires on the sentence explaining it is a trap this repo has now walked into
  // eleven times.
  const rules = SRC.slice(
    SRC.indexOf('export function entityShellRewrites('),
    SRC.indexOf('function entityShell('),
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const removals = [...rules.matchAll(/remove: true/g)].length;
  assert.equal(removals, 1, 'exactly one removal rule on the entity path');
  assert.match(
    rules,
    /\{ selector: 'script\[type="application\/ld\+json"\]', remove: true \}/,
    'and it removes only ld+json, not every script',
  );
});

test('og:type follows the segment instead of collapsing to website', () => {
  assert.match(SRC, /const OG_TYPE: Record<string, string> = \{ event: "article", article: "article" \}/);
  assert.doesNotMatch(
    SRC,
    /new AttrSetter\("content", type === "article" \? "article" : "website"\)/,
    'the old collapse-to-website rule must be gone',
  );
});

test('playgrounds and /stay are handled at all', () => {
  assert.match(SRC, /playgrounds: "playground"/);
  assert.match(SRC, /stay: "hotel"/);
  // A segment in the map is now a segment the 404 gate applies to, so each one
  // needs a resolver or every URL under it would 404.
  assert.match(SRC, /if \(type === "playground"\)/, 'playgrounds need a resolver');
  assert.match(SRC, /if \(type === "hotel"\)/, 'so does /stay');
});

test('slug lookups are cached at the edge, including misses', () => {
  assert.match(SRC, /async function resolveEntityCached\(/);
  assert.match(SRC, /caches\?\.default/);
  // A crawler working through dead slugs is exactly the traffic worth
  // absorbing, so a null result is cached too.
  assert.match(SRC, /JSON\.stringify\(entity \?\? \{\}\)/, 'misses must be cached as well');
  assert.match(SRC, /max-age=300/);
});

// ---------------------------------------------------------------------------
// Outage, merged and id-addressed restaurants (eat-drink pass 2 WP5.3, WP5.4).
// resolveEntity runs against a fake PostgREST: global fetch is swapped for a
// router over the query string, so the real request shapes are exercised.
// ---------------------------------------------------------------------------

async function atest(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}

const SB = 'https://proj.supabase.co';
const ORIGIN = 'https://desmoinesinsider.com';
const realFetch = globalThis.fetch;
/** Answers /rest/v1/* from `route(pathAndQuery)`: an array is 200 rows, a number is that status. */
function fakePostgrest(route) {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    const pq = decodeURIComponent(url.slice(`${SB}/rest/v1/`.length));
    calls.push(pq);
    const answer = route(pq);
    if (typeof answer === 'number') return new Response('{"message":"boom"}', { status: answer });
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

console.log('\nrestaurant lookups against a fake PostgREST\n');

await atest('a PostgREST 500 is an error, not a miss', async () => {
  fakePostgrest(() => 500);
  const outcome = await resolveEntity(SB, 'anon', 'restaurant', 'fongs-pizza');
  assert.equal(outcome.kind, 'error');
});

await atest('an error plans a 200 with no-store, not a 404', async () => {
  const plan = detailResponsePlan({ kind: 'error' }, 'restaurant', 'fongs-pizza', ORIGIN, NOW);
  assert.equal(plan.action, 'unavailable');
  assert.equal(plan.status, 200);
  assert.equal(plan.cacheControl, 'no-store');
});

await atest('a real miss still plans a 404', async () => {
  fakePostgrest(() => []);
  const outcome = await resolveEntity(SB, 'anon', 'restaurant', 'no-such-place');
  assert.equal(outcome.kind, 'not-found');
  const plan = detailResponsePlan(outcome, 'restaurant', 'no-such-place', ORIGIN, NOW);
  assert.equal(plan.action, 'missing');
  assert.equal(plan.status, 404);
});

await atest('an error is not written to the edge cache; a miss is', async () => {
  const puts = [];
  const prevCaches = globalThis.caches;
  globalThis.caches = { default: { match: async () => undefined, put: async (k) => { puts.push(String(k.url)); } } };
  const ctx = { waitUntil: (p) => p };
  try {
    fakePostgrest(() => 500);
    const failed = await resolveEntityCached(ctx, SB, 'anon', 'restaurant', 'down-now');
    assert.equal(failed.kind, 'error');
    assert.equal(puts.length, 0, 'a failed lookup must not be cached');

    fakePostgrest(() => []);
    const missing = await resolveEntityCached(ctx, SB, 'anon', 'restaurant', 'gone');
    assert.equal(missing.kind, 'not-found');
    assert.equal(puts.length, 1, 'a real miss is still cached');
  } finally {
    globalThis.caches = prevCaches;
  }
});

await atest('the rich select failing alone falls back to the minimal one', async () => {
  // A 42703 on a shell column must not turn a real page into an outage.
  fakePostgrest((pq) => (pq.includes('is_merged') ? 400 : [{ id: 'r1', name: 'Fong\'s', description: 'Pizza' }]));
  const outcome = await resolveEntity(SB, 'anon', 'restaurant', 'fongs-pizza');
  assert.equal(outcome.kind, 'row');
  assert.equal(outcome.entity.row, undefined);
});

await atest('a merged row with a live survivor plans a 301 to the survivor slug', async () => {
  const SURVIVOR = '11111111-2222-3333-4444-555555555555';
  fakePostgrest((pq) => {
    if (pq.startsWith('restaurants?slug=eq.old-dup')) {
      return [{ id: 'dup', name: 'Old Dup', slug: 'old-dup', status: 'open', is_merged: true, merged_into: SURVIVOR }];
    }
    if (pq.startsWith(`restaurants?id=eq.${SURVIVOR}`)) return [{ id: SURVIVOR, slug: 'the-survivor', is_merged: false, merged_into: null }];
    return [];
  });
  const outcome = await resolveEntity(SB, 'anon', 'restaurant', 'old-dup');
  const plan = detailResponsePlan(outcome, 'restaurant', 'old-dup', ORIGIN, NOW);
  assert.equal(plan.action, 'redirect');
  assert.equal(plan.status, 301);
  assert.equal(plan.location, `${ORIGIN}/restaurants/the-survivor`);
});

await atest('a merged row whose survivor is gone is served, not redirected', async () => {
  fakePostgrest((pq) => (pq.startsWith('restaurants?slug=eq.orphan')
    ? [{ id: 'o', name: 'Orphan', slug: 'orphan', is_merged: true, merged_into: 'nowhere' }]
    : []));
  const outcome = await resolveEntity(SB, 'anon', 'restaurant', 'orphan');
  assert.equal(detailResponsePlan(outcome, 'restaurant', 'orphan', ORIGIN, NOW).action, 'shell');
});

await atest('two rows merged into each other do not loop', async () => {
  fakePostgrest((pq) => {
    if (pq.includes('slug=eq.a')) return [{ id: 'A', name: 'A', slug: 'a', is_merged: true, merged_into: 'b' }];
    if (pq.includes('slug=eq.b')) return [{ id: 'B', slug: 'b', is_merged: true, merged_into: 'a' }];
    return [];
  });
  const outcome = await resolveEntity(SB, 'anon', 'restaurant', 'a');
  assert.equal(outcome.kind, 'row');
  assert.equal(outcome.entity.redirectTo, undefined);
});

await atest('a uuid-shaped slug is looked up by id and 301s to the slug', async () => {
  const ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const calls = fakePostgrest((pq) => (pq.startsWith(`restaurants?id=eq.${ID}`)
    ? [{ id: ID, name: 'Noce', slug: 'noce', status: 'open', is_merged: false }]
    : []));
  const outcome = await resolveEntity(SB, 'anon', 'restaurant', ID);
  const plan = detailResponsePlan(outcome, 'restaurant', ID, ORIGIN, NOW);
  assert.ok(calls[0].startsWith(`restaurants?slug=eq.${ID}`), 'the slug is tried first');
  assert.equal(plan.action, 'redirect');
  assert.equal(plan.location, `${ORIGIN}/restaurants/noce`);
});

await atest('a closed row resolves to a shell (its noindex is in the shell rules)', async () => {
  fakePostgrest(() => [{ id: 'c', name: 'Closed Co', slug: 'closed-co', status: 'closed', is_merged: false }]);
  const outcome = await resolveEntity(SB, 'anon', 'restaurant', 'closed-co');
  assert.equal(detailResponsePlan(outcome, 'restaurant', 'closed-co', ORIGIN, NOW).action, 'shell');
});

globalThis.fetch = realFetch;

test('the handler serves the unavailable plan uncached and self-canonical', () => {
  assert.match(SRC, /if \(plan\.action === "unavailable"\)/);
  assert.match(SRC, /withSelfCanonical\(passthrough\(\), pageUrl\)/);
  assert.match(SRC, /headers\.set\("Cache-Control", plan\.cacheControl\)/);
});

if (failures) {
  console.error(`\n${failures} failure(s)\n`);
  process.exit(1);
}
console.log('\nAll detail-status checks passed.\n');
