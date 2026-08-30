/**
 * Generic "listing page → event detail page" discovery and extraction.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Most venue sites are two layers deep: /events/ lists cards with a title and a
 * partial date, and everything the pipeline actually needs — the real start
 * time, the hero image, the ticket link — lives on the per-event page. The
 * generic crawl path only ever fetched the LISTING page, so:
 *
 *   - every event from a site shared one `source_url` (the listing URL), so no
 *     row deep-linked to its own event;
 *   - images were whatever URL Claude happened to spot in truncated HTML,
 *     frequently the site logo or a relative path that then failed to download;
 *   - times defaulted to 19:00 because the card only showed a date.
 *
 * catchdesmoines.ts already solved this, but hardcoded to one site. This module
 * is that same procedure generalized: discover the detail links, fetch them
 * concurrently, and read each page's structured data.
 *
 * EXTRACTION PRECEDENCE (per detail page, first hit wins)
 *   1. schema.org/Event ld+json  — exact ISO start, canonical name, image, offers
 *   2. schema.org microdata      — itemprop=startDate/name/image
 *   3. OpenGraph / Twitter meta  — og:title, og:image, article/event meta
 *   4. <time datetime> + <h1>    — last resort, still better than nothing
 *
 * Everything is defensive: a dead detail page, malformed JSON, or a missing
 * field drops that one page, never the batch.
 */

import type { AdapterEvent } from "./domain-adapters/types.ts";
import { extractEventsFromJsonLd, normalizeJsonLdDate } from "./jsonLdEvents.ts";
import type { EventSourceProfile } from "./eventSourceProfiles.ts";
import { hostMatches, isDetailPath } from "./eventSourceProfiles.ts";

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Hard caps so a pathological site can't fan out unbounded. */
export const MAX_DETAIL_PAGES = 60;
export const DETAIL_CONCURRENCY = 5;
export const DETAIL_TIMEOUT_MS = 15_000;

/**
 * Path fragments that generically mark an event detail page across platforms.
 * Used when a profile declares no patterns of its own. Deliberately narrow —
 * a false positive costs a wasted fetch, and a listing page misread as a detail
 * page produces one junk row.
 */
const GENERIC_DETAIL_PATTERNS: readonly RegExp[] = [
  /\/event\/[^/]+/i,
  /\/events\/detail\/[^/]+/i,
  /\/events\/[^/]+\/\d+/i,
  /\/e\/[^/]+-tickets-\d+/i, // Eventbrite
  /\/shows?\/detail\/[^/]+/i,
  /\/performance\/[^/]+/i,
  /\/production\/[^/]+/i,
];

/** Paths that are never an event, even when they match a detail pattern. */
const DETAIL_PATH_DENYLIST: readonly RegExp[] = [
  /\/events?\/?$/i,
  /\/events?\/(page|list|month|week|day|calendar|category|categories|tag|venue|organizer|search|archive|past|upcoming|all)\b/i,
  // Date-shaped segments are calendar ARCHIVE views ("/events/2026-09/",
  // "/events/2026/09/14/"), which every profile's generic "/events/<slug>"
  // pattern would otherwise happily accept as an event.
  /\/events?\/\d{4}(?:[-/]\d{1,2}){0,2}\/?$/i,
  /\/events?\/(19|20)\d{2}-(0[1-9]|1[0-2])\b/i,
  /\/(wp-json|wp-admin|wp-content|feed|rss|ical|ics|xml|json)\b/i,
  /\.(css|js|json|xml|ics|pdf|jpg|jpeg|png|gif|svg|webp|avif)(\?|$)/i,
];

/** Ticket vendors we prefer as a per-event `source_url` when the site links out. */
const TICKET_VENDOR_HOSTS: readonly string[] = [
  "ticketmaster.com",
  "livenation.com",
  "axs.com",
  "etix.com",
  "eventbrite.com",
  "seetickets.us",
  "prekindle.com",
  "tixr.com",
  "dice.fm",
  "seatgeek.com",
  "ticketweb.com",
  "showclix.com",
  "eventbrite.ca",
  "universe.com",
  "simpletix.com",
  "onthestage.tickets",
  "ci.ovationtix.com",
  "web.ovationtix.com",
  "ovationtix.com",
  "audienceview.com",
  "evenue.net",
];

const TICKET_LINK_TEXT =
  /\b(buy|get|purchase|order)\s+tickets?\b|\btickets?\s+(here|now|&|and)\b|\bbuytix\b|\bbox\s*office\b/i;

/** Assets/pixels that must never be taken as an event image. */
const IMAGE_DENYLIST =
  /(sprite|logo|favicon|placeholder|default|blank|spacer|pixel|tracking|avatar|1x1|transparent)/i;

// ─────────────────────────────────────────────────────────────────────────────
// Link discovery
// ─────────────────────────────────────────────────────────────────────────────

/** Every href in a document, as raw strings. */
function allHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[2] ?? m[3] ?? m[4];
    if (href) out.push(href);
  }
  return out;
}

function absolutize(href: string, baseUrl: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#")) return null;
  if (/^(mailto|tel|javascript|data):/i.test(raw)) return null;
  try {
    const u = new URL(raw, baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function looksLikeDetailPath(
  path: string,
  profile: EventSourceProfile | null,
): boolean {
  if (DETAIL_PATH_DENYLIST.some((re) => re.test(path))) return false;
  if (profile && isDetailPath(profile, path)) return true;
  return GENERIC_DETAIL_PATTERNS.some((re) => re.test(path));
}

/**
 * Find same-host event detail URLs linked from a listing page.
 *
 * Same-host only, by design: following off-host links from a listing page is how
 * a crawler ends up ingesting a ticket vendor's whole catalogue. Off-host ticket
 * links are still used, but as an event's `source_url` (see `findTicketUrl`),
 * not as pages to crawl.
 */
export function discoverDetailLinks(
  html: string,
  listingUrl: string,
  profile: EventSourceProfile | null = null,
  limit = MAX_DETAIL_PAGES,
): string[] {
  let listingHost: string;
  try {
    listingHost = new URL(listingUrl).hostname.toLowerCase();
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];

  for (const href of allHrefs(html)) {
    const abs = absolutize(href, listingUrl);
    if (!abs) continue;

    let u: URL;
    try {
      u = new URL(abs);
    } catch {
      continue;
    }

    const host = u.hostname.toLowerCase();
    const sameSite = profile
      ? profile.hosts.some((d) => hostMatches(host, d))
      : hostMatches(host, listingHost) || hostMatches(listingHost, host);
    if (!sameSite) continue;

    if (!looksLikeDetailPath(u.pathname, profile)) continue;

    // Normalize away tracking noise so ?utm_* variants don't triple-fetch.
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|_ga)/i.test(key)) u.searchParams.delete(key);
    }
    const normalized = u.toString().replace(/\/$/, "");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(u.toString());
    if (out.length >= limit) break;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-page field extraction
// ─────────────────────────────────────────────────────────────────────────────

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decodeEntities(m[1].trim());
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number(d);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " "));
}

/**
 * Best available hero image for a page. OpenGraph first — it is the one image
 * a site explicitly designates as representative — then Twitter, then the
 * largest-looking content <img>. Never returns a logo/pixel.
 */
export function extractHeroImage(html: string, baseUrl: string): string | null {
  const candidates: (string | null)[] = [
    metaContent(html, [
      /<meta[^>]+property\s*=\s*["']og:image:secure_url["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image:secure_url["']/i,
      /<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image["']/i,
      /<meta[^>]+name\s*=\s*["']twitter:image(?::src)?["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']twitter:image(?::src)?["']/i,
      /<link[^>]+rel\s*=\s*["']image_src["'][^>]+href\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+itemprop\s*=\s*["']image["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    ]),
  ];

  // Content <img>: prefer ones whose attributes hint at an event/hero/featured
  // role. data-src / data-lazy-src are checked because lazy-loaded galleries
  // leave `src` as a placeholder.
  const imgRe = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1];
    const src =
      attrs.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1] ??
      attrs.match(/\bdata-lazy-src\s*=\s*["']([^"']+)["']/i)?.[1] ??
      attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ??
      null;
    if (!src) continue;
    if (/^data:/i.test(src)) continue;
    const hinted = /event|hero|featured|banner|poster|artist|show|thumb/i.test(
      attrs,
    );
    if (hinted) candidates.push(src);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (IMAGE_DENYLIST.test(candidate)) continue;
    const abs = absolutize(candidate, baseUrl);
    if (abs) return abs;
  }
  return null;
}

/**
 * The best `source_url` for an event page: an off-site ticket-vendor link when
 * the page offers one (that is where a reader actually wants to land), else the
 * canonical URL, else the page URL itself.
 */
export function findTicketUrl(html: string, pageUrl: string): string | null {
  const anchorRe = /<a\b([^>]*?)>([\s\S]{0,400}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let vendorHit: string | null = null;
  let textHit: string | null = null;

  while ((m = anchorRe.exec(html)) !== null) {
    const attrs = m[1];
    const text = stripTags(m[2]);
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const abs = absolutize(href, pageUrl);
    if (!abs) continue;

    let host: string;
    try {
      host = new URL(abs).hostname.toLowerCase();
    } catch {
      continue;
    }

    const isVendor = TICKET_VENDOR_HOSTS.some((d) => hostMatches(host, d));
    const saysTickets = TICKET_LINK_TEXT.test(text) ||
      TICKET_LINK_TEXT.test(attrs);

    // A vendor host reached via a "buy tickets" CTA is the strongest signal.
    if (isVendor && saysTickets) return abs;
    if (isVendor && !vendorHit) vendorHit = abs;
    if (saysTickets && !textHit) textHit = abs;
  }

  if (vendorHit) return vendorHit;
  if (textHit) return textHit;

  const canonical = metaContent(html, [
    /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i,
    /<meta[^>]+property\s*=\s*["']og:url["'][^>]+content\s*=\s*["']([^"']+)["']/i,
  ]);
  return canonical ? absolutize(canonical, pageUrl) : null;
}

/** schema.org microdata / meta / <time> fallback for a single event page. */
function extractFromMeta(
  html: string,
  pageUrl: string,
): { title: string; date: string; description: string } | null {
  const title =
    metaContent(html, [
      /<meta[^>]+property\s*=\s*["']og:title["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:title["']/i,
      /<meta[^>]+name\s*=\s*["']twitter:title["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<[^>]+itemprop\s*=\s*["']name["'][^>]*content\s*=\s*["']([^"']+)["']/i,
    ]) ??
    (html.match(/<h1\b[^>]*>([\s\S]{1,300}?)<\/h1>/i)?.[1]
      ? stripTags(html.match(/<h1\b[^>]*>([\s\S]{1,300}?)<\/h1>/i)![1])
      : null) ??
    (html.match(/<title\b[^>]*>([^<]{1,300})<\/title>/i)?.[1]
      ? decodeEntities(html.match(/<title\b[^>]*>([^<]{1,300})<\/title>/i)![1])
      : null);

  if (!title) return null;

  const rawDate =
    metaContent(html, [
      /<meta[^>]+itemprop\s*=\s*["']startDate["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+itemprop\s*=\s*["']startDate["']/i,
      /<meta[^>]+property\s*=\s*["']event:start_time["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<time[^>]+itemprop\s*=\s*["']startDate["'][^>]+datetime\s*=\s*["']([^"']+)["']/i,
      /<time[^>]+datetime\s*=\s*["'](\d{4}-\d{2}-\d{2}[^"']*)["']/i,
      /<[^>]+\bdata-(?:event-)?date\s*=\s*["'](\d{4}-\d{2}-\d{2}[^"']*)["']/i,
    ]) ?? null;

  const date = normalizeJsonLdDate(rawDate);
  if (!date) return null;

  const description =
    metaContent(html, [
      /<meta[^>]+property\s*=\s*["']og:description["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    ]) ?? "";

  // Strip the trailing " | Site Name" / " - Site Name" that <title> carries.
  const cleanTitle = title.replace(/\s*[|–—]\s*[^|–—]{1,40}$/, "").trim() ||
    title;

  return {
    title: cleanTitle.substring(0, 200),
    date,
    description: description.substring(0, 500),
  };
}

export interface DetailDefaults {
  venue?: string;
  location?: string;
  category?: string;
  ticketsUrl?: string;
}

/**
 * Whether an extracted `location` is a real place string worth keeping.
 *
 * A schema.org `Place` with a `name` but no `address` — very common — makes the
 * JSON-LD extractor fall back to the name for BOTH fields, so `location` ends up
 * as "Horizon Events Center" rather than "Clive, IA". That loses the city, which
 * the geocoder, the map pin and every "near me" filter depend on. When the
 * location adds nothing beyond the venue name, the profile's known address is
 * strictly better information.
 */
export function isUsableLocation(
  location: string | undefined,
  venue: string | undefined,
): boolean {
  const loc = (location ?? "").trim();
  if (!loc) return false;
  // The pipeline's generic default carries no information.
  if (/^des moines,?\s*(ia|iowa)?$/i.test(loc)) return false;
  // A bare copy of the venue name is not a location.
  if (venue && loc.toLowerCase() === venue.trim().toLowerCase()) return false;
  // A city or state token, a street number, or a ZIP means it is a real place.
  return /\d|,/.test(loc);
}

/**
 * Turn one event detail page's HTML into an AdapterEvent.
 *
 * `defaults` fill only what the page does NOT provide — a profile default must
 * never overwrite a value the site published, otherwise a multi-venue promoter
 * page (First Fleet) would stamp every show with the same venue.
 */
export function extractEventFromDetailHtml(
  html: string,
  pageUrl: string,
  defaults: DetailDefaults = {},
): AdapterEvent | null {
  const image = extractHeroImage(html, pageUrl);
  const ticketUrl = findTicketUrl(html, pageUrl);

  // 1-2. Structured data. extractEventsFromJsonLd already handles @graph,
  // @type arrays, malformed blocks and relative URL resolution.
  const structured = extractEventsFromJsonLd(
    html,
    pageUrl,
    defaults.category ?? "General",
  );
  if (structured.length > 0) {
    // A detail page can legitimately list sibling performances; the first node
    // is the page's own event (schema.org convention places it first).
    const ev = structured[0];
    const venue = ev.venue && ev.venue !== "TBD"
      ? ev.venue
      : defaults.venue ?? "TBD";
    return {
      ...ev,
      venue,
      location: isUsableLocation(ev.location, venue)
        ? ev.location
        : defaults.location ?? ev.location ?? "Des Moines, IA",
      category: ev.category && ev.category !== "General"
        ? ev.category
        : defaults.category ?? "General",
      // Prefer the page's own canonical/ticket link over a ld+json `url` that
      // some CMSs set to the listing page.
      source_url: ev.source_url ?? ticketUrl ?? defaults.ticketsUrl ?? pageUrl,
      image_url: ev.image_url ?? image,
    };
  }

  // 3-4. Meta / microdata / <time> fallback.
  const meta = extractFromMeta(html, pageUrl);
  if (!meta) return null;

  return {
    title: meta.title,
    description: meta.description,
    date: meta.date,
    location: defaults.location ?? "Des Moines, IA",
    venue: defaults.venue ?? "TBD",
    category: defaults.category ?? "General",
    price: "See website",
    source_url: ticketUrl ?? defaults.ticketsUrl ?? pageUrl,
    image_url: image,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetching
// ─────────────────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DETAIL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.log(`  ❌ [discovery] ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ [discovery] ${url} threw: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a batch of detail pages (bounded concurrency) and return the events
 * that parsed. Dead pages are logged and skipped.
 */
export async function fetchEventsFromDetailPages(
  urls: string[],
  defaults: DetailDefaults = {},
  concurrency = DETAIL_CONCURRENCY,
): Promise<AdapterEvent[]> {
  const capped = urls.slice(0, MAX_DETAIL_PAGES);
  if (capped.length < urls.length) {
    console.log(
      `⚠️ [discovery] capping detail crawl at ${MAX_DETAIL_PAGES} of ${urls.length} link(s)`,
    );
  }

  const items: AdapterEvent[] = [];
  for (let i = 0; i < capped.length; i += concurrency) {
    const batch = capped.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (url) => {
        const html = await fetchText(url);
        if (!html) return null;
        try {
          return extractEventFromDetailHtml(html, url, defaults);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  ❌ [discovery] parse failed for ${url}: ${msg}`);
          return null;
        }
      }),
    );
    for (const item of results) {
      if (item) items.push(item);
    }
  }
  return items;
}

/** Plain HTTP GET of a page, browser-like headers. Null on any failure. */
export async function fetchListingHtml(url: string): Promise<string | null> {
  return await fetchText(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing shared by sports schedules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keep home games only and normalize titles to "<Team> vs <Opponent>".
 *
 * A schedule page lists home and away games together, and an away game is not a
 * Des Moines event — ingesting it puts a game in Milwaukee on the local
 * calendar. Rows are dropped when the title/description marks them away, or
 * when the month falls outside the league's season (a stale carousel or a
 * mis-parsed year shows up as a July hockey game).
 */
export function applyHomeOnlyFilter(
  events: AdapterEvent[],
  config: { teamName: string; awayMarkers: string[]; seasonMonths?: number[] },
): AdapterEvent[] {
  const out: AdapterEvent[] = [];
  let droppedAway = 0;
  let droppedSeason = 0;

  for (const ev of events) {
    const haystack = `${ev.title} ${ev.description}`.toLowerCase();
    if (config.awayMarkers.some((marker) => haystack.includes(marker))) {
      droppedAway++;
      continue;
    }

    if (config.seasonMonths?.length) {
      const month = Number(ev.date.slice(5, 7));
      if (Number.isFinite(month) && !config.seasonMonths.includes(month)) {
        droppedSeason++;
        continue;
      }
    }

    const title = /\bvs\b/i.test(ev.title) ||
        ev.title.toLowerCase().startsWith(config.teamName.toLowerCase())
      ? ev.title
      : `${config.teamName} vs ${ev.title}`;

    out.push({ ...ev, title: title.substring(0, 200) });
  }

  if (droppedAway || droppedSeason) {
    console.log(
      `🏟️ [home-only] kept ${out.length}, dropped ${droppedAway} away / ${droppedSeason} out-of-season`,
    );
  }
  return out;
}
