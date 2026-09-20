/**
 * Domain adapters ask robots.txt and declare one identity (WEB-SEC-024 AC6).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/adapter-robots.test.ts
 *
 * scrapeUrl() checks robots.txt at the top, deliberately above the backend
 * fallback chain so nothing can route around it. The adapters routed around it
 * anyway, by not calling scrapeUrl: each held its own globalThis.fetch and its
 * own pasted Chrome/120 User-Agent. So the paths doing the most crawling were
 * the ones asking no permission - and SCRAPER_USER_AGENT, the variable AC3's
 * whole decision turns on, reached none of them.
 *
 * THE AC NAMED TWO ADAPTERS AND THERE WERE SIX. That is what this test exists
 * to stop recurring: a seventh adapter written the same way is invisible in
 * review, because each file looks self-consistent.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const DIR = 'supabase/functions/_shared/domain-adapters/';

const read = async (name: string) =>
  await Deno.readTextFile(new URL(`${DIR}${name}.ts`, REPO));

/** An adapter NAMED in prose must not count as one that fetches. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*/g, (m, p) => p + ' '.repeat(m.length - p.length));

/** Adapters that crawl a third party's PAGES. robots.txt governs these. */
const HTML_ADAPTERS = [
  'catchdesmoines',
  'eventbrite',
  'barnstormers',
  'hyveetix',
  'tribeEvents',
  'vibrantmusichall',
];

/**
 * Adapters that call a documented JSON API the publisher offers for the
 * purpose. robots.txt governs crawling a site's pages, not calling its API,
 * and neither of these pretends to be a browser.
 */
const API_ADAPTERS = ['milb', 'seatgeek'];

for (const name of HTML_ADAPTERS) {
  Deno.test(`${name} fetches through fetchAllowed, not raw`, async () => {
    const src = stripComments(await read(name));
    assert(/fetchAllowed\(/.test(src), `${name} must fetch through the robots-checked helper`);

    const raw = (src.match(/globalThis\.fetch\(|[^.\w]await fetch\(/g) ?? []).length;
    // hyveetix keeps exactly one raw fetch: the POST to browserless.io, which
    // is a call to our own scraping vendor rather than to the crawled site.
    const allowed = name === 'hyveetix' ? 1 : 0;
    assertEquals(
      raw,
      allowed,
      `${name} has ${raw} raw fetch(es); only ${allowed} is accounted for`,
    );
  });

  Deno.test(`${name} declares no User-Agent of its own`, async () => {
    const src = stripComments(await read(name));
    assertFalse(
      /Mozilla\/5\.0/.test(src),
      `${name} pastes a browser User-Agent; adapterHeaders() owns it so ` +
        'SCRAPER_USER_AGENT reaches every adapter at once',
    );
  });
}

for (const name of API_ADAPTERS) {
  Deno.test(`${name} is an API client and sends no browser User-Agent`, async () => {
    const src = stripComments(await read(name));
    assertFalse(/Mozilla\/5\.0/.test(src));
  });
}

Deno.test('the helper checks robots before fetching, and fails open', async () => {
  const src = stripComments(await read('adapterFetch'));
  assert(/isCrawlAllowed\(url, config\.userAgent \|\| "\*"\)/.test(src));
  // The escape hatch must be the same one scrapeUrl honours, not a second flag.
  assert(/SCRAPER_IGNORE_ROBOTS/.test(src));
  // A Disallow returns null; it must not throw, because two adapters fetch
  // outside a try and a throw there aborts the whole ingestion run.
  assert(/return null;/.test(src));
  assertFalse(/throw new/.test(src), 'a blocked fetch must not throw');
});

Deno.test('the helper takes its User-Agent from the shared scraper config', async () => {
  const src = stripComments(await read('adapterFetch'));
  assert(
    /getScraperConfig\(\)\.userAgent/.test(src),
    'one source for the UA, so AC3 is a one-line change when it is decided',
  );
  assertFalse(/Mozilla\/5\.0/.test(src), 'the default lives in getScraperConfig, not here');
});
