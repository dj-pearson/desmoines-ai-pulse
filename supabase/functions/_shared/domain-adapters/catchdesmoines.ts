/**
 * Catch Des Moines (Simpleview Leo) adapter.
 *
 * The existing firecrawl-scraper handles catchdesmoines via Browserless +
 * Claude + per-event "Visit Website" DOM scraping. This adapter does the
 * same work without Claude:
 *
 *   1. Browserless renders the date-filtered list page (events are JS-XHR
 *      loaded — plain fetch returns an empty container).
 *   2. Regex out `/event/<slug>/<id>/` links from the rendered HTML.
 *   3. For each detail page: plain fetch (server-rendered), parse the
 *      `<script type="application/ld+json">` Event blob for title, dates,
 *      image, description, venue, and geo coordinates.
 *   4. Parse the same detail HTML's DOM for the external "Visit Website"
 *      anchor — that URL is the only field NOT in ld+json. When there is no
 *      such anchor, fall back to linkUrl / a ticket link / a "Website" link
 *      (catchdesmoinesParse.ts) before settling for the listing URL.
 *
 * The street address and geo pair from the ld+json are carried through too,
 * and the image falls back to og:image. What image the row finally stores is
 * decided at ingest by venueImage.ts: a show at a venue with a default image
 * (Vibrant, Hoyt Sherman, Wells Fargo Arena...) takes the venue's image and
 * this per-event URL is never downloaded.
 *
 * Matches `catchdesmoines.com/events*` (list pages). Skips `/event/...`
 * detail URLs so the generic path can still handle one-off detail scrapes.
 */

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";
import type {
  AdapterEvent,
  AdapterFetchOptions,
  AdapterResult,
  DomainAdapter,
} from "./types.ts";
import { scrapeUrl } from "../scraper.ts";
import { fetchAllowed } from "./adapterFetch.ts";
import {
  extractExternalUrlFallback,
  normalizeUrl,
  parseLdJsonEvent,
  selectDetailUrls,
  toAdapterEvent,
} from "./catchdesmoinesParse.ts";
import { listingReport, walkListing } from "./catchdesmoinesListing.ts";

const PAGE_SIZE = 12;
// Three pages was 36 events, which on the unfiltered /events/ listing the
// scheduled job crawls is two or three days of the calendar. Eight pages is
// about two weeks. Each page is a Browserless render, so the walk is also
// bounded by LIST_BUDGET_MS: whatever pages fit are used and the run goes on to
// the detail pages instead of timing out the whole function with nothing saved.
const MAX_LIST_PAGES = 8;
const LIST_BUDGET_MS = 75_000;
const MAX_DETAIL_PAGES = 100;
const DETAIL_CONCURRENCY = 6;

// WEB-SEC-024: BROWSER_HEADERS used to be declared here, with its own pasted
// Chrome/120 User-Agent. adapterHeaders() builds them from getScraperConfig(),
// so SCRAPER_USER_AGENT reaches this adapter instead of being decoration.

export const catchdesmoinesAdapter: DomainAdapter = {
  name: "catchdesmoines",

  matches(url: string): boolean {
    const lower = url.toLowerCase();
    if (!lower.includes("catchdesmoines.com")) return false;
    // Detail pages fall through to the generic path
    if (/\/event\/[a-z0-9-]+\/\d+/i.test(url)) return false;
    // Only match list/events pages
    return /\/events?\b/i.test(url);
  },

  supports(category: string): boolean {
    return category === "events";
  },

  async fetch(
    url: string,
    _category: string,
    options?: AdapterFetchOptions,
  ): Promise<AdapterResult> {
    console.log(`🏛️ [catchdesmoines] Discovering events from ${url}`);

    const walk = await walkListing(
      url,
      async (pageUrl) => {
        const r = await scrapeUrl(pageUrl, { waitTime: 5000, timeout: 30000 });
        return { ok: r.success, html: r.html, error: r.error };
      },
      { maxPages: MAX_LIST_PAGES, pageSize: PAGE_SIZE, budgetMs: LIST_BUDGET_MS },
    );
    const detailUrls = walk.urls;
    console.log(
      `[catchdesmoines] list walk read ${walk.pagesRead} page(s) (${walk.pagesFailed} failed), stopped on ${walk.listingStop}`,
    );
    if (detailUrls.length === 0) {
      return {
        success: false,
        items: [],
        adapter: "catchdesmoines",
        error: "No event detail URLs found across list pages",
      };
    }
    console.log(
      `📌 [catchdesmoines] ${detailUrls.length} unique event URL(s) to fetch`,
    );

    // Stored listings are dropped before the budget is applied, so the 100
    // detail fetches go to events the database does not have yet.
    const { toFetch: urls, skippedKnown } = selectDetailUrls(
      detailUrls,
      options?.knownSourceIds,
      MAX_DETAIL_PAGES,
    );
    if (skippedKnown > 0) {
      console.log(
        `⏭️ [catchdesmoines] skipping ${skippedKnown} already-stored listing(s)`,
      );
    }
    const items: AdapterEvent[] = [];

    for (let i = 0; i < urls.length; i += DETAIL_CONCURRENCY) {
      const batch = urls.slice(i, i + DETAIL_CONCURRENCY);
      const results = await Promise.all(batch.map(fetchEventDetail));
      for (const item of results) {
        if (item) items.push(item);
      }
    }

    console.log(
      `✅ [catchdesmoines] ${items.length} events parsed from ${urls.length} detail pages`,
    );
    const listing = listingReport(
      walk,
      { fetched: urls.length, skippedKnown, parsed: items },
      new Date(),
    );
    console.log(
      `[catchdesmoines] read through ${listing.latestFetchedDay ?? "no dated event"} (horizon ${listing.horizonDay}${listing.reachedHorizon ? ", reached" : ""})`,
    );
    return {
      success: true,
      items,
      adapter: "catchdesmoines",
      skippedKnown,
      listing,
    };
  },
};

async function fetchEventDetail(url: string): Promise<AdapterEvent | null> {
  try {
    const response = await fetchAllowed(url);
    if (!response) {
      console.log(`  ⛔ [catchdesmoines] detail ${url}: disallowed by robots.txt`);
      return null;
    }
    if (!response.ok) {
      console.log(
        `  ❌ [catchdesmoines] detail ${url} → HTTP ${response.status}`,
      );
      return null;
    }
    const html = await response.text();

    const ldEvent = parseLdJsonEvent(html);
    if (!ldEvent) {
      console.log(`  ❌ [catchdesmoines] detail ${url}: no ld+json Event`);
      return null;
    }

    const externalUrl = extractVisitWebsiteUrl(html, url) ??
      extractExternalUrlFallback(html, url);

    return toAdapterEvent(ldEvent, url, externalUrl, html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ [catchdesmoines] detail ${url} threw: ${msg}`);
    return null;
  }
}

function extractVisitWebsiteUrl(html: string, eventUrl: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return null;

  const anchors = doc.querySelectorAll("a") as unknown as Iterable<Element>;
  for (const anchor of anchors) {
    const text = (anchor.textContent ?? "").trim().toLowerCase().replace(
      /\s+/g,
      " ",
    );
    if (!text.includes("visit website")) continue;
    const href = anchor.getAttribute("href");
    const normalized = normalizeUrl(href, eventUrl);
    if (normalized) return normalized;
  }

  return null;
}

// Minimal Element interface — deno-dom's types don't carry through cleanly
interface Element {
  textContent: string | null;
  getAttribute(name: string): string | null;
}
