/**
 * The one way a domain adapter is allowed to fetch a third-party page
 * (WEB-SEC-024 AC6).
 *
 * scrapeUrl() checks robots.txt before every fetch, deliberately at the top so
 * the backend fallback chain cannot route around it. The adapters did not go
 * through scrapeUrl: they called globalThis.fetch directly, each with its own
 * copy of a Chrome/120 User-Agent string. So the ingestion paths that do the
 * most crawling were the ones that asked no permission and declared no
 * identity - and a site could neither allow, deny nor rate-limit us.
 *
 * THE AC NAMES TWO ADAPTERS. THERE WERE SIX.
 *   catchdesmoines  eventbrite  barnstormers  hyveetix  tribeEvents
 *   vibrantmusichall
 * Each had pasted the same Chrome UA, so SCRAPER_USER_AGENT - the variable the
 * whole UA decision in AC3 turns on - reached none of them. Whatever is decided
 * there now takes effect in one place.
 *
 * NOT ROUTED, and the distinction is real: milb and seatgeek call documented
 * JSON APIs (statsapi.mlb.com, api.seatgeek.com) with `Accept:
 * application/json` and no invented User-Agent. robots.txt governs crawling a
 * site's pages, not calling an API it publishes for the purpose, and neither
 * was pretending to be a browser. hyveetix:240 posts to browserless, which
 * drives its own headless Chrome - the story's notes already record that the
 * agent it presents cannot be set from this repo.
 *
 * FAIL-OPEN, inherited from robots.ts: no robots.txt, a 404, a 5xx, a timeout
 * or an unparseable file all mean allowed. The other direction turns one flaky
 * fetch into a domain-wide ingestion halt.
 */

import { isCrawlAllowed } from "../robots.ts";
import { getScraperConfig } from "../scraper.ts";

/**
 * Headers every adapter sends. The User-Agent comes from the same
 * getScraperConfig() that scrapeUrl uses, so SCRAPER_USER_AGENT is honoured in
 * exactly one place rather than in six pasted literals.
 */
export function adapterHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    // userAgent is optional on ScraperConfig. getScraperConfig() always supplies
    // one - the Chrome default when SCRAPER_USER_AGENT is unset - so this
    // fallback is for the type, not for a state that occurs.
    "User-Agent": getScraperConfig().userAgent ?? "",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...extra,
  };
}

/**
 * Fetch a page after asking the site's robots.txt.
 *
 * Returns null when an explicit Disallow covers the path. Null rather than a
 * throw because every call site here already branches on a failed response, so
 * a blocked fetch reports through the path the adapter already has - and
 * because a throw would escape the adapters that fetch outside a try.
 *
 * SCRAPER_IGNORE_ROBOTS=true is the same escape hatch scrapeUrl honours: for an
 * incident, not a default.
 */
export async function fetchAllowed(
  url: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<Response | null> {
  const config = getScraperConfig();

  if (Deno.env.get("SCRAPER_IGNORE_ROBOTS") !== "true") {
    const allowed = await isCrawlAllowed(url, config.userAgent || "*");
    if (!allowed) {
      console.log(`⛔ ${url} is disallowed by robots.txt — not fetching`);
      return null;
    }
  }

  return await globalThis.fetch(url, {
    ...init,
    headers: adapterHeaders(init?.headers),
  });
}
