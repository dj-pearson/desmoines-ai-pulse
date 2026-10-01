/**
 * Ticketmaster link building for scrape-ticketmaster-events, kept apart from
 * index.ts so it can be tested without starting the server.
 */

/** Impact's tracking redirect for the Ticketmaster programme. */
export const AFFILIATE_ORIGIN = "https://ticketmaster.evyy.net";
export const AFFILIATE_BASE = `${AFFILIATE_ORIGIN}/c/6430290/264167/4272?u=`;

/**
 * Strip tracking parameters from Ticketmaster URLs for cleaner affiliate links.
 */
export function cleanTicketmasterUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const trackingParams = [
      "_gl",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ];
    trackingParams.forEach((param) => url.searchParams.delete(param));
    // Remove _ga* params (Google Analytics)
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("_ga")) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Convert a Ticketmaster URL to an affiliate link.
 */
export function toAffiliateLink(ticketmasterUrl: string): string {
  const cleanUrl = cleanTicketmasterUrl(ticketmasterUrl);
  return AFFILIATE_BASE + encodeURIComponent(cleanUrl);
}

/**
 * The columns written for a matched event (plan WP6).
 *
 * This used to overwrite events.source_url with the affiliate redirect, which
 * threw away the real page: the link checker, dedupe and JSON-LD all read
 * source_url, and the detail page could not tell an affiliate link from a
 * plain one. The redirect now goes in affiliate_url
 * (20261006000001_events_affiliate_url.sql). source_url is set to the clean
 * Ticketmaster page only when it is empty or still holds a redirect from an
 * earlier run; a real source page some other scraper found is left alone.
 */
export function ticketmasterPatch(
  show: { ticketmasterUrl: string; affiliateUrl: string },
  currentSourceUrl: string | null,
): { affiliate_url: string; source_url?: string } {
  const patch: { affiliate_url: string; source_url?: string } = {
    affiliate_url: show.affiliateUrl,
  };
  if (!currentSourceUrl || currentSourceUrl.startsWith(AFFILIATE_ORIGIN)) {
    patch.source_url = cleanTicketmasterUrl(show.ticketmasterUrl);
  }
  return patch;
}
