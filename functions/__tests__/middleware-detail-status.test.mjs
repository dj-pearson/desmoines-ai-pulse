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

const { detailShellStatus, isHomepageShell } = await import('../_middleware.ts');

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

test('JSON-LD is injected, never stripped, on the fallback path', () => {
  assert.match(SRC, /class JsonLdInjector/, 'the entity gets its own node');
  assert.match(SRC, /\.on\("head", new JsonLdInjector\(node\)\)/);
  // withSelfCanonical still removes the homepage's blocks on NON-detail shells,
  // which is correct; what must not happen is stripping on a detail page.
  const entityShell = SRC.slice(SRC.indexOf('function entityShell('), SRC.indexOf('class JsonLdInjector'));
  assert.doesNotMatch(entityShell, /new Remover\(\)/, 'the entity path must not strip ld+json');
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

if (failures) {
  console.error(`\n${failures} failure(s)\n`);
  process.exit(1);
}
console.log('\nAll detail-status checks passed.\n');
