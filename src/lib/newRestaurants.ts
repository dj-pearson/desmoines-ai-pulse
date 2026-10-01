/**
 * The selection rule for /restaurants/new and the monthly "New restaurants in
 * Des Moines" article (SEO-039). Both read the same rows through this module,
 * so the page and the article can never disagree about what counts.
 *
 * THE RULE. A restaurant counts as newly opened when its opening_date falls in
 * the last NEW_RESTAURANT_WINDOW_DAYS Central days (today included), it is not
 * still marked upcoming, it is not closed (our status or Google's), and it has
 * not been merged away (merged is also how out-of-scope and not-a-restaurant
 * rows are hidden, SEO-062/063).
 *
 * created_at is never used. Probed 2026-10-01: 316 of 533 rows were created in
 * July 2025 by the first import and the rest arrive in scraper batches, so it
 * dates our listing, not the opening. An undated newly_opened flag is not used
 * either; nothing clears it and it carries no date (see restaurantOpenings).
 *
 * OPENING SOON. Only rows marked opening_soon/announced with an opening_date
 * after today AND a source_url (where the openings pipeline read about it).
 * A timeframe like "2027" or an announcement with no source is not enough to
 * tell a reader a place is coming.
 */
import { format, parseISO } from "date-fns";
import { isPermanentlyClosedRestaurant } from "@/lib/restaurantHours";
import { openingDay, RECENT_WINDOW_DAYS, type OpeningRow } from "@/lib/restaurantOpenings";
import { addCentralDays, centralDateOf, type CentralDate } from "@/lib/timezone";

export const NEW_RESTAURANT_WINDOW_DAYS = RECENT_WINDOW_DAYS;

export interface NewRestaurantRow extends OpeningRow {
  source_url?: string | null;
  business_status?: string | null;
  is_merged?: boolean | null;
  cuisine?: string | null;
  location?: string | null;
  city?: string | null;
}

export interface OpeningMonth<T> {
  /** "2026-04" */
  key: string;
  /** "April 2026" */
  label: string;
  rows: T[];
}

export interface NewRestaurantSelection<T> {
  today: CentralDate;
  windowStart: CentralDate;
  /** Opened inside the window, newest first. */
  opened: T[];
  /** `opened` grouped by calendar month, newest month first. */
  months: OpeningMonth<T>[];
  /** Earliest and latest opening day among `opened`, or null when empty. */
  range: { first: CentralDate; last: CentralDate } | null;
  /** Future dated, sourced upcoming openings, soonest first. */
  openingSoon: T[];
  /**
   * Rows that are marked new or upcoming but meet neither rule (no date, a
   * passed date, a date outside the window, no source). Counted on the page so
   * the reader knows the list is deliberately short, never listed.
   */
  setAside: number;
}

const UPCOMING = new Set(["opening_soon", "announced"]);
const FLAGGED = new Set(["newly_opened", "opening_soon", "announced"]);

function isListable(row: NewRestaurantRow): boolean {
  return row.is_merged !== true && !isPermanentlyClosedRestaurant(row);
}

/** A source we can show. The openings pipeline stored a search-results URL on some rows; that is no source. */
export function hasOpeningSource(row: NewRestaurantRow): boolean {
  const url = row.source_url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return false;
  return !/[?&]q=|\/search\b/i.test(url);
}

export function isRecentOpening(row: NewRestaurantRow, now: Date = new Date()): boolean {
  if (!isListable(row) || UPCOMING.has(row.status ?? "")) return false;
  const day = openingDay(row.opening_date);
  if (!day) return false;
  const today = centralDateOf(now);
  return day <= today && day >= addCentralDays(today, -NEW_RESTAURANT_WINDOW_DAYS);
}

export function isEvidencedOpeningSoon(row: NewRestaurantRow, now: Date = new Date()): boolean {
  if (!isListable(row) || !UPCOMING.has(row.status ?? "")) return false;
  const day = openingDay(row.opening_date);
  return day !== null && day > centralDateOf(now) && hasOpeningSource(row);
}

export function monthKeyOf(day: CentralDate): string {
  return day.slice(0, 7);
}

/** "2026-04" -> "April 2026". */
export function monthLabel(key: string): string {
  return format(parseISO(`${key}-01`), "MMMM yyyy");
}

/** "2026-04-29" -> "April 29, 2026". */
export function longDay(day: CentralDate): string {
  return format(parseISO(day), "MMMM d, yyyy");
}

function byDayDesc(a: NewRestaurantRow, b: NewRestaurantRow): number {
  const da = openingDay(a.opening_date) ?? "";
  const db = openingDay(b.opening_date) ?? "";
  return da < db ? 1 : da > db ? -1 : a.name.localeCompare(b.name);
}

export function selectNewRestaurants<T extends NewRestaurantRow>(
  rows: readonly T[],
  now: Date = new Date(),
): NewRestaurantSelection<T> {
  const today = centralDateOf(now);
  const opened = rows.filter((r) => isRecentOpening(r, now)).sort(byDayDesc);
  const openingSoon = rows.filter((r) => isEvidencedOpeningSoon(r, now)).sort((a, b) => -byDayDesc(a, b));
  const chosen = new Set<string>([...opened, ...openingSoon].map((r) => r.id));
  const setAside = rows.filter((r) => isListable(r) && FLAGGED.has(r.status ?? "") && !chosen.has(r.id)).length;

  const months: OpeningMonth<T>[] = [];
  for (const row of opened) {
    const key = monthKeyOf(openingDay(row.opening_date) as CentralDate);
    const last = months[months.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else months.push({ key, label: monthLabel(key), rows: [row] });
  }

  const days = opened.map((r) => openingDay(r.opening_date) as CentralDate);
  return {
    today,
    windowStart: addCentralDays(today, -NEW_RESTAURANT_WINDOW_DAYS),
    opened,
    months,
    range: days.length ? { first: days[days.length - 1], last: days[0] } : null,
    openingSoon,
    setAside,
  };
}

/**
 * The page's first sentence, from the selection alone:
 * "3 restaurants opened in the Des Moines area between October 4, 2025 and
 * April 29, 2026, going by the opening date recorded on each listing."
 */
export function newRestaurantsLead(sel: NewRestaurantSelection<NewRestaurantRow>): string {
  const n = sel.opened.length;
  if (n === 0 || !sel.range) {
    return `No restaurant openings are recorded in the Des Moines area between ${longDay(sel.windowStart)} and ${longDay(sel.today)}.`;
  }
  const what = n === 1 ? "1 restaurant opened" : `${n} restaurants opened`;
  const when =
    sel.range.first === sel.range.last
      ? `on ${longDay(sel.range.first)}`
      : `between ${longDay(sel.range.first)} and ${longDay(sel.range.last)}`;
  return `${what} in the Des Moines area ${when}, going by the opening date recorded on each listing.`;
}

/** Rows that opened in one calendar month ("2026-10"), for the monthly article. Same exclusions as the page. */
export function openingsInMonth<T extends NewRestaurantRow>(rows: readonly T[], month: string, now: Date = new Date()): T[] {
  const today = centralDateOf(now);
  return rows
    .filter((r) => {
      if (!isListable(r) || UPCOMING.has(r.status ?? "")) return false;
      const day = openingDay(r.opening_date);
      return day !== null && day <= today && monthKeyOf(day) === month;
    })
    .sort(byDayDesc);
}
