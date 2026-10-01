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
import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";
import { scrapeUrl } from "../scraper.ts";
import { fetchAllowed } from "./adapterFetch.ts";
import {
  extractExternalUrlFallback,
  normalizeUrl,
  parseLdJsonEvent,
  toAdapterEvent,
} from "./catchdesmoinesParse.ts";

const SITE_ORIGIN = "https://www.catchdesmoines.com";
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

const VALID_DETAIL_PATH = /^\/event\/[a-z0-9-]+\/\d+\/?$/i;
const EVENT_LINK_RE =
  /href="(https?:\/\/(?:www\.)?catchdesmoines\.com)?(\/event\/[a-z0-9-]+\/\d+\/?)"/gi;

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

  async fetch(url: string, _category: string): Promise<AdapterResult> {
    console.log(`🏛️ [catchdesmoines] Discovering events from ${url}`);

    const detailUrls = await discoverEventUrls(url);
    if (detailUrls.size === 0) {
      return {
        success: false,
        items: [],
        adapter: "catchdesmoines",
        error: "No event detail URLs found across list pages",
      };
    }
    console.log(
      `📌 [catchdesmoines] ${detailUrls.size} unique event URL(s) to fetch`,
    );

    const urls = Array.from(detailUrls).slice(0, MAX_DETAIL_PAGES);
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
    return { success: true, items, adapter: "catchdesmoines" };
  },
};

async function discoverEventUrls(baseUrl: string): Promise<Set<string>> {
  const eventUrls = new Set<string>();
  const startedAt = Date.now();

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    if (page > 0 && Date.now() - startedAt > LIST_BUDGET_MS) {
      console.log(
        `  ⏱️ [catchdesmoines] list budget spent after ${page} page(s); continuing with ${eventUrls.size} URL(s)`,
      );
      break;
    }
    const pageUrl = new URL(baseUrl);
    pageUrl.searchParams.set("bounds", "false");
    pageUrl.searchParams.set("view", "grid");
    pageUrl.searchParams.set("sort", "date");
    if (page > 0) {
      pageUrl.searchParams.set("skip", String(page * PAGE_SIZE));
    }

    const before = eventUrls.size;
    console.log(
      `🔎 [catchdesmoines] list page ${page + 1}/${MAX_LIST_PAGES}: ${pageUrl}`,
    );

    const result = await scrapeUrl(pageUrl.toString(), {
      waitTime: 5000,
      timeout: 30000,
    });
    if (!result.success || !result.html) {
      console.log(
        `  ⚠️ [catchdesmoines] list page ${page + 1} failed: ${result.error}`,
      );
      continue;
    }

    EVENT_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EVENT_LINK_RE.exec(result.html)) !== null) {
      const path = m[2];
      if (!VALID_DETAIL_PATH.test(path.replace(/\/$/, "/"))) continue;
      eventUrls.add(`${SITE_ORIGIN}${path.replace(/\/?$/, "/")}`);
    }

    const added = eventUrls.size - before;
    console.log(`  → page added ${added} new URL(s) (total ${eventUrls.size})`);
    if (page > 0 && added === 0) break; // no more pages
  }

  return eventUrls;
}

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
