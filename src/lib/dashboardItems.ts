import { createSlug } from "@/lib/slug";
import { openingDay, openingLabel } from "@/lib/restaurantOpenings";
import {
  addCentralDays,
  centralDateOf,
  centralWeekday,
  centralWindow,
  createEventSlugWithCentralTime,
  type CentralWindow,
} from "@/lib/timezone";

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

// ---------------------------------------------------------------------------
// The dashboard's events group (home pass-2 WP3 item 5).
//
// Pass 1 fetched the 9 soonest events from Central midnight and reordered those
// 9 tonight-then-weekend, so on any day with 9 events nothing from the weekend
// could appear, and tonight's events repeated the Tonight rail. The group now
// starts TOMORROW and asks the server for the weekend first.
// ---------------------------------------------------------------------------

export type HomeWeekBand = "weekend" | "weekdays";

export interface HomeWeekWindows {
  /**
   * Friday (or tomorrow, if later) through the coming Sunday: the same
   * Friday-to-Sunday weekend centralWindow("this-weekend") and
   * /events/this-weekend use, minus today.
   */
  weekend: CentralWindow;
  /** Tomorrow through the day before `weekend`, or null when there is none. */
  weekdays: CentralWindow | null;
  /** Group heading for each band. */
  labels: Record<HomeWeekBand, string>;
}

/**
 * The windows the dashboard's events group reads, from tomorrow's Central start
 * through the end of the coming Sunday.
 *
 * On a Sunday the coming Sunday is a week away, so the weekend is next
 * weekend and says so; the weekdays are the week ahead.
 */
export function homeWeekWindows(now: Date = new Date()): HomeWeekWindows {
  const today = centralDateOf(now);
  const tomorrow = addCentralDays(today, 1);
  const tomorrowDow = centralWeekday(tomorrow); // 0 = Sunday
  const sunday = addCentralDays(tomorrow, (7 - tomorrowDow) % 7);
  const friday = addCentralDays(sunday, -2);
  const weekendStart = friday > tomorrow ? friday : tomorrow;
  const weekend = centralWindow({ kind: "range", from: weekendStart, to: sunday }, now);
  const weekdays =
    weekendStart > tomorrow
      ? centralWindow({ kind: "range", from: tomorrow, to: addCentralDays(weekendStart, -1) }, now)
      : null;
  const todayIsSunday = centralWeekday(today) === 0;
  return {
    weekend,
    weekdays,
    labels: {
      weekend: todayIsSunday ? "Next weekend" : "This weekend",
      weekdays: todayIsSunday ? "This week" : "Later this week",
    },
  };
}

// ---------------------------------------------------------------------------
// New openings (home pass-2 WP3 item 7).
// ---------------------------------------------------------------------------

export interface HomeOpeningRow {
  id: string;
  name: string;
  slug?: string | null;
  status?: string | null;
  openingDate?: string | null;
  openingTimeframe?: string | null;
}

/**
 * The openings the dashboard shows, each with its dated line.
 *
 * An opening_soon or announced row whose opening_date has passed is left out:
 * nobody has confirmed it opened, and "Opens Mar 3, 2025" under "New openings"
 * promised a date that is gone. A newly_opened row prints "Opened <date>".
 * The label comes from openingLabel, the same rule /restaurants/new prints.
 */
export function homeOpenings<T extends HomeOpeningRow>(
  rows: readonly T[],
  now: Date = new Date(),
): Array<{ row: T; label: string }> {
  const today = centralDateOf(now);
  const out: Array<{ row: T; label: string }> = [];
  for (const row of rows) {
    const status = row.status ?? "";
    const day = openingDay(row.openingDate);
    if ((status === "opening_soon" || status === "announced") && day && day < today) continue;
    const label = openingLabel(
      {
        id: row.id,
        name: row.name,
        status: row.status,
        opening_date: row.openingDate,
        opening_timeframe: row.openingTimeframe,
      },
      now,
    );
    if (label) out.push({ row, label });
  }
  return out;
}
