#!/usr/bin/env node
/**
 * WEB-SEO-038: the index's lastmod values have to mean something.
 *
 *   npx tsx scripts/__tests__/sitemap-index.test.mjs
 *
 * The generator stamped the build date on all nine children every build. That
 * is not a small cosmetic lie: lastmod in an index is the field a crawler uses
 * to decide whether to refetch a child, so "everything changed today, every
 * day" is indistinguishable from "trust nothing here" - and the pSEO child
 * alone is ~900 URLs to refetch on a false signal.
 */
import assert from 'node:assert/strict';
import { newestLastmodIn, renderSitemapIndex, SITEMAP_CHILDREN } from '../lib/sitemapIndex.ts';

const BUILD_DATE = '2026-09-10';

function child(...dates) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${dates
  .map((d) => `  <url><loc>https://x/y</loc><lastmod>${d}</lastmod></url>`)
  .join('\n')}
</urlset>`;
}

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
  }
}

console.log('[sitemap-index] WEB-SEO-038');

check('takes the newest entry, not the first or last in document order', () => {
  assert.equal(
    newestLastmodIn(child('2026-01-04', '2026-08-31', '2026-03-16'), BUILD_DATE),
    '2026-08-31',
  );
});

check('does not move just because the build ran', () => {
  const xml = child('2026-03-16');
  assert.equal(newestLastmodIn(xml, BUILD_DATE), '2026-03-16');
  assert.notEqual(newestLastmodIn(xml, BUILD_DATE), BUILD_DATE);
});

check('falls back to the build date only when there is no usable stamp', () => {
  assert.equal(newestLastmodIn('<urlset></urlset>', BUILD_DATE), BUILD_DATE);
  assert.equal(newestLastmodIn(child(''), BUILD_DATE), BUILD_DATE);
  assert.equal(newestLastmodIn(child('not-a-date'), BUILD_DATE), BUILD_DATE);
});

check('handles a full timestamp, keeping lexicographic order valid', () => {
  assert.equal(
    newestLastmodIn(child('2026-08-31T10:00:00Z', '2026-09-01'), BUILD_DATE),
    '2026-09-01',
  );
});

check('renders only the children it is given', () => {
  const xml = renderSitemapIndex(
    'https://desmoinesinsider.com',
    ['sitemap-events.xml', 'sitemap-pseo.xml'],
    () => '2026-08-31',
  );
  assert.match(xml, /<sitemapindex/);
  assert.equal((xml.match(/<sitemap>/g) || []).length, 2);
  assert.ok(!xml.includes('sitemap-hotels.xml'), 'listed a child it was not given');
});

check('every child name is a sitemap file name', () => {
  for (const name of SITEMAP_CHILDREN) {
    assert.match(name, /^sitemap-[a-z]+\.xml$/, name);
  }
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`\nOK ${SITEMAP_CHILDREN.length} children modelled; lastmod reflects the data, not the clock.`);
