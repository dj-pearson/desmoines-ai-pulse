/**
 * Pure parsing for Catch Des Moines event detail pages.
 *
 * Split out of catchdesmoines.ts so it can be tested offline: that module pulls
 * deno_dom and the Browserless scraper from the network at import time, and
 * this one imports nothing but a sibling. Everything here takes a string and
 * returns data.
 *
 * WHAT A DETAIL PAGE CARRIES. Simpleview renders each /event/<slug>/<id>/ page
 * server-side with a schema.org Event blob holding the title, dates, image,
 * description, venue name, street address and geo pair. The adapter used to
 * keep the venue name and the city and drop the rest, so an event at a venue
 * known_venues had never heard of landed as "Des Moines, IA" with no
 * coordinates and waited for a nightly backfill to geocode what the page had
 * already said.
 */

import type { AdapterEvent } from "./types.ts";
import { categoryForEventType } from "./catchdesmoinesCategory.ts";

export interface SchemaOrgEvent {
  "@type"?: string | string[];
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  image?: unknown;
  url?: string;
  location?: unknown;
}

interface SchemaOrgPlace {
  name?: string;
  address?: string | {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
  };
  geo?: { latitude?: number | string; longitude?: number | string };
}

/**
 * Iowa, generously. A geo pair outside it is a Simpleview default or a typo,
 * and a wrong pin is worse than none: a row with coordinates looks geocoded to
 * the backfill that would otherwise fix it.
 */
const IOWA_BOUNDS = { minLat: 40.3, maxLat: 43.6, minLng: -96.7, maxLng: -90.1 };

// Accept schema.org Event AND its subtypes (MusicEvent, SportsEvent,
// TheaterEvent, ComedyEvent, Festival, Hackathon, BusinessEvent, etc.)
export function isEventType(t: unknown): boolean {
  if (Array.isArray(t)) return t.some(isEventType);
  if (typeof t !== "string") return false;
  return t === "Event" ||
    t === "Festival" ||
    t === "Hackathon" ||
    t.endsWith("Event");
}

/** The first schema.org Event on the page, looking inside arrays and @graph. */
export function parseLdJsonEvent(html: string): SchemaOrgEvent | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]+?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue; // Skip malformed ld+json blocks, keep scanning
    }
    const found = findEvent(parsed, 0);
    if (found) return found;
  }
  return null;
}

function findEvent(node: unknown, depth: number): SchemaOrgEvent | null {
  if (!node || typeof node !== "object" || depth > 4) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findEvent(n, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (isEventType(obj["@type"])) return obj as SchemaOrgEvent;
  if (obj["@graph"]) return findEvent(obj["@graph"], depth + 1);
  return null;
}

/** First usable image URL from a schema.org `image` (string, object or array). */
export function extractImage(image: unknown): string | null {
  const list = Array.isArray(image) ? image : [image];
  for (const im of list) {
    const url = typeof im === "string"
      ? im
      : im && typeof im === "object"
      ? ((im as { url?: unknown; contentUrl?: unknown }).url ??
        (im as { contentUrl?: unknown }).contentUrl)
      : null;
    if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) return url.trim();
  }
  return null;
}

/** The page's og:image, for events whose ld+json omits one. */
export function extractOgImage(html: string): string | null {
  const m = html.match(
    /<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i,
  ) ?? html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::url)?["']/i,
  );
  const url = m?.[1]?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function firstPlace(location: unknown): SchemaOrgPlace | null {
  const list = Array.isArray(location) ? location : [location];
  for (const l of list) {
    if (l && typeof l === "object") return l as SchemaOrgPlace;
  }
  return null;
}

/**
 * "2938 Grand Prairie Pkwy, Waukee, IA 50263" when the page gives a street,
 * "Waukee, IA" when it gives only a city, "Des Moines, IA" when it gives
 * nothing.
 */
export function formatPlaceLocation(place: SchemaOrgPlace | null): string {
  const address = place?.address;
  if (typeof address === "string" && address.trim()) return address.trim();
  if (!address || typeof address !== "object") return "Des Moines, IA";
  const street = address.streetAddress?.trim();
  const city = address.addressLocality?.trim();
  const region = address.addressRegion?.trim();
  const zip = address.postalCode?.trim();
  const regionZip = [region, zip].filter(Boolean).join(" ");
  const joined = [street, city, regionZip].filter(Boolean).join(", ");
  return joined || "Des Moines, IA";
}

/** The page's geo pair, or {} when it is missing, half-filled or outside Iowa. */
export function placeCoordinates(
  place: SchemaOrgPlace | null,
): { latitude: number; longitude: number } | Record<string, never> {
  const lat = Number(place?.geo?.latitude);
  const lng = Number(place?.geo?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  if (place?.geo?.latitude === undefined || place?.geo?.longitude === undefined) return {};
  if (
    lat < IOWA_BOUNDS.minLat || lat > IOWA_BOUNDS.maxLat ||
    lng < IOWA_BOUNDS.minLng || lng > IOWA_BOUNDS.maxLng
  ) return {};
  return { latitude: lat, longitude: lng };
}

export function parseDateTime(raw: string | undefined): string | null {
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

export const EXCLUDED_DOMAINS = [
  "catchdesmoines.com",
  "simpleview",
  "facebook.com",
  "twitter.com",
  "x.com",
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

export function normalizeUrl(
  href: string | null | undefined,
  base: string,
): string | null {
  if (!href) return null;
  let url = href.trim().replace(/&amp;/g, "&");
  if (url.startsWith("//")) url = `https:${url}`;
  else if (url.startsWith("/")) {
    try {
      url = new URL(url, base).toString();
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(url)) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  // "simpleview" is a substring match (its CDN hosts vary); every other entry
  // is a real domain and matches only itself or a subdomain, so "x.com" does
  // not exclude dropbox.com.
  if (host.includes("simpleview")) return null;
  if (EXCLUDED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) {
    return null;
  }
  return url;
}

/**
 * Fallbacks for the external link when no anchor reads "Visit Website".
 *
 * Tried in order, first hit wins: the embedded `linkUrl` Simpleview has used
 * on older templates, then a ticket anchor ("Buy Tickets", "Get Tickets",
 * "Tickets"), then an anchor that reads just "Website". A ticket page is a
 * worse source_url than the organizer's page but a far better one than the
 * Catch Des Moines listing, which is where the row would otherwise point.
 */
export function extractExternalUrlFallback(html: string, eventUrl: string): string | null {
  const linkMatch = html.match(/["']linkUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (linkMatch) {
    const normalized = normalizeUrl(linkMatch[1], eventUrl);
    if (normalized) return normalized;
  }

  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((a) => ({
      href: a[1],
      text: a[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase(),
    }));

  const tiers: Array<(t: string) => boolean> = [
    (t) => /\b(buy|get|purchase)\s+tickets?\b/.test(t),
    (t) => t === "tickets" || t === "ticket info" || t === "ticket information",
    (t) => t === "website" || t === "event website" || t === "official website",
  ];
  for (const tier of tiers) {
    for (const a of anchors) {
      if (!tier(a.text)) continue;
      const normalized = normalizeUrl(a.href, eventUrl);
      if (normalized) return normalized;
    }
  }
  return null;
}

/** One detail page's ld+json Event, as the row every consumer expects. */
export function toAdapterEvent(
  ev: SchemaOrgEvent,
  detailUrl: string,
  externalUrl: string | null,
  html = "",
): AdapterEvent | null {
  if (!ev.name) return null;

  const date = parseDateTime(ev.startDate);
  if (!date) return null;

  const place = firstPlace(ev.location);
  const venue = place?.name?.trim() || "TBD";
  const type = Array.isArray(ev["@type"]) ? ev["@type"].find((t) => typeof t === "string") : ev["@type"];

  return {
    title: ev.name,
    description: (ev.description ?? "").substring(0, 500),
    date,
    location: formatPlaceLocation(place),
    venue,
    category: categoryForEventType(type),
    price: "See website",
    source_url: externalUrl ?? detailUrl,
    image_url: extractImage(ev.image) ?? extractOgImage(html),
    ...placeCoordinates(place),
  };
}
