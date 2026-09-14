/**
 * WEB-SEO-038: building the sitemap index honestly.
 *
 * Extracted from generate-dynamic-sitemaps.ts so it can be tested without a
 * database: that module runs main() on import, so anything defined inside it is
 * unreachable from a test.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/** Every child the index may advertise, in the order it advertises them. */
export const SITEMAP_CHILDREN = [
  'sitemap-static.xml',
  'sitemap-events.xml',
  'sitemap-restaurants.xml',
  'sitemap-attractions.xml',
  'sitemap-playgrounds.xml',
  'sitemap-articles.xml',
  'sitemap-hotels.xml',
  'sitemap-guides.xml',
  'sitemap-pseo.xml',
] as const;

/**
 * The newest `<lastmod>` inside a sitemap's own entries.
 *
 * The index used to stamp the build date on all nine children every build,
 * whether or not anything in them had changed. lastmod is the one field in an
 * index a crawler acts on - it is the signal for "refetch this child" - so a
 * value that moves every build carries no information: it either trains Google
 * to ignore the field or spends crawl budget refetching ~900 pSEO URLs that did
 * not move.
 *
 * ISO dates sort lexicographically, which is why the generator writes
 * YYYY-MM-DD and this can sort strings rather than parse them.
 *
 * `fallback` is returned only when the child holds no usable lastmod at all -
 * the one case where there is nothing better to say than "today".
 */
export function newestLastmodIn(xml: string, fallback: string): string {
  const stamps = (xml.match(/<lastmod>([^<]*)<\/lastmod>/g) || [])
    .map((tag) => tag.replace(/<\/?lastmod>/g, '').trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}/.test(value));

  if (stamps.length === 0) return fallback;
  return stamps.sort().pop() as string;
}

/** Same, reading the file from public/. A missing file returns the fallback. */
export function newestChildLastmod(filename: string, fallback: string): string {
  const path = join(process.cwd(), 'public', filename);
  if (!existsSync(path)) return fallback;
  return newestLastmodIn(readFileSync(path, 'utf8'), fallback);
}

/** The index document, listing only the children that exist on disk. */
export function renderSitemapIndex(
  baseUrl: string,
  children: readonly string[],
  lastmodFor: (child: string) => string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${children
  .map(
    (name) => `  <sitemap>
    <loc>${baseUrl}/${name}</loc>
    <lastmod>${lastmodFor(name)}</lastmod>
  </sitemap>`,
  )
  .join('\n')}
</sitemapindex>`;
}
