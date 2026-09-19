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
 *      anchor — that URL is the only field NOT in ld+json.
 *
 * Matches `catchdesmoines.com/events*` (list pages). Skips `/event/...`
 * detail URLs so the generic path can still handle one-off detail scrapes.
 */

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";
import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";
import { scrapeUrl } from "../scraper.ts";
import { fetchAllowed } from "./adapterFetch.ts";
import { categoryForEventType } from "./catchdesmoinesCategory.ts";

const SITE_ORIGIN = "https://www.catchdesmoines.com";
const PAGE_SIZE = 12;
const MAX_LIST_PAGES = 3;
const MAX_DETAIL_PAGES = 50; // safety cap; one date-filtered week rarely exceeds ~36
const DETAIL_CONCURRENCY = 5;

const VALID_DETAIL_PATH = /^\/event\/[a-z0-9-]+\/\d+\/?$/i;
const EVENT_LINK_RE =
  /href="(https?:\/\/(?:www\.)?catchdesmoines\.com)?(\/event\/[a-z0-9-]+\/\d+\/?)"/gi;

const EXCLUDED_DOMAINS = [
  "catchdesmoines.com",
  "simpleview",
  "facebook.com",
  "twitter.com",
  "instagram.com",
  "youtube.com",
  "vimeo.com",
  "google.com",
  "googleapis.com",
  "googletagmanager.com",
  "gstatic.com",
  "doubleclick.net",
  "cloudflare.com",
];

// WEB-SEC-024: BROWSER_HEADERS used to be declared here, with its own pasted
// Chrome/120 User-Agent. adapterHeaders() builds them from getScraperConfig(),
// so SCRAPER_USER_AGENT reaches this adapter instead of being decoration.

interface SchemaOrgEvent {
  "@type"?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  image?: string | { url?: string };
  url?: string;
  location?: {
    name?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
      addressRegion?: string;
      postalCode?: string;
    };
    geo?: { latitude?: number; longitude?: number };
  };
}

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

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
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

    const externalUrl = extractVisitWebsiteUrl(html, url);

    return toAdapterEvent(ldEvent, url, externalUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ [catchdesmoines] detail ${url} threw: ${msg}`);
    return null;
  }
}

function parseLdJsonEvent(html: string): SchemaOrgEvent | null {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]+?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        if (c && isEventType(c["@type"])) return c as SchemaOrgEvent;
      }
    } catch {
      // Skip malformed ld+json blocks, keep scanning
    }
  }
  return null;
}

// Accept schema.org Event AND its subtypes (MusicEvent, SportsEvent,
// TheaterEvent, ComedyEvent, Festival, Hackathon, BusinessEvent, etc.)
function isEventType(t: unknown): boolean {
  if (typeof t !== "string") return false;
  return t === "Event" ||
    t === "Festival" ||
    t === "Hackathon" ||
    t.endsWith("Event");
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

  // Fallback: look for linkUrl in embedded JSON (older Simpleview pattern)
  const linkMatch = html.match(/["']linkUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (linkMatch) {
    const normalized = normalizeUrl(linkMatch[1], eventUrl);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeUrl(
  href: string | null | undefined,
  base: string,
): string | null {
  if (!href) return null;
  let url = href.trim();
  if (url.startsWith("//")) url = `https:${url}`;
  else if (url.startsWith("/")) {
    try {
      url = new URL(url, base).toString();
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(url)) return null;
  const lower = url.toLowerCase();
  if (EXCLUDED_DOMAINS.some((d) => lower.includes(d))) return null;
  return url;
}

function toAdapterEvent(
  ev: SchemaOrgEvent,
  detailUrl: string,
  externalUrl: string | null,
): AdapterEvent | null {
  if (!ev.name) return null;

  const date = parseDateTime(ev.startDate);
  if (!date) return null;

  const venue = ev.location?.name ?? "TBD";
  const address = ev.location?.address;
  const location = address
    ? [address.addressLocality, address.addressRegion]
      .filter(Boolean)
      .join(", ") || "Des Moines, IA"
    : "Des Moines, IA";

  const image = typeof ev.image === "string"
    ? ev.image
    : ev.image?.url ?? null;

  return {
    title: ev.name,
    description: (ev.description ?? "").substring(0, 500),
    date,
    location,
    venue,
    category: categoryForEventType(ev["@type"]),
    price: "See website",
    source_url: externalUrl ?? detailUrl,
    image_url: image,
  };
}

function parseDateTime(raw: string | undefined): string | null {
  if (!raw) return null;
  // schema.org dates: "YYYY-MM-DD" (all-day) or "YYYY-MM-DDTHH:MM:SS[Z|±HH:MM]"
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const date = m[1];
  // WEB-BE-037. This defaulted an all-day schema.org date to "19:00", which is
  // indistinguishable from a real 7pm show and disagreed with the three other
  // ingestion paths (19:31:58, 19:30, 19:00). Returning the DATE ONLY hands the
  // decision to parseEventDateTime in _shared/eventDateTime.ts, which stamps
  // NO_TIME_MARKER - the one value that means "the source published no time".
  // Both consumers of this adapter (ai-crawler, firecrawl-scraper) run that
  // parser over item.date, so the marker is what lands.
  if (m[2] === undefined) return date;
  const ss = m[3] ?? "00";
  return `${date} ${m[2]}:${ss}`;
}

// Minimal Element interface — deno-dom's types don't carry through cleanly
interface Element {
  textContent: string | null;
  getAttribute(name: string): string | null;
}
