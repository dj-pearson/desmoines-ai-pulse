#!/usr/bin/env node
/**
 * The sitemap index's lastmod rule (WEB-SEO-038 AC3).
 *
 *   npx tsx scripts/__tests__/sitemap-lastmod.test.mjs
 *
 * The index used to stamp today's date on all fourteen children on every
 * build, so it told a crawler that every sitemap had changed every day -
 * including sitemap-static.xml, a committed file that changes a few times a
 * year.
 *
 * That is not a small inaccuracy. Google's stated behaviour is to stop
 * trusting a lastmod it finds unreliable rather than to re-crawl on it, so the
 * one field in the index that can earn a faster re-crawl was spending its
 * credibility on days when nothing had changed.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { maxLastmod, childLastmod } = await import('../lib/sitemapLastmod.ts');

let failures = 0;
function check(label, ok, actual) {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${actual === undefined ? '' : ` (got ${JSON.stringify(actual)})`}`);
  }
}

const xml = (dates) =>
  `<?xml version="1.0"?><urlset>${dates
    .map((d) => `<url><loc>https://x/y</loc><lastmod>${d}</lastmod></url>`)
    .join('')}</urlset>`;

console.log('maxLastmod');
{
  // Deliberately unsorted: the events sitemap is ordered by date ascending and
  // the articles one by title, so neither position is the answer.
  const got = maxLastmod(xml(['2026-03-01', '2026-09-14', '2026-07-30']), '2026-01-01');
  check('takes the most recent entry, not the first or the last', got === '2026-09-14', got);
}
{
  // A hub-only sitemap, written because a table came back empty.
  const got = maxLastmod('<urlset></urlset>', '2026-09-19');
  check('falls back when there are no entries', got === '2026-09-19', got);
}
{
  const got = maxLastmod('<urlset><lastmod> 2026-05-05 </lastmod></urlset>', 'x');
  check('ignores whitespace around a stamp', got === '2026-05-05', got);
}
{
  // The point of the change: an unchanged sitemap keeps its old date rather
  // than being restamped with today's.
  const got = maxLastmod(xml(['2026-02-02']), '2026-09-19');
  check('does not restamp an older sitemap with the fallback', got === '2026-02-02', got);
}

console.log('\nchildLastmod');
{
  const dir = mkdtempSync(join(tmpdir(), 'sitemap-lastmod-'));
  const file = join(dir, 'sitemap-events.xml');
  writeFileSync(file, xml(['2026-04-04', '2026-06-06']));
  const got = childLastmod(file, '2026-09-19');
  check('reads the file it is given', got === '2026-06-06', got);

  const missing = childLastmod(join(dir, 'sitemap-nope.xml'), '2026-09-19');
  // A generator that failed leaves no file. Falling back for that ONE child is
  // the old behaviour; throwing would fail the whole build over one table.
  check('falls back for a child that was never written', missing === '2026-09-19', missing);
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
