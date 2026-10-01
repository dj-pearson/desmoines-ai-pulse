/**
 * Pure helpers for scripts/indexnow-ping.ts (SEO-047): find the IndexNow key
 * file, read sitemaps, and work out which URLs changed since the last run.
 *
 * The payload itself (host check, 10,000 cap) is built by
 * supabase/functions/_shared/indexNow.ts, which regenerate-sitemaps already
 * uses, so the two senders cannot disagree about what a valid batch is.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/** url -> lastmod (YYYY-MM-DD, or '' when the sitemap gave none). */
export type SitemapState = Record<string, string>;

export interface SavedState {
  /** sha256 of the sitemap index body when this state was read. */
  indexHash: string;
  /** ISO time the state was read. */
  readAt: string;
  urls: SitemapState;
}

const KEY_FILE = /^[0-9a-f]{32}\.txt$/;

/**
 * The key lives in exactly one place: public/<key>.txt, whose body is the key.
 * IndexNow verifies a submission by fetching that file, so reading the key
 * back off it means the script can never send a key the site does not serve.
 * Returns null when there is no such file, or more than one.
 */
export function findIndexNowKey(publicDir: string): { key: string; file: string } | null {
  const matches = readdirSync(publicDir)
    .filter((f) => KEY_FILE.test(f))
    .filter((f) => readFileSync(join(publicDir, f), 'utf8').trim() === f.slice(0, -4));
  if (matches.length !== 1) return null;
  return { key: matches[0].slice(0, -4), file: matches[0] };
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Child sitemap URLs from a <sitemapindex>. */
export function parseSitemapIndex(xml: string): string[] {
  if (!/<sitemapindex[\s>]/.test(xml)) return [];
  const out: string[] = [];
  for (const block of xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(block[1]);
    if (loc) out.push(decodeXml(loc[1]));
  }
  return out;
}

/**
 * url -> lastmod from a <urlset>. Anything else (an HTML fallback page served
 * with 200 for a sitemap that does not exist) yields an empty map rather than
 * garbage.
 */
export function parseUrlset(xml: string): SitemapState {
  const out: SitemapState = {};
  if (!/<urlset[\s>]/.test(xml)) return out;
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(block[1]);
    if (!loc) continue;
    const lastmod = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(block[1]);
    out[decodeXml(loc[1])] = lastmod ? lastmod[1].slice(0, 10) : '';
  }
  return out;
}

/**
 * URLs worth telling IndexNow about.
 *
 * With a previous state: every URL that is new or whose lastmod changed.
 * Removed URLs are not sent; IndexNow is for "come look at this", and a page
 * that left the sitemap is either gone (the crawler finds the 404/410 on its
 * own schedule) or noindex.
 *
 * Without one (first run, or the cache was evicted): every URL whose lastmod
 * is on or after `sinceDate`. Date-only lastmods make that a day-granular
 * window, so a duplicate submission is possible and harmless; a missed one is
 * what the window is sized to avoid.
 */
export function changedUrls(prev: SitemapState | null, next: SitemapState, sinceDate: string): string[] {
  const out: string[] = [];
  for (const [url, lastmod] of Object.entries(next)) {
    if (prev) {
      if (!(url in prev) || prev[url] !== lastmod) out.push(url);
    } else if (lastmod && lastmod >= sinceDate) {
      out.push(url);
    }
  }
  return out.sort();
}

/** Split a list into chunks of at most `size` (IndexNow caps a request at 10,000). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
