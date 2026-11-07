/**
 * Vibrant Music Hall adapter.
 *
 * Vibrant (Waukee, IA) server-renders every upcoming show as a schema.org
 * MusicEvent inside `<script type="application/ld+json">` on its /shows page.
 * A single plain HTTP GET returns them all — no headless browser, no Claude
 * tokens (contrast the generic Browserless + Claude path, which only ever saw
 * the /shows LIST page and so produced imageless rows pointed at the list URL).
 *
 * Each ld+json block carries name, a Ticketmaster CDN image, a tz-correct
 * startDate, a per-event Ticketmaster URL, venue, and geo. We map those
 * straight to AdapterEvent[]; the per-event Ticketmaster `source_url` also
 * feeds the existing scrape-ticketmaster-events affiliate-link matcher for free.
 *
 * Modeled on catchdesmoines.ts (ld+json parse) but single-fetch: there is no
 * per-detail-page loop because every event is already on /shows.
 *
 * Matches `vibrantmusichall.com`. Only /shows is server-rendered with ld+json,
 * so that is always the URL we fetch regardless of the seeded source URL.
 */

import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";
import { fetchAllowed } from "./adapterFetch.ts";
import { priceFromOffers } from "../jsonLdOffers.ts";
// WEB-BE-059. Vibrant carried a private copy of this parser that defaulted a
// date-only startDate to 7pm. The Catch Des Moines one returns the DATE ONLY
// instead, so parseEventDateTime stamps NO_TIME_MARKER. Ticketmaster stamps
// the Central offset, so the wall-clock time in the string is already the
// Central local time AdapterEvent expects; both parsers read it the same way.
import { parseDateTime } from "./catchdesmoinesParse.ts";

const SHOWS_URL = "https://www.vibrantmusichall.com/shows";
const VENUE_NAME = "Vibrant Music Hall";
const DEFAULT_LOCATION = "Waukee, IA";

// WEB-SEC-024: BROWSER_HEADERS removed; adapterHeaders() builds them from
// getScraperConfig() so there is one User-Agent for the whole project.

type ImageField =
  | string
  | { url?: string; contentUrl?: string }
  | Array<string | { url?: string; contentUrl?: string }>;

interface SchemaOrgAddress {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
}

interface SchemaOrgOffer {
  price?: string | number;
  lowPrice?: string | number;
  priceCurrency?: string;
}

interface SchemaOrgEvent {
  "@type"?: string | string[];
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  image?: ImageField;
  url?: string;
  offers?: SchemaOrgOffer | SchemaOrgOffer[];
  location?: {
    name?: string;
    address?: string | SchemaOrgAddress;
    geo?: { latitude?: number | string; longitude?: number | string };
  };
}

export const vibrantmusichallAdapter: DomainAdapter = {
  name: "vibrantmusichall",

  matches(url: string): boolean {
    return url.toLowerCase().includes("vibrantmusichall.com");
  },

  supports(category: string): boolean {
    return category === "events";
  },

  async fetch(_url: string, _category: string): Promise<AdapterResult> {
    console.log(`🎵 [vibrantmusichall] Fetching shows from ${SHOWS_URL}`);

    let html: string;
    try {
      const response = await fetchAllowed(SHOWS_URL);
      if (!response) {
        return {
          success: false,
          items: [],
          adapter: "vibrantmusichall",
          error: "Disallowed by robots.txt",
        };
      }
      if (!response.ok) {
        return {
          success: false,
          items: [],
          adapter: "vibrantmusichall",
          error: `HTTP ${response.status} fetching ${SHOWS_URL}`,
        };
      }
      html = await response.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        items: [],
        adapter: "vibrantmusichall",
        error: `fetch threw: ${message}`,
      };
    }

    const { items, blocks } = parseShowsHtml(html);
    console.log(
      `✅ [vibrantmusichall] ${items.length} event(s) parsed from ${blocks} ld+json Event block(s)`,
    );
    return { success: true, items, adapter: "vibrantmusichall" };
  },
};

/** The /shows page as AdapterEvents, plus how many Event blocks it held. */
export function parseShowsHtml(html: string): { items: AdapterEvent[]; blocks: number } {
  const events = parseLdJsonEvents(html);
  const items: AdapterEvent[] = [];
  const seen = new Set<string>();

  for (const ev of events) {
    const item = toAdapterEvent(ev);
    if (!item) continue;
    // Dedupe on the per-event URL (or title+date when a URL is absent) so a
    // block repeated across markup variants isn't ingested twice.
    const key = (item.source_url || `${item.title}|${item.date}`).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return { items, blocks: events.length };
}

/**
 * Pull every schema.org Event (incl. MusicEvent and other *Event subtypes)
 * out of all ld+json blocks in the page. Robust to 0 or many blocks; malformed
 * blocks are skipped, not fatal. Handles top-level arrays and @graph / itemList
 * wrappers, which is how a list page usually packs many events.
 */
function parseLdJsonEvents(html: string): SchemaOrgEvent[] {
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out: SchemaOrgEvent[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Malformed block (trailing commas, concatenated objects, etc.) — skip it
      continue;
    }
    collectEvents(parsed, out);
  }
  return out;
}

function collectEvents(node: unknown, out: SchemaOrgEvent[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectEvents(item, out);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (isEventType(obj["@type"])) {
    out.push(obj as SchemaOrgEvent);
  }

  // Recurse into the containers a list page uses to bundle events.
  for (const key of ["@graph", "itemListElement", "item", "subEvent", "subEvents"]) {
    if (key in obj) collectEvents(obj[key], out);
  }
}

// Accept schema.org Event and its subtypes (MusicEvent, TheaterEvent,
// ComedyEvent, Festival, etc.); @type may be a string or an array of strings.
function isEventType(t: unknown): boolean {
  if (typeof t === "string") {
    return t === "Event" || t === "Festival" || t.endsWith("Event");
  }
  if (Array.isArray(t)) {
    return t.some((x) => typeof x === "string" && (x === "Event" || x === "Festival" || x.endsWith("Event")));
  }
  return false;
}

function toAdapterEvent(ev: SchemaOrgEvent): AdapterEvent | null {
  if (!ev.name) return null;

  const date = parseDateTime(ev.startDate);
  if (!date) return null;

  const venue = ev.location?.name || VENUE_NAME;
  const location = buildLocation(ev.location?.address);
  const image = extractImage(ev.image);
  const url = typeof ev.url === "string" && /^https?:\/\//i.test(ev.url) ? ev.url : undefined;

  return {
    title: ev.name.substring(0, 200),
    description: (ev.description ?? "").substring(0, 500),
    date,
    location,
    venue,
    category: "Music",
    price: priceFromOffers(ev.offers) ?? "See website",
    source_url: url,
    image_url: image,
  };
}

function buildLocation(address: string | SchemaOrgAddress | undefined): string {
  if (!address) return DEFAULT_LOCATION;
  if (typeof address === "string") return address.substring(0, 200) || DEFAULT_LOCATION;
  const parts = [address.addressLocality, address.addressRegion].filter(Boolean);
  return parts.length ? parts.join(", ") : DEFAULT_LOCATION;
}

function extractImage(image: ImageField | undefined): string | null {
  if (!image) return null;
  if (typeof image === "string") return image || null;
  if (Array.isArray(image)) {
    for (const entry of image) {
      if (typeof entry === "string" && entry) return entry;
      if (entry && typeof entry === "object") {
        const u = entry.url ?? entry.contentUrl;
        if (typeof u === "string" && u) return u;
      }
    }
    return null;
  }
  const u = image.url ?? image.contentUrl;
  return typeof u === "string" && u ? u : null;
}
