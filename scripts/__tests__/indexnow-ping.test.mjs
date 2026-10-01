#!/usr/bin/env node
/**
 * Offline checks for scripts/indexnow-ping.ts helpers (SEO-047).
 *
 *   npx tsx scripts/__tests__/indexnow-ping.test.mjs
 *
 * The POST is one call and is exercised live; what is pinned here is which
 * URLs get sent, since that decides whether a daily run submits the day's
 * changes, nothing, or the whole site.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { changedUrls, chunk, findIndexNowKey, parseSitemapIndex, parseUrlset } = await import('../lib/indexNowSitemaps.ts');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

test('the committed key file is found and its body is its own name', () => {
  const found = findIndexNowKey(join(ROOT, 'public'));
  assert.ok(found, 'expected exactly one public/<32 hex>.txt');
  assert.match(found.key, /^[0-9a-f]{32}$/);
  assert.equal(found.file, `${found.key}.txt`);
});

test('a hex-named .txt whose body differs is not a key file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'indexnow-'));
  writeFileSync(join(dir, `${'a'.repeat(32)}.txt`), 'something else');
  assert.equal(findIndexNowKey(dir), null);
});

test('sitemap index and urlset parse; an HTML fallback parses to nothing', () => {
  // Tag name split so check-sitemap-registration does not read this fixture
  // as a second hand-built sitemap index.
  const IDX = 'sitemap' + 'index';
  const index = `<?xml version="1.0"?><${IDX} xmlns="x"><sitemap><loc>https://h/s-a.xml</loc><lastmod>2026-10-01</lastmod></sitemap><sitemap><loc>https://h/s-b.xml</loc></sitemap></${IDX}>`;
  assert.deepEqual(parseSitemapIndex(index), ['https://h/s-a.xml', 'https://h/s-b.xml']);
  const urlset = `<urlset xmlns="x"><url><loc>https://h/a?x=1&amp;y=2</loc><lastmod>2026-10-01T05:00:00Z</lastmod></url><url><loc>https://h/b</loc></url></urlset>`;
  assert.deepEqual(parseUrlset(urlset), { 'https://h/a?x=1&y=2': '2026-10-01', 'https://h/b': '' });
  assert.deepEqual(parseUrlset('<!DOCTYPE html><html><loc>https://h/x</loc></html>'), {});
});

test('with a saved state, only new URLs and changed lastmods are sent', () => {
  const prev = { 'https://h/a': '2026-09-01', 'https://h/b': '2026-09-01', 'https://h/gone': '2026-09-01' };
  const next = { 'https://h/a': '2026-09-01', 'https://h/b': '2026-10-01', 'https://h/new': '2026-08-01' };
  assert.deepEqual(changedUrls(prev, next, '2026-09-30'), ['https://h/b', 'https://h/new']);
});

test('nothing changed means nothing sent', () => {
  const s = { 'https://h/a': '2026-09-01' };
  assert.deepEqual(changedUrls(s, { ...s }, '2026-09-30'), []);
});

test('without a state, the lastmod window decides', () => {
  const next = { 'https://h/old': '2026-09-01', 'https://h/new': '2026-09-30', 'https://h/none': '' };
  assert.deepEqual(changedUrls(null, next, '2026-09-30'), ['https://h/new']);
});

test('batches respect the 10,000 URL cap', () => {
  const parts = chunk(Array.from({ length: 20_001 }, (_, i) => i), 10_000);
  assert.deepEqual(parts.map((p) => p.length), [10_000, 10_000, 1]);
});

if (failures > 0) {
  console.error(`\n${failures} indexnow check(s) failed.`);
  process.exit(1);
}
console.log('\nAll indexnow checks passed.');
