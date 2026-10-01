/**
 * Filters for ad-event tracking (WEB-ADS-002).
 *
 * Split out of track-ad-event/index.ts so these rules can be tested without
 * importing a module whose top level calls Deno.serve.
 */

/** Substrings that mark a User-Agent as automated. Lowercased before matching. */
export const BOT_PATTERNS = [
  'bot', 'crawl', 'spider', 'slurp', 'headless', 'phantom', 'puppeteer',
  'playwright', 'selenium', 'webdriver', 'scrapy', 'curl', 'wget', 'python-requests',
  'go-http-client', 'java/', 'okhttp', 'axios/', 'node-fetch', 'lighthouse',
  'gtmetrix', 'pingdom', 'uptimerobot', 'facebookexternalhit', 'preview',
];

/**
 * Does this User-Agent belong to something that should not be billed as reach?
 *
 * A missing User-Agent counts as automated: every real browser sends one, and
 * the cheapest way to dodge a substring match is to send nothing at all.
 */
export function looksAutomated(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
