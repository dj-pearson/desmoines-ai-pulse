/**
 * JSON-LD (schema.org/Event) event extractor.
 *
 * Most modern event platforms — Eventbrite, WordPress "The Events Calendar",
 * Squarespace, Wix, Ticketmaster, Bandsintown, and many CMS themes — embed
 * structured event data as `<script type="application/ld+json">` blocks that
 * follow schema.org/Event. This is the single most reliable, site-agnostic
 * signal for event detection: it carries an exact ISO start date, a canonical
 * name, the venue, a ticket/detail URL, price, and an image, with none of the
 * ambiguity of free-text HTML.
 *
 * The generic scrape + Claude pipeline previously ignored this entirely, which
 * is a large part of why non-catchdesmoines sites returned "no events." This
 * module parses those blocks and returns items in the SAME shape the Claude
 * extractor and domain adapters produce (`AdapterEvent`), so the downstream
 * filter/dedupe/insert pipeline is unchanged.
 *
 * Design notes:
 * - Dates are normalized to a "YYYY-MM-DD HH:MM:SS" wall-clock string. The rest
 *   of the system treats event times as Central Time wall-clock, so we take the
 *   local components of the ISO string as-is (a Des Moines venue's startDate
 *   already expresses local time). We do NOT shift by any offset.
 * - Extraction is defensive: malformed JSON in one block never aborts the rest,
 *   `@type`/`location`/`image`/`offers` may each be a scalar, object, or array,
 *   and events may be nested inside `@graph` or arbitrarily deep containers.
 */

import type { AdapterEvent } from "./domain-adapters/types.ts";

// schema.org Event and its common subtypes. Matched case-insensitively and
// also by suffix, so vendor-specific "...Event" types still register.
const EVENT_TYPES = new Set(
  [
    "Event",
    "MusicEvent",
    "TheaterEvent",
    "SportsEvent",
    "Festival",
    "ComedyEvent",
    "DanceEvent",
    "ScreeningEvent",
    "ExhibitionEvent",
    "EducationEvent",
    "BusinessEvent",
    "ChildrensEvent",
    "SocialEvent",
    "FoodEvent",
    "LiteraryEvent",
    "VisualArtsEvent",
    "PublicationEvent",
    "DeliveryEvent",
    "SaleEvent",
    "Hackathon",
  ].map((t) => t.toLowerCase()),
);

// Map schema.org @type -> our internal category buckets.
function mapCategory(types: string[]): string {
  const lower = types.map((t) => t.toLowerCase());
  if (lower.includes("musicevent")) return "Music";
  if (lower.includes("sportsevent")) return "Sports";
  if (
    lower.includes("theaterevent") ||
    lower.includes("danceevent") ||
    lower.includes("comedyevent") ||
    lower.includes("screeningevent") ||
    lower.includes("visualartsevent") ||
    lower.includes("exhibitionevent")
  ) {
    return "Arts";
  }
  if (lower.includes("festival") || lower.includes("foodevent")) return "Festival";
  if (
    lower.includes("childrensevent") ||
    lower.includes("socialevent") ||
    lower.includes("educationevent")
  ) {
    return "Community";
  }
  return "General";
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function typeList(node: Record<string, unknown>): string[] {
  return asArray(node["@type"] as string | string[] | undefined).filter(
    (t): t is string => typeof t === "string",
  );
}

function isEventNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const types = typeList(node as Record<string, unknown>);
  return types.some((t) => {
    const lower = t.toLowerCase();
    return EVENT_TYPES.has(lower) || lower.endsWith("event");
  });
}

/**
 * Convert a schema.org date/dateTime string to "YYYY-MM-DD HH:MM:SS".
 * Accepts "2026-08-15", "2026-08-15T19:00", "2026-08-15T19:00:00-05:00", etc.
 * Returns null if no calendar date can be recovered.
 */
export function normalizeJsonLdDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // Pull the wall-clock components directly out of the ISO string. We keep the
  // local time the site published (offsets are ignored on purpose — see header).
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (m) {
    const [, y, mo, d, hh, mm, ss] = m;
    const hours = hh ?? "00";
    const mins = mm ?? "00";
    const secs = ss ?? "00";
    // Date-only values (no time) get a 7:00 PM default, matching the rest of the
    // pipeline's convention for events with no published time.
    if (hh === undefined) {
      return `${y}-${mo}-${d} 19:00:00`;
    }
    return `${y}-${mo}-${d} ${hours}:${mins}:${secs}`;
  }

  // Last resort: let the runtime try. Guard against Invalid Date.
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ` +
    `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
  );
}

/** Extract a human venue name + location string from a schema.org `location`. */
function extractLocation(
  loc: unknown,
): { venue: string; location: string } {
  const candidates = asArray(loc);
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return { venue: c.trim().substring(0, 100), location: c.trim().substring(0, 200) };
    }
    if (c && typeof c === "object") {
      const obj = c as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      const address = obj.address;
      let addrStr = "";
      if (typeof address === "string") {
        addrStr = address.trim();
      } else if (address && typeof address === "object") {
        const a = address as Record<string, unknown>;
        addrStr = [
          a.streetAddress,
          a.addressLocality,
          a.addressRegion,
          a.postalCode,
        ]
          .filter((p) => typeof p === "string" && p.trim())
          .join(", ");
      }
      if (name || addrStr) {
        return {
          venue: (name || addrStr).substring(0, 100),
          location: (addrStr || name).substring(0, 200),
        };
      }
    }
  }
  return { venue: "", location: "" };
}

/** Extract the first usable price string from schema.org `offers`. */
function extractPrice(offers: unknown): string | undefined {
  for (const o of asArray(offers)) {
    if (o && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      const price = obj.price ?? obj.lowPrice;
      if (price !== undefined && price !== null && `${price}`.trim()) {
        const currency =
          typeof obj.priceCurrency === "string" && obj.priceCurrency === "USD"
            ? "$"
            : "";
        const num = `${price}`.replace(/[^0-9.]/g, "");
        if (num === "0" || num === "0.0" || num === "0.00") return "Free";
        return num ? `${currency}${num}` : undefined;
      }
    }
  }
  return undefined;
}

/** Extract the first usable image URL from a schema.org `image`. */
function extractImage(image: unknown): string | null {
  for (const im of asArray(image)) {
    if (typeof im === "string" && im.trim()) return im.trim();
    if (im && typeof im === "object") {
      const url = (im as Record<string, unknown>).url;
      if (typeof url === "string" && url.trim()) return url.trim();
    }
  }
  return null;
}

/** Resolve a possibly-relative URL against the page it was scraped from. */
function resolveUrl(candidate: unknown, baseUrl: string): string | undefined {
  if (typeof candidate !== "string" || !candidate.trim()) return undefined;
  const raw = candidate.trim();
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw.startsWith("http") ? raw : undefined;
  }
}

/** Recursively collect every Event node in a parsed JSON-LD value. */
function collectEventNodes(
  value: unknown,
  acc: Record<string, unknown>[],
  depth = 0,
): void {
  if (depth > 8 || value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) collectEventNodes(item, acc, depth + 1);
    return;
  }

  const obj = value as Record<string, unknown>;
  if (isEventNode(obj)) acc.push(obj);

  // Walk common container keys (and any nested object) so events inside
  // @graph, itemListElement, subEvent, etc. are all found.
  for (const key of Object.keys(obj)) {
    if (key === "@type") continue;
    collectEventNodes(obj[key], acc, depth + 1);
  }
}

/**
 * Parse all JSON-LD `<script>` blocks out of an HTML string and return the
 * schema.org Event nodes as normalized AdapterEvent items.
 *
 * @param html    Raw page HTML (must include the <script> tags — pass result.html)
 * @param baseUrl The page URL, used to resolve relative event/ticket links
 * @param defaultCategory Fallback bucket when an event's @type doesn't map cleanly
 */
export function extractEventsFromJsonLd(
  html: string,
  baseUrl: string,
  defaultCategory = "General",
): AdapterEvent[] {
  if (!html || typeof html !== "string") return [];

  const blocks = [
    ...html.matchAll(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  if (blocks.length === 0) return [];

  const nodes: Record<string, unknown>[] = [];
  for (const block of blocks) {
    const jsonText = block[1]?.trim();
    if (!jsonText) continue;
    try {
      // Some CMSs emit multiple JSON objects in one block or trailing commas;
      // JSON.parse handles the common (valid) case. Strip HTML comments and
      // CDATA wrappers that occasionally wrap the payload.
      const cleaned = jsonText
        .replace(/^<!\[CDATA\[/, "")
        .replace(/\]\]>$/, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      collectEventNodes(parsed, nodes);
    } catch {
      // Ignore malformed blocks — a broken one must not sink the whole page.
      continue;
    }
  }

  const events: AdapterEvent[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const nameRaw = node.name ?? node.headline;
    const title =
      typeof nameRaw === "string" && nameRaw.trim()
        ? nameRaw.trim().substring(0, 200)
        : "";
    if (!title) continue;

    const date = normalizeJsonLdDate(node.startDate);
    if (!date) continue; // No parseable date -> downstream would drop it anyway.

    const { venue, location } = extractLocation(node.location);
    const description =
      typeof node.description === "string"
        ? node.description.trim().substring(0, 500)
        : "";
    const category = mapCategory(typeList(node)) || defaultCategory;
    const price = extractPrice(node.offers);
    const image_url = extractImage(node.image);
    const source_url =
      resolveUrl(node.url, baseUrl) ??
      resolveUrl((node as Record<string, unknown>)["@id"], baseUrl);

    // Dedupe within the page by title + calendar day.
    const dedupeKey = `${title.toLowerCase()}|${date.substring(0, 10)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    events.push({
      title,
      description,
      date,
      location: location || "Des Moines, IA",
      venue: venue || location || "TBD",
      category: category === "General" ? defaultCategory : category,
      price: price ?? "See website",
      source_url,
      image_url,
    });
  }

  return events;
}
