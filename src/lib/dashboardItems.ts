import { addDays, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { createSlug } from "@/lib/slug";
import { CENTRAL_TIMEZONE, createEventSlugWithCentralTime } from "@/lib/timezone";

/**
 * Pure helpers for the home page "This week in Des Moines" block
 * (docs/page-plans/home.md, WP3). Kept out of the component so the link and
 * ordering rules can be unit tested without rendering anything.
 */

interface SlugRow {
  id: string;
  slug?: string | null;
  name?: string | null;
}

/**
 * Restaurants carry a stored slug (migration 20250729031000). The dashboard
 * used to rebuild one from the name in the browser, which disagrees with the
 * stored value for names with an apostrophe ("Proof's" -> proof-s, stored
 * proofs), an ampersand, or a duplicate name (stored with a suffix). The id
 * fallback resolves too: RestaurantDetails accepts either.
 */
export function restaurantHref(row: SlugRow): string {
  return `/restaurants/${row.slug || row.id}`;
}

/**
 * Attractions: the row slug when the projection carries it, otherwise the
 * name slug, which fetchBySlug still matches for rows the slug migration has
 * not reached. ATTRACTION_LIST_COLUMNS does not select `slug` yet (gated on a
 * schema probe), so today this is the name path.
 */
export function attractionHref(row: SlugRow): string {
  const slug = row.slug || (row.name ? createSlug(row.name) : "") || row.id;
  return `/attractions/${slug}`;
}

/** Playgrounds have no slug column; PlaygroundDetails matches createSlug(name). */
export function playgroundHref(row: SlugRow): string {
  const slug = (row.name ? createSlug(row.name) : "") || row.id;
  return `/playgrounds/${slug}`;
}

/** Hotels live under /stay and carry a stored slug. */
export function hotelHref(row: SlugRow): string {
  return `/stay/${row.slug || row.id}`;
}

interface EventLike {
  title?: string | null;
  date?: string | Date | null;
  event_start_utc?: string | null;
}

export function eventHref(event: EventLike): string {
  return `/events/${createEventSlugWithCentralTime(event.title ?? "", event)}`;
}

/** Only http(s) links are rendered as an external source link. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** The Central calendar date an event starts on, or null when it has no start. */
export function centralDateKey(event: EventLike): string | null {
  // event_start_local is deliberately skipped: it has no offset, so parsing it
  // would read it in the runner's zone.
  const source = event.event_start_utc || event.date;
  if (!source) return null;
  try {
    const instant = typeof source === "string" ? parseISO(source) : source;
    if (Number.isNaN(instant.getTime())) return null;
    return formatInTimeZone(instant, CENTRAL_TIMEZONE, "yyyy-MM-dd");
  } catch {
    return null;
  }
}

/** Today's Central date and the Central dates of the coming (or current) weekend. */
export function centralWeekWindow(now: Date = new Date()): {
  today: string;
  weekend: string[];
} {
  const today = formatInTimeZone(now, CENTRAL_TIMEZONE, "yyyy-MM-dd");
  // "i" is ISO day of week, 1 = Monday .. 7 = Sunday.
  const isoDow = Number(formatInTimeZone(now, CENTRAL_TIMEZONE, "i"));
  const noon = parseISO(`${today}T12:00:00Z`);
  const shift = (days: number) =>
    formatInTimeZone(addDays(noon, days), "UTC", "yyyy-MM-dd");
  if (isoDow === 7) return { today, weekend: [today] };
  const toSaturday = 6 - isoDow;
  return { today, weekend: [shift(toSaturday), shift(toSaturday + 1)] };
}

/**
 * Order events for the home block: anything on today's Central date first,
 * then this weekend, then the rest. Stable within each band, so the incoming
 * soonest-first order holds inside it.
 */
export function orderHomeEvents<T extends EventLike>(
  events: readonly T[],
  now: Date = new Date(),
): T[] {
  const { today, weekend } = centralWeekWindow(now);
  const band = (event: T) => {
    const key = centralDateKey(event);
    if (key === today) return 0;
    if (key && weekend.includes(key)) return 1;
    return 2;
  };
  return events
    .map((event, index) => ({ event, index, band: band(event) }))
    .sort((a, b) => a.band - b.band || a.index - b.index)
    .map((entry) => entry.event);
}
