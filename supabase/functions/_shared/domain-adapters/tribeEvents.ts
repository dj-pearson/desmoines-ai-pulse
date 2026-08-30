/**
 * WordPress "The Events Calendar" (Modern Tribe) REST adapter.
 *
 * WHY THIS IS THE HIGHEST-VALUE ADAPTER
 * -------------------------------------
 * "The Events Calendar" is the default event plugin for WordPress and ships a
 * PUBLIC, unauthenticated REST API at
 *
 *     /wp-json/tribe/events/v1/events?per_page=50&start_date=YYYY-MM-DD
 *
 * that returns exactly the fields the pipeline needs — `title`, `start_date`
 * ("YYYY-MM-DD HH:MM:SS" already in the site's local timezone), `venue` with a
 * full address, `image.url`, `cost`, `categories`, and the per-event permalink
 * as `url`. That is strictly better than every HTML strategy we have: no
 * headless browser, no Claude tokens, no selectors to rot, exact times, real
 * per-event URLs, and real images.
 *
 * The plugin's /events/ + /event-archive/ URL pair is the tell that a site runs
 * it, which is why hoytsherman.org, dmsymphony.org, dmplayhouse.com,
 * theaterdesmoines.com and horizoneventscenter.com all list `tribe-rest` first
 * in their profiles.
 *
 * DETECTION IS THE CONTRACT: the adapter probes the endpoint and returns zero
 * items on 404 / non-JSON / empty. `tryDomainAdapter` then falls through to the
 * next strategy, so listing a site here costs one cheap HTTP request when the
 * guess is wrong and saves the entire scrape when it is right.
 *
 * Docs: https://theeventscalendar.com/knowledgebase/introduction-to-the-events-calendar-rest-api/
 */

import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";
import {
  findEventSourceProfile,
  type EventSourceProfile,
} from "../eventSourceProfiles.ts";
import { BROWSER_HEADERS } from "../eventPageDiscovery.ts";

const PER_PAGE = 50;
const MAX_PAGES = 4; // 200 events is far more than any of these venues publishes
const REQUEST_TIMEOUT_MS = 15_000;

/** Profiles that declared `tribe-rest` are the only hosts we probe. */
function tribeProfileFor(url: string): EventSourceProfile | null {
  const profile = findEventSourceProfile(url);
  if (!profile) return null;
  return profile.strategy.includes("tribe-rest") ? profile : null;
}

interface TribeVenue {
  venue?: string;
  address?: string;
  city?: string;
  state?: string;
  stateprovince?: string;
  zip?: string;
}
interface TribeImage {
  url?: string;
  sizes?: Record<string, { url?: string; width?: number }>;
}
interface TribeCategory {
  name?: string;
}
interface TribeEvent {
  id?: number;
  title?: string;
  description?: string;
  excerpt?: string;
  url?: string;
  start_date?: string; // "2026-08-15 19:30:00" (site-local)
  end_date?: string;
  all_day?: boolean;
  timezone?: string;
  cost?: string;
  website?: string;
  image?: TribeImage | false;
  venue?: TribeVenue | TribeVenue[];
  categories?: TribeCategory[];
  status?: string;
}
interface TribeResponse {
  events?: TribeEvent[];
  total?: number;
  total_pages?: number;
  next_rest_url?: string;
}

export const tribeEventsAdapter: DomainAdapter = {
  name: "wp-tribe-events",

  matches(url: string): boolean {
    return tribeProfileFor(url) !== null;
  },

  supports(category: string): boolean {
    return category === "events";
  },

  async fetch(url: string, _category: string): Promise<AdapterResult> {
    const profile = tribeProfileFor(url);
    if (!profile) {
      return {
        success: false,
        items: [],
        adapter: "wp-tribe-events",
        error: "No tribe-rest profile for host",
      };
    }

    const origin = originFor(url, profile);
    if (!origin) {
      return {
        success: false,
        items: [],
        adapter: "wp-tribe-events",
        error: `Could not derive origin from ${url}`,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const items: AdapterEvent[] = [];
    let skippedPast = 0;
    let skippedCancelled = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const apiUrl = `${origin}/wp-json/tribe/events/v1/events` +
        `?per_page=${PER_PAGE}&page=${page}&start_date=${today}&status=publish`;

      console.log(`📅 [wp-tribe-events] ${profile.label} page ${page}: ${apiUrl}`);
      const payload = await getJson(apiUrl);

      if (!payload) {
        // Page 1 failing means the site does not run the plugin (or blocks the
        // endpoint) — that is a clean "not my site", not an error worth raising.
        if (page === 1) {
          return {
            success: false,
            items: [],
            adapter: "wp-tribe-events",
            error: `No Tribe REST endpoint at ${origin} (falling through)`,
          };
        }
        break;
      }

      const events = payload.events ?? [];
      if (events.length === 0) break;

      for (const evt of events) {
        if (evt.status && evt.status !== "publish") {
          skippedCancelled++;
          continue;
        }
        const item = toAdapterEvent(evt, profile);
        if (!item) {
          skippedPast++;
          continue;
        }
        items.push(item);
      }

      if (events.length < PER_PAGE) break;
      if (payload.total_pages && page >= payload.total_pages) break;
    }

    if (items.length === 0) {
      return {
        success: false,
        items: [],
        adapter: "wp-tribe-events",
        error: "Tribe REST endpoint responded but yielded no usable events",
      };
    }

    console.log(
      `✅ [wp-tribe-events] ${items.length} event(s) from ${profile.label}` +
        (skippedPast || skippedCancelled
          ? ` (skipped ${skippedPast} unparseable, ${skippedCancelled} non-published)`
          : ""),
    );
    return { success: true, items, adapter: "wp-tribe-events" };
  },
};

/**
 * The origin to probe. Prefer the profile's canonical listing URL so a seeded
 * URL on a different subdomain (or the hyphenated hoyt-sherman.org alias) still
 * probes the host that actually serves the calendar.
 */
function originFor(url: string, profile: EventSourceProfile): string | null {
  for (const candidate of [profile.listingUrls[0], url]) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      continue;
    }
  }
  return null;
}

async function getJson(apiUrl: string): Promise<TribeResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, {
      headers: { ...BROWSER_HEADERS, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.log(`  ⚠️ [wp-tribe-events] HTTP ${res.status} for ${apiUrl}`);
      return null;
    }
    // A WordPress site without the plugin often serves the SPA/404 HTML with a
    // 200, so verify we actually got JSON before parsing.
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      console.log(
        `  ⚠️ [wp-tribe-events] non-JSON content-type "${contentType}" for ${apiUrl}`,
      );
      return null;
    }
    return (await res.json()) as TribeResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ⚠️ [wp-tribe-events] ${apiUrl} threw: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toAdapterEvent(
  evt: TribeEvent,
  profile: EventSourceProfile,
): AdapterEvent | null {
  const title = (evt.title ?? "").trim();
  if (!title) return null;

  const date = normalizeStartDate(evt);
  if (!date) return null;

  const venueRecord = Array.isArray(evt.venue) ? evt.venue[0] : evt.venue;
  const venueName = venueRecord?.venue?.trim();
  const location = buildLocation(venueRecord) ?? profile.venue?.location ??
    "Des Moines, IA";

  return {
    title: decodeEntities(title).substring(0, 200),
    description: decodeEntities(stripTags(evt.excerpt ?? evt.description ?? ""))
      .substring(0, 500),
    date,
    location: location.substring(0, 200),
    // The plugin's own venue name wins; the profile default only fills a blank.
    venue: (venueName || profile.venue?.name || "TBD").substring(0, 100),
    category: mapCategory(evt.categories) ?? profile.defaultCategory ?? "General",
    price: normalizeCost(evt.cost),
    // `url` is the event permalink — a real per-event deep link, which is
    // exactly what the listing-page-only path could never produce.
    source_url: evt.url ?? evt.website ?? profile.ticketsUrl,
    image_url: pickImage(evt.image),
  };
}

/**
 * Tribe's `start_date` is already the site's local wall clock in
 * "YYYY-MM-DD HH:MM:SS" — the same contract AdapterEvent expects — so it is
 * passed through verbatim. All-day events get the pipeline's 19:00 default
 * rather than 00:00, which would otherwise read as "yesterday at midnight" to
 * readers scanning a day view.
 */
function normalizeStartDate(evt: TribeEvent): string | null {
  const raw = (evt.start_date ?? "").trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const day = m[1];
  if (evt.all_day || m[2] === undefined) return `${day} 19:00:00`;
  return `${day} ${m[2]}:${m[3]}:${m[4] ?? "00"}`;
}

function buildLocation(venue: TribeVenue | undefined): string | null {
  if (!venue) return null;
  const parts = [
    venue.address,
    venue.city,
    venue.state ?? venue.stateprovince,
    venue.zip,
  ].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  return parts.length ? parts.join(", ") : null;
}

function mapCategory(categories: TribeCategory[] | undefined): string | null {
  for (const cat of categories ?? []) {
    const name = (cat.name ?? "").toLowerCase();
    if (!name) continue;
    if (name.includes("music") || name.includes("concert")) return "Music";
    if (name.includes("comed")) return "Comedy";
    if (
      name.includes("theat") || name.includes("dance") || name.includes("art") ||
      name.includes("gallery")
    ) {
      return "Arts";
    }
    if (name.includes("sport")) return "Sports";
    if (name.includes("festival")) return "Festival";
    if (name.includes("family") || name.includes("kid")) return "Family";
    if (name.includes("food") || name.includes("drink")) return "Food";
    if (name.includes("communit") || name.includes("civic")) return "Community";
    // A named category we don't recognize is still better than "General".
    return (cat.name ?? "").substring(0, 50);
  }
  return null;
}

/** Prefer the largest published size — hero images beat 150px thumbnails. */
function pickImage(image: TribeImage | false | undefined): string | null {
  if (!image || typeof image !== "object") return null;
  let best: string | null = image.url ?? null;
  let bestWidth = 0;
  for (const size of Object.values(image.sizes ?? {})) {
    const width = typeof size?.width === "number" ? size.width : 0;
    if (size?.url && width > bestWidth) {
      best = size.url;
      bestWidth = width;
    }
  }
  return best;
}

function normalizeCost(cost: string | undefined): string {
  const raw = (cost ?? "").trim();
  if (!raw) return "See website";
  if (/^free$/i.test(raw)) return "Free";
  return decodeEntities(raw).substring(0, 50);
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&#8211;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}
