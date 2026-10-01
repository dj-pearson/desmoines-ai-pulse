/**
 * SeatGeek Platform API adapter.
 *
 * Replaces scraping seatgeek.com/search?... which returns an empty SPA shell
 * to headless browsers. Uses the Platform API with the SEATGEEK_CLIENT_ID
 * secret. Filters to events within 50 miles of downtown Des Moines.
 *
 * Docs: https://platform.seatgeek.com/
 */

import type { AdapterEvent, AdapterResult, DomainAdapter } from "./types.ts";

// Des Moines geo center, 50 mile radius
const DES_MOINES_LAT = 41.5868;
const DES_MOINES_LON = -93.6250;
const SEARCH_RANGE = "50mi";
const PER_PAGE = 100;
const MAX_PAGES = 3;

interface SeatGeekVenue {
  name?: string;
  city?: string;
  state?: string;
  extended_address?: string;
  address?: string;
}
interface SeatGeekPerformer {
  name?: string;
  image?: string;
}
interface SeatGeekTaxonomy {
  name?: string;
}
interface SeatGeekEvent {
  id?: number;
  title?: string;
  short_title?: string;
  datetime_local?: string;
  datetime_utc?: string;
  /**
   * WEB-BE-038. Neither of these was in this interface, so neither was read.
   *
   * time_tbd: the date is announced, the start time is not. datetime_local
   * still carries a time -- SeatGeek's placeholder, 03:30:00 -- and it was
   * being ingested as a showtime.
   *
   * date_tbd: not even the date is known. datetime_local is then meaningless
   * in both halves, so the row is skipped rather than guessed at.
   */
  time_tbd?: boolean;
  date_tbd?: boolean;
  type?: string;
  url?: string;
  venue?: SeatGeekVenue;
  performers?: SeatGeekPerformer[];
  taxonomies?: SeatGeekTaxonomy[];
  stats?: { lowest_price?: number | null };
  description?: string;
}
interface SeatGeekResponse {
  events?: SeatGeekEvent[];
  meta?: { total?: number; per_page?: number; page?: number };
}

export const seatgeekAdapter: DomainAdapter = {
  name: "seatgeek",

  matches(url: string): boolean {
    return url.toLowerCase().includes("seatgeek.com");
  },

  supports(category: string): boolean {
    return category === "events";
  },

  async fetch(_url: string, _category: string): Promise<AdapterResult> {
    const clientId = Deno.env.get("SEATGEEK_CLIENT_ID");
    if (!clientId) {
      return {
        success: false,
        items: [],
        adapter: "seatgeek",
        error: "SEATGEEK_CLIENT_ID not configured",
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const items: AdapterEvent[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const apiUrl =
        `https://api.seatgeek.com/2/events` +
        `?lat=${DES_MOINES_LAT}` +
        `&lon=${DES_MOINES_LON}` +
        `&range=${SEARCH_RANGE}` +
        `&datetime_local.gte=${today}` +
        `&per_page=${PER_PAGE}` +
        `&page=${page}` +
        `&client_id=${encodeURIComponent(clientId)}`;

      console.log(`🎟️ [seatgeek] Fetching page ${page}`);
      const response = await fetch(apiUrl, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return {
          success: false,
          items,
          adapter: "seatgeek",
          error: `SeatGeek API returned ${response.status} on page ${page}`,
        };
      }

      const data = (await response.json()) as SeatGeekResponse;
      const events = data.events ?? [];
      for (const evt of events) {
        const item = toAdapterEvent(evt);
        if (item) items.push(item);
      }

      if (events.length < PER_PAGE) break;
    }

    console.log(`✅ [seatgeek] ${items.length} upcoming events near Des Moines`);
    return { success: true, items, adapter: "seatgeek" };
  },
};

function toAdapterEvent(evt: SeatGeekEvent): AdapterEvent | null {
  if (!evt.title || !evt.datetime_local) return null;

  // WEB-BE-038. date_tbd means SeatGeek does not know WHEN, at all. Its
  // datetime_local is a placeholder in both halves, so there is nothing to
  // ingest -- an event with an invented date is worse than an event we do not
  // list, because it drops off the site on the day it never happens.
  if (evt.date_tbd === true) return null;

  const venue = evt.venue?.name ?? "Venue TBD";
  const city = evt.venue?.city ?? "Des Moines";
  const state = evt.venue?.state ?? "IA";

  const date = normalizeLocalDateTime(evt.datetime_local);
  if (!date) return null;

  const price =
    typeof evt.stats?.lowest_price === "number"
      ? `From $${evt.stats.lowest_price}`
      : "See website";

  return {
    title: evt.title,
    description: buildDescription(evt),
    date,
    // The date part of `date` is real; the time part is SeatGeek's 03:30
    // placeholder. Marked rather than rewritten so the row keeps a record of
    // what was actually ingested.
    time_tbd: evt.time_tbd === true,
    location: `${city}, ${state}`,
    venue,
    category: mapCategory(evt),
    price,
    source_url: evt.url,
    image_url: evt.performers?.[0]?.image ?? null,
  };
}

function buildDescription(evt: SeatGeekEvent): string {
  const performers = (evt.performers ?? [])
    .map((p) => p.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  if (performers) return performers;
  return evt.short_title ?? evt.title ?? "";
}

function mapCategory(evt: SeatGeekEvent): string {
  const type = (evt.type ?? "").toLowerCase();
  if (type === "concert" || type === "music_festival") return "Music";
  if (
    type === "mlb" ||
    type === "nba" ||
    type === "nfl" ||
    type === "nhl" ||
    type === "mls" ||
    type.includes("sport") ||
    type.includes("ncaa")
  ) {
    return "Sports";
  }
  if (type === "theater" || type === "broadway") return "Arts";
  if (type === "comedy") return "Comedy";
  if (type === "family") return "Family";
  return "Entertainment";
}

function normalizeLocalDateTime(local: string): string | null {
  // SeatGeek returns datetime_local as "YYYY-MM-DDTHH:MM:SS" (no zone)
  const match = local.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return null;
  return `${match[1]} ${match[2]}:${match[3]}:${match[4]}`;
}
