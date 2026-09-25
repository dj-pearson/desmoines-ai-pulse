import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { rowMentionsDiet, type Diet } from "@/hooks/useDietaryRestaurants";
import { eventInArea, type EventArea } from "@/lib/eventAreas";
import { haversineDistance } from "@/lib/geo";
import {
  DES_MOINES_TIME_ZONE,
  getRestaurantOpenStatus,
  isVisitableStatus,
  type RestaurantOpenResult,
} from "@/lib/restaurantHours";

/**
 * Every restaurant with listed hours, for /restaurants/open-now (eat-drink
 * plan WP5).
 *
 * The page used to read the first 100 rows by name and filter those, so a
 * place called "Zombie Burger" could never be open. This reads every row that
 * has an `opening` text, up to OPEN_NOW_ROW_LIMIT, and leaves the open/closed
 * decision to the caller, which re-derives it every minute with
 * deriveOpenNow(). The fetch does not depend on the clock, so a place drops
 * off the list at close without a refetch.
 *
 * No hours_json or business_status in the select: neither is confirmed in
 * production (plan D6), and a select naming a missing column fails the whole
 * query with 42703. latitude and longitude are in scripts/db-snapshot.json
 * (pass 2 WP4.4, for the area filter and "near me").
 */

/** Upper bound on rows read. There are about 480 restaurants in total. */
export const OPEN_NOW_ROW_LIMIT = 600;

/** Only what RestaurantCard renders plus what the filters below read. */
export const OPEN_NOW_COLUMNS =
  "id, slug, name, description, cuisine, rating, price_range, location, city, status, opening, is_featured, is_sponsored, sponsored_until, image_url, phone, website, popularity_score, created_at, is_merged, latitude, longitude";

export interface OpenNowRestaurantRow {
  id: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  cuisine?: string | null;
  rating?: number | null;
  price_range?: string | null;
  location?: string | null;
  city?: string | null;
  status?: string | null;
  opening?: string | null;
  is_featured?: boolean | null;
  is_sponsored?: boolean | null;
  sponsored_until?: string | null;
  image_url?: string | null;
  phone?: string | null;
  website?: string | null;
  popularity_score?: number | null;
  created_at?: string | null;
  is_merged?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** A row that is visitable and carries hours text. The query filters the same way; this is the belt to its braces. */
export function isListableRow(row: OpenNowRestaurantRow): boolean {
  if (row.is_merged === true) return false;
  if (!isVisitableStatus(row.status)) return false;
  return typeof row.opening === "string" && row.opening.trim().length > 0;
}

async function fetchRestaurantsWithHours(): Promise<OpenNowRestaurantRow[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(OPEN_NOW_COLUMNS)
    .not("opening", "is", null)
    .neq("opening", "")
    .not("is_merged", "is", true)
    .or("status.is.null,status.not.in.(closed,opening_soon,announced)")
    .order("name")
    .limit(OPEN_NOW_ROW_LIMIT);
  if (error) throw error;
  return ((data ?? []) as OpenNowRestaurantRow[]).filter(isListableRow);
}

/**
 * `enabled: false` under the build-time prerender: the static page carries
 * no list, so it asks for none (pass 2 WP4.1).
 */
export function useOpenNowRestaurants(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["restaurants", "open-now", "with-hours"],
    queryFn: fetchRestaurantsWithHours,
    staleTime: 10 * 60 * 1000,
    enabled: options.enabled ?? true,
  });
}

export interface EvaluatedRestaurant {
  restaurant: OpenNowRestaurantRow;
  status: RestaurantOpenResult;
}

export interface OpenNowView {
  /** Open and not closing within the hour, latest close first. */
  open: EvaluatedRestaurant[];
  /** Open but closing within the hour, latest close first. */
  closingSoon: EvaluatedRestaurant[];
  /** The next few to open, soonest first. For the empty state. */
  nextToOpen: EvaluatedRestaurant[];
  /** Open at 00:30 Central tonight. Empty once that instant has passed. */
  openPastMidnight: EvaluatedRestaurant[];
  /** Rows the evaluator could read (known open or closed). The count's denominator. */
  withReadableHours: number;
  /** Rows fetched. */
  withListedHours: number;
  /** Rows with hours text the evaluator could not read, by name. */
  unreadable: OpenNowRestaurantRow[];
}

/** "10 PM", "10:30 PM", "midnight", "noon" back to minutes of the day, or null. */
export function clockLabelToMinutes(label: string): number | null {
  if (label === "midnight") return 0;
  if (label === "noon") return 12 * 60;
  const m = /^(\d{1,2})(?::(\d{2}))? (AM|PM)$/.exec(label);
  if (!m) return null;
  const h12 = Number(m[1]) % 12;
  return (m[3] === "PM" ? h12 + 12 : h12) * 60 + Number(m[2] ?? 0);
}

/**
 * Minutes until close for an open result. The evaluator reports the close as
 * a Central clock label, so this is that label minus the Central time now,
 * wrapped to the next day. Open around the clock sorts first.
 */
export function minutesUntilClose(status: RestaurantOpenResult, now: Date): number {
  const close = status.closesAt ? clockLabelToMinutes(status.closesAt) : null;
  if (close === null) return Number.POSITIVE_INFINITY;
  const current = Number(formatInTimeZone(now, DES_MOINES_TIME_ZONE, "H")) * 60 +
    Number(formatInTimeZone(now, DES_MOINES_TIME_ZONE, "m"));
  const delta = (close - current + 24 * 60) % (24 * 60);
  return delta === 0 ? 24 * 60 : delta;
}

/**
 * The instant of 00:30 Central "tonight": tomorrow's 00:30 during the day,
 * today's in the small hours (when midnight has already passed).
 */
export function pastMidnightInstant(now: Date): Date {
  const hour = Number(formatInTimeZone(now, DES_MOINES_TIME_ZONE, "H"));
  const base = hour < 6 ? now : new Date(now.getTime() + 24 * 60 * 60_000);
  const day = formatInTimeZone(base, DES_MOINES_TIME_ZONE, "yyyy-MM-dd");
  return fromZonedTime(`${day}T00:30:00`, DES_MOINES_TIME_ZONE);
}

/**
 * Split rows into what the page shows at `now`. Pure; the page memoizes it on
 * the minute clock. `now` can be any instant: the "Open at" select passes
 * tonight's 10 PM. `minMinutesLeft` is the "open 1+ more hour" filter.
 */
export function deriveOpenNow(
  rows: readonly OpenNowRestaurantRow[],
  now: Date,
  nextLimit = 5,
  minMinutesLeft = 0,
): OpenNowView {
  const listable = rows.filter(isListableRow);
  const midnight = pastMidnightInstant(now);
  // After midnight, "tonight's 00:30" is already behind us (WP4.6).
  const midnightAhead = midnight.getTime() > now.getTime();
  const openRows: Array<EvaluatedRestaurant & { left: number }> = [];
  const closedRows: EvaluatedRestaurant[] = [];
  const pastMidnight: EvaluatedRestaurant[] = [];
  const unreadable: OpenNowRestaurantRow[] = [];
  let readable = 0;

  for (const restaurant of listable) {
    const opening = restaurant.opening ?? "";
    const status = getRestaurantOpenStatus(opening, now);
    if (status.status !== "unknown") readable += 1;
    else unreadable.push(restaurant);
    if (status.isOpen) {
      const left = minutesUntilClose(status, now);
      if (left >= minMinutesLeft) openRows.push({ restaurant, status, left });
    } else if (status.nextOpensInMinutes !== null) {
      closedRows.push({ restaurant, status });
    }
    if (midnightAhead) {
      const late = getRestaurantOpenStatus(opening, midnight);
      if (late.isOpen) pastMidnight.push({ restaurant, status: late });
    }
  }

  openRows.sort((a, b) => b.left - a.left || a.restaurant.name.localeCompare(b.restaurant.name));
  const strip = ({ restaurant, status }: EvaluatedRestaurant) => ({ restaurant, status });

  return {
    unreadable: unreadable.sort((a, b) => a.name.localeCompare(b.name)),
    open: openRows.filter((r) => !r.status.closingSoon).map(strip),
    closingSoon: openRows.filter((r) => r.status.closingSoon).map(strip),
    nextToOpen: closedRows
      .sort(
        (a, b) =>
          (a.status.nextOpensInMinutes ?? 0) - (b.status.nextOpensInMinutes ?? 0) ||
          a.restaurant.name.localeCompare(b.restaurant.name),
      )
      .slice(0, nextLimit),
    openPastMidnight: pastMidnight.sort((a, b) => a.restaurant.name.localeCompare(b.restaurant.name)),
    withReadableHours: readable,
    withListedHours: listable.length,
  };
}

// ---------------------------------------------------------------------------
// "Open at..." and the filters (Eat & Drink pass 2 WP4.4)
// ---------------------------------------------------------------------------

/** The times the "Open at" select offers, as `at` URL values. */
export const OPEN_AT_OPTIONS = ["21:00", "22:00", "23:00", "00:00"] as const;

const AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface OpenAtInstant {
  /** The instant to evaluate at. */
  instant: Date;
  /** "10 PM", "10:30 PM", "midnight". */
  clock: string;
  /** "tonight", or a weekday ("Sat") when the time has passed for tonight. */
  when: string;
}

function clockLabelFor(hours: number, minutes: number): string {
  if (hours === 0 && minutes === 0) return "midnight";
  if (hours === 12 && minutes === 0) return "noon";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? "AM" : "PM";
  return minutes === 0 ? `${h12} ${suffix}` : `${h12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/**
 * The next Central instant at the wall time `at` ("22:00"), from `now`, or
 * null for "now" and for anything that is not HH:MM. The small hours belong
 * to the night before: at 1 AM, "00:00" is tomorrow night's midnight, and
 * "22:00" is tonight, since the evening has not started.
 */
export function resolveOpenAt(at: string | null | undefined, now: Date): OpenAtInstant | null {
  const m = at ? AT_RE.exec(at) : null;
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const hhmm = `${m[1]}:${m[2]}:00`;
  let day = formatInTimeZone(now, DES_MOINES_TIME_ZONE, "yyyy-MM-dd");
  let instant = fromZonedTime(`${day}T${hhmm}`, DES_MOINES_TIME_ZONE);
  // Midnight "tonight" is the start of tomorrow, unless it is already the
  // small hours, when it has just gone.
  const nowHour = Number(formatInTimeZone(now, DES_MOINES_TIME_ZONE, "H"));
  if (hours < 5 && nowHour >= 5) {
    day = formatInTimeZone(new Date(instant.getTime() + 24 * 60 * 60_000), DES_MOINES_TIME_ZONE, "yyyy-MM-dd");
    instant = fromZonedTime(`${day}T${hhmm}`, DES_MOINES_TIME_ZONE);
  }
  let when = "tonight";
  if (instant.getTime() < now.getTime()) {
    // Passed for tonight: the same time on the next night.
    const next = new Date(instant.getTime() + 24 * 60 * 60_000);
    day = formatInTimeZone(next, DES_MOINES_TIME_ZONE, "yyyy-MM-dd");
    instant = fromZonedTime(`${day}T${hhmm}`, DES_MOINES_TIME_ZONE);
    // Name the night by the evening it belongs to: midnight after Friday is "Fri".
    const evening = hours < 5 ? new Date(instant.getTime() - 12 * 60 * 60_000) : instant;
    when = formatInTimeZone(evening, DES_MOINES_TIME_ZONE, "EEE");
  } else if (instant.getTime() - now.getTime() > 18 * 60 * 60_000) {
    // 1 AM Saturday: 10 PM is today, but "tonight" would read as the night
    // we are still in.
    when = formatInTimeZone(instant, DES_MOINES_TIME_ZONE, "EEE");
  }
  return { instant, clock: clockLabelFor(hours, minutes), when };
}

/** One row's cuisine as separate values: "Mexican, Tex-Mex" is two. */
export function cuisineValues(row: Pick<OpenNowRestaurantRow, "cuisine">): string[] {
  return (row.cuisine ?? "")
    .split(/[,/|]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Distinct values with their row counts, most common first, for filter chips. */
export function facetCounts(
  rows: readonly OpenNowRestaurantRow[],
  valuesOf: (row: OpenNowRestaurantRow) => string[],
  limit = 10,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, { value: string; count: number }>();
  for (const row of rows) {
    const seen = new Set<string>();
    for (const raw of valuesOf(row)) {
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { value: raw, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

export interface OpenNowFilters {
  cuisine?: string | null;
  city?: string | null;
  area?: EventArea | null;
  diet?: Diet | null;
}

/**
 * The row filters, on rows already loaded: no new query. Cuisine and city
 * match a whole value, case aside. An area is a city or a bbox from
 * EVENT_AREAS; a row with no coordinates is in no bbox. A diet is the same
 * keyword match /restaurants/dietary makes, and no more reliable than it.
 */
export function applyOpenNowFilters(
  rows: readonly OpenNowRestaurantRow[],
  filters: OpenNowFilters,
): OpenNowRestaurantRow[] {
  const cuisine = filters.cuisine?.trim().toLowerCase() || null;
  const city = filters.city?.trim().toLowerCase() || null;
  return rows.filter((row) => {
    if (cuisine && !cuisineValues(row).some((v) => v.toLowerCase() === cuisine)) return false;
    if (city && (row.city ?? "").trim().toLowerCase() !== city) return false;
    if (filters.area && !eventInArea(row, filters.area)) return false;
    if (filters.diet && !rowMentionsDiet(row, filters.diet)) return false;
    return true;
  });
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * "Near me": nearest first, then the most time left. Rows with no coordinates
 * go last in their original order. Distance is only used to order; the page
 * prints no mileage, because a row geocoded to the city centroid would print
 * a confident wrong one (pass 2 D-E8).
 */
export function orderByDistance<T extends EvaluatedRestaurant>(items: readonly T[], origin: Coordinates, now: Date): T[] {
  const withDistance = items.map((item, index) => {
    const { latitude, longitude } = item.restaurant;
    const d =
      typeof latitude === "number" && typeof longitude === "number"
        ? haversineDistance(origin, { latitude, longitude })
        : Number.POSITIVE_INFINITY;
    return { item, index, d, left: minutesUntilClose(item.status, now) };
  });
  withDistance.sort((a, b) => {
    if (a.d !== b.d) return a.d - b.d;
    if (a.left !== b.left) return b.left - a.left;
    return a.index - b.index;
  });
  return withDistance.map((w) => w.item);
}
