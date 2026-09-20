import { existsSync, readFileSync } from 'node:fs';

/**
 * The most recent <lastmod> inside a child sitemap (WEB-SEO-038 AC3).
 *
 * The index used to stamp currentDate on every child on every build, so it
 * told a crawler that all fourteen sitemaps had changed today - including
 * sitemap-static.xml, a committed file that changes a few times a year. A
 * lastmod that is always "now" carries no signal, and Google's guidance is
 * that it stops trusting the value rather than re-crawling on it.
 *
 * READ BACK OFF THE WRITTEN FILE rather than threaded through fourteen
 * generator return types. The index is describing those files, so deriving its
 * stamps from them is both the smallest change and the one that cannot
 * disagree with what shipped.
 *
 * A file that does not exist yet - a generator that failed, a table that is
 * empty on a fresh project - falls back to `fallback`, which is the old
 * behaviour for that one child only.
 */
export function childLastmod(path: string, fallback: string): string {
  if (!existsSync(path)) return fallback;
  return maxLastmod(readFileSync(path, 'utf8'), fallback);
}

/** The same rule over sitemap XML already in hand. Exported for tests. */
export function maxLastmod(xml: string, fallback: string): string {
  const stamps = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (stamps.length === 0) return fallback;
  // ISO-8601 dates sort lexicographically, which is why they are stored that
  // way. A mixed-format file would sort wrong here, so the generator's own
  // renderSitemapXML is the only thing that writes these.
  return stamps.sort().at(-1) as string;
}
