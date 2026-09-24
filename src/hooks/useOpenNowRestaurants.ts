import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import {
  DES_MOINES_TIME_ZONE,
  getRestaurantOpenStatus,
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
 * query with 42703.
 */

/** Upper bound on rows read. There are about 480 restaurants in total. */
export const OPEN_NOW_ROW_LIMIT = 600;

/** Only what RestaurantCard renders plus what the filters below read. */
export const OPEN_NOW_COLUMNS =
  "id, slug, name, description, cuisine, rating, price_range, location, city, status, opening, is_featured, is_sponsored, sponsored_until, image_url, phone, website, popularity_score, created_at, is_merged";

/** Statuses that are never "open now", whatever the hours text says. */
const UNVISITABLE_STATUSES = new Set(["closed", "opening_soon", "announced"]);

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
}

/** A row that is visitable and carries hours text. The query filters the same way; this is the belt to its braces. */
export function isListableRow(row: OpenNowRestaurantRow): boolean {
  if (row.is_merged === true) return false;
  if (row.status && UNVISITABLE_STATUSES.has(row.status)) return false;
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

export function useOpenNowRestaurants() {
  return useQuery({
    queryKey: ["restaurants", "open-now", "with-hours"],
    queryFn: fetchRestaurantsWithHours,
    staleTime: 10 * 60 * 1000,
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
  /** Open at 00:30 Central tonight. */
  openPastMidnight: EvaluatedRestaurant[];
  /** Rows the evaluator could read (known open or closed). */
  withReadableHours: number;
  /** Rows fetched. */
  withListedHours: number;
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
function minutesUntilClose(status: RestaurantOpenResult, now: Date): number {
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

/** Split rows into what the page shows at `now`. Pure; the page memoizes it on the minute clock. */
export function deriveOpenNow(rows: readonly OpenNowRestaurantRow[], now: Date, nextLimit = 5): OpenNowView {
  const listable = rows.filter(isListableRow);
  const midnight = pastMidnightInstant(now);
  const openRows: Array<EvaluatedRestaurant & { left: number }> = [];
  const closedRows: EvaluatedRestaurant[] = [];
  const pastMidnight: EvaluatedRestaurant[] = [];
  let readable = 0;

  for (const restaurant of listable) {
    const opening = restaurant.opening ?? "";
    const status = getRestaurantOpenStatus(opening, now);
    if (status.status !== "unknown") readable += 1;
    if (status.isOpen) {
      openRows.push({ restaurant, status, left: minutesUntilClose(status, now) });
    } else if (status.nextOpensInMinutes !== null) {
      closedRows.push({ restaurant, status });
    }
    const late = getRestaurantOpenStatus(opening, midnight);
    if (late.isOpen) pastMidnight.push({ restaurant, status: late });
  }

  openRows.sort((a, b) => b.left - a.left || a.restaurant.name.localeCompare(b.restaurant.name));
  const strip = ({ restaurant, status }: EvaluatedRestaurant) => ({ restaurant, status });

  return {
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
