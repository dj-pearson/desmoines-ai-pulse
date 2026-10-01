#!/usr/bin/env node
/**
 * Offline checks for the /rss.xml renderer (SEO-031).
 *
 *   npx tsx scripts/__tests__/rss-feed.test.mjs
 *
 * The file it replaces had ISO 8601 pubDates, which RSS 2.0 does not accept,
 * and had not been rebuilt for fourteen months. These pin the date format, the
 * escaping and the event URL shape.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { articleItem, eventItem, renderRss, rfc822, xmlEscape } = await import('../lib/rssFeed.ts');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://desmoinesinsider.com';

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

const RFC822 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

test('dates are RFC 822, not ISO 8601', () => {
  assert.equal(rfc822(new Date('2026-10-01T04:04:24Z')), 'Thu, 01 Oct 2026 04:04:24 GMT');
});

test('an article links by slug and dates by published_at', () => {
  const item = articleItem(
    { id: 'a1', slug: 'corn-mazes-near-des-moines', title: 'Corn Mazes', excerpt: "Pumpkinville's maze", category: 'Attractions', published_at: '2026-10-01T04:04:24Z', created_at: '2026-09-01T00:00:00Z' },
    BASE,
  );
  assert.equal(item.link, `${BASE}/articles/corn-mazes-near-des-moines`);
  assert.equal(item.pubDate, 'Thu, 01 Oct 2026 04:04:24 GMT');
});

test('an event URL carries the Central date, and pubDate is when it was listed', () => {
  // 7 PM Central on Oct 2 is Oct 3 in UTC; the slug must say the 2nd.
  const item = eventItem(
    { id: 'e1', title: 'Alysha Brilla: Live at the Temple', date: '2026-10-03T00:00:00Z', event_start_utc: '2026-10-03T00:00:00Z', venue: 'Temple Theater', category: 'Music', seo_description: null, geo_summary: null, original_description: 'Live **performance**', created_at: '2026-09-30T12:18:22Z' },
    BASE,
  );
  assert.equal(item.link, `${BASE}/events/alysha-brilla-live-at-the-temple-2026-10-02`);
  assert.equal(item.pubDate, 'Wed, 30 Sep 2026 12:18:22 GMT');
  assert.match(item.description, /^Fri, Oct 2, 7:00 PM at Temple Theater\. Live performance$/);
});

test('rows with no title or no date are dropped, not emitted half-empty', () => {
  assert.equal(articleItem({ id: 'x', slug: null, title: ' ', excerpt: null, category: null, published_at: '2026-01-01', created_at: null }, BASE), null);
  assert.equal(eventItem({ id: 'x', title: 'A', date: null, event_start_utc: null, venue: null, category: null, seo_description: null, geo_summary: null, original_description: null, created_at: null }, BASE), null);
});

test('text is escaped and control characters removed', () => {
  assert.equal(xmlEscape('Fish & Chips <b>"x"</b>\u0001'), 'Fish &amp; Chips &lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

test('the channel is newest first and every pubDate is RFC 822', () => {
  const xml = renderRss(
    { baseUrl: BASE, title: 'Des Moines Insider', description: 'd', buildDate: new Date('2026-10-01T00:00:00Z') },
    [
      { title: 'old', link: `${BASE}/a`, description: '', category: 'c', pubDate: rfc822(new Date('2026-01-01Z')), sortAt: 1 },
      { title: 'new', link: `${BASE}/b`, description: '', category: 'c', pubDate: rfc822(new Date('2026-02-01Z')), sortAt: 2 },
    ],
  );
  assert.ok(xml.indexOf('<title>new</title>') < xml.indexOf('<title>old</title>'));
  for (const [, d] of xml.matchAll(/<(?:pubDate|lastBuildDate)>([^<]*)</g)) assert.match(d, RFC822);
  assert.match(xml, /<atom:link href="https:\/\/desmoinesinsider.com\/rss.xml" rel="self" type="application\/rss\+xml"\/>/);
});

test('index.html advertises the feed, and the build regenerates it', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<link rel="alternate" type="application\/rss\+xml"[^>]*href="\/rss.xml"/);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /generate-rss/);
});

if (failures > 0) {
  console.error(`\n${failures} rss check(s) failed.`);
  process.exit(1);
}
console.log('\nAll rss checks passed.');
