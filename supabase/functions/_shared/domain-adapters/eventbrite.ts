/**
 * Eventbrite browse-page adapter.
 *
 * Eventbrite's React SPA renders empty HTML to headless browsers, but the
 * server response embeds the full event list in a `window.__SERVER_DATA__`
 * blob. We fetch the page server-to-server with browser-like headers, extract
 * that blob, and pull events out of its `buckets[*].events[*]` arrays.
 *
 * Matches `eventbrite.com/d/<city-slug>/events/`-style discovery URLs.
 * Does NOT match individual event detail pages (`eventbrite.com/e/...`) —
 * those go through the generic Browserless + Claude path, where ld+json
 * structured data on the detail page works well.
 */

import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";
import { fetchAllowed } from "./adapterFetch.ts";
import { priceFromOffers } from "../jsonLdOffers.ts";

const BROWSE_URL_RE = /^https?:\/\/(www\.)?eventbrite\.com\/d\//i;
const SERVER_DATA_RE = /window\.__SERVER_DATA__\s*=\s*(\{[\s\S]+?\});\s*\n/;

interface EventbriteAddress {
  localized_area_display?: string;
  localized_address_display?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  latitude?: string;
  longitude?: string;
}
interface EventbriteVenue {
  name?: string;
  address?: EventbriteAddress;
}
interface EventbriteImage {
  url?: string;
}
interface EventbriteTag {
  prefix?: string;
  display_name?: string;
}
/**
 * Eventbrite money: `major_value` is the decimal string ("25.00"), `value`
 * the same amount in minor units (2500). The browse cards print "From $25.00"
 * and "Free" from these, so the price is in the blob we already parse.
 */
interface EventbriteTicketPrice {
  currency?: string;
  major_value?: string;
  value?: number;
  display?: string;
}
interface EventbriteTicketAvailability {
  is_free?: boolean;
  is_sold_out?: boolean;
  minimum_ticket_price?: EventbriteTicketPrice | null;
  maximum_ticket_price?: EventbriteTicketPrice | null;
}
export interface EventbriteEvent {
  eventbrite_event_id?: string;
  name?: string;
  summary?: string;
  start_date?: string;
  start_time?: string;
  timezone?: string;
  url?: string;
  primary_venue?: EventbriteVenue;
  image?: EventbriteImage;
  tags?: EventbriteTag[];
  is_online_event?: boolean;
  is_cancelled?: boolean;
  is_free?: boolean;
  ticket_availability?: EventbriteTicketAvailability | null;
}
interface EventbriteBucket {
  events?: EventbriteEvent[];
}
interface EventbriteServerData {
  buckets?: EventbriteBucket[];
}

export const eventbriteAdapter: DomainAdapter = {
  name: "eventbrite",

  matches(url: string): boolean {
    return BROWSE_URL_RE.test(url);
  },

  supports(category: string): boolean {
    return category === "events";
  },

  async fetch(url: string, _category: string): Promise<AdapterResult> {
    console.log(`🎪 [eventbrite] Fetching ${url}`);

    const response = await fetchAllowed(url);

    if (!response) {
      return {
        success: false,
        items: [],
        adapter: "eventbrite",
        error: "Disallowed by robots.txt",
      };
    }

    if (!response.ok) {
      return {
        success: false,
        items: [],
        adapter: "eventbrite",
        error: `Eventbrite returned HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const match = html.match(SERVER_DATA_RE);
    if (!match) {
      return {
        success: false,
        items: [],
        adapter: "eventbrite",
        error: "No __SERVER_DATA__ blob found in HTML",
      };
    }

    let data: EventbriteServerData;
    try {
      data = JSON.parse(match[1]);
    } catch (err) {
      return {
        success: false,
        items: [],
        adapter: "eventbrite",
        error: `Failed to parse __SERVER_DATA__ JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    const seen = new Set<string>();
    const items: AdapterEvent[] = [];
    let skippedOnline = 0;
    let skippedCancelled = 0;
    let skippedNonCentral = 0;

    for (const bucket of data.buckets ?? []) {
      for (const evt of bucket.events ?? []) {
        if (evt.is_online_event) {
          skippedOnline++;
          continue;
        }
        if (evt.is_cancelled) {
          skippedCancelled++;
          continue;
        }
        // Adapter only handles Central Time venues. Out-of-area events in the
        // feed (rare, but possible) fall through so downstream can handle them.
        if (evt.timezone && evt.timezone !== "America/Chicago") {
          skippedNonCentral++;
          continue;
        }
        const id = evt.eventbrite_event_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const item = toAdapterEvent(evt);
        if (item) items.push(item);
      }
    }

    console.log(
      `✅ [eventbrite] ${items.length} events (skipped: ${skippedOnline} online, ${skippedCancelled} cancelled, ${skippedNonCentral} non-Central)`,
    );
    return { success: true, items, adapter: "eventbrite" };
  },
};

export function toAdapterEvent(evt: EventbriteEvent): AdapterEvent | null {
  if (!evt.name || !evt.start_date) return null;

  const venue = evt.primary_venue;
  const address = venue?.address;

  const city = address?.city || "Des Moines";
  const region = address?.region || "IA";
  const location = address?.localized_area_display || `${city}, ${region}`;

  return {
    title: evt.name,
    description: evt.summary ?? "",
    date: formatDateTime(evt.start_date, evt.start_time),
    location,
    venue: venue?.name ?? "Venue TBD",
    category: mapCategory(evt.tags ?? []),
    price: priceFromTicketAvailability(evt) ?? "See website",
    source_url: evt.url,
    image_url: evt.image?.url ?? null,
  };
}

/** One Eventbrite amount as the schema.org Offer fields priceFromOffers reads. */
function asOfferPrice(p: EventbriteTicketPrice | null | undefined): Record<string, unknown> | null {
  if (!p || typeof p !== "object") return null;
  // Prefer the decimal string; fall back to minor units only when it is a
  // whole number of cents, so a missing major_value is not read as dollars.
  let price: unknown = p.major_value;
  if ((price === undefined || price === null || price === "") && Number.isInteger(p.value)) {
    price = (p.value as number) / 100;
  }
  if (price === undefined || price === null || price === "") return null;
  return { price, priceCurrency: p.currency };
}

/**
 * The events.price text for an Eventbrite browse result (WEB-BE-049 AC3), or
 * undefined when the blob carries no price, so the caller keeps "See website".
 *
 * Routed through priceFromOffers so Eventbrite rows read exactly like the
 * ld+json sources: "Free", "$25", "$25-$60", "Free - $20". The same rules
 * apply: a non-USD amount is not a dollar price, and an explicit amount
 * outranks the free flag.
 */
export function priceFromTicketAvailability(evt: EventbriteEvent): string | undefined {
  const ta = evt.ticket_availability;
  const offers = [asOfferPrice(ta?.minimum_ticket_price), asOfferPrice(ta?.maximum_ticket_price)]
    .filter((o): o is Record<string, unknown> => o !== null);
  return priceFromOffers(offers, ta?.is_free ?? evt.is_free);
}

function formatDateTime(date: string, time?: string): string {
  // Eventbrite gives "2026-05-14" + "17:30" (or missing time). Treat as
  // Central Time per the venue's `timezone` field (filtered above).
  const t = time && /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : "19:00:00";
  return `${date} ${t}`;
}

function mapCategory(tags: EventbriteTag[]): string {
  for (const tag of tags) {
    if (tag.prefix !== "EventbriteCategory") continue;
    const name = (tag.display_name ?? "").toLowerCase();
    if (name.includes("music")) return "Music";
    if (name.includes("sport") || name.includes("fitness")) return "Sports";
    if (name.includes("food") || name.includes("drink")) return "Food";
    if (name.includes("performing") || name.includes("visual art")) {
      return "Arts";
    }
    if (name.includes("family") || name.includes("education")) return "Family";
    if (name.includes("charity") || name.includes("cause")) return "Community";
    if (name.includes("business") || name.includes("professional")) {
      return "Business";
    }
    if (name.includes("health") || name.includes("wellness")) return "Health";
    return tag.display_name ?? "Community";
  }
  return "Community";
}
