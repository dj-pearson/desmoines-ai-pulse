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
interface EventbriteEvent {
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

    const response = await globalThis.fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

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

function toAdapterEvent(evt: EventbriteEvent): AdapterEvent | null {
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
    price: "See website",
    source_url: evt.url,
    image_url: evt.image?.url ?? null,
  };
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
