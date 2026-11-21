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

/**
 * WEB-SEC-065. Longest text track-ad-event stores per field. The rate limit
 * (120 per 15 minutes per IP per campaign) bounded the number of rows, not
 * their size, so one caller could park megabytes of page_url in ad_impressions,
 * a table advertisers read back on their dashboard. Real values fit with room:
 * a browser User-Agent is ~150 characters, and 2048 is the URL length most
 * servers and sitemaps already assume.
 */
export const TRACKING_TEXT_MAX = {
  user_agent: 512,
  page_url: 2048,
  referrer_url: 2048,
} as const;

/**
 * A string cut to `max` UTF-16 units, or null for anything that is not a
 * non-empty string. Truncates rather than refuses: an over-long URL is still a
 * real impression, and a tracking endpoint answers 200 either way. A cut that
 * would split a surrogate pair drops the orphaned high half, so the stored text
 * is never invalid UTF-16.
 */
export function clampTrackingText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.length <= max) return value;
  let cut = value.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

export interface ImpressionOwner {
  campaign_id: string;
  creative_id: string;
}

/**
 * WEB-SEC-065. The impression a click may link to, or null.
 *
 * The click's own campaign and creative were checked against the database, but
 * impression_id was written through on its shape alone, so any caller could
 * attach another advertiser's impression to a click and skew both campaigns'
 * click-through numbers. It is now stored only when the impression exists and
 * has the same campaign_id and creative_id as the click. A failed lookup also
 * gives null: the click is still recorded, just unlinked, which is what every
 * click sent without an impression already looks like.
 */
export async function resolveClickImpressionId(
  impressionId: unknown,
  campaignId: string,
  creativeId: string,
  fetchImpression: (id: string) => Promise<ImpressionOwner | null>,
): Promise<string | null> {
  if (typeof impressionId !== 'string' || !UUID_RE.test(impressionId)) return null;
  let owner: ImpressionOwner | null;
  try {
    owner = await fetchImpression(impressionId);
  } catch {
    return null;
  }
  if (!owner) return null;
  return owner.campaign_id === campaignId && owner.creative_id === creativeId
    ? impressionId
    : null;
}
