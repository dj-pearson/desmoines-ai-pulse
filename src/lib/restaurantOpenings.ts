/**
 * Which restaurants the /restaurants/new hub shows, and where (SEO-010/026),
 * plus the one-line dated label the openings watch prints for each.
 *
 * "new restaurants des moines 2026" is the best-converting query on the site
 * (7.63% CTR at position 7.2) and it landed on a restaurant detail page. The
 * restaurants table already says which places are new: status carries
 * newly_opened, opening_soon and announced, and opening_date is set by the
 * openings pipeline. Nothing is written about any of them here; the page is
 * the list, and each entry links to the restaurant's own page.
 */
import { format, parseISO } from "date-fns";
import { addCentralDays, centralDateOf, type CentralDate } from "@/lib/timezone";

export interface OpeningRow {
  id: string;
  name: string;
  slug?: string | null;
  status?: string | null;
  opening_date?: string | null;
  opening_timeframe?: string | null;
}

export const RECENT_WINDOW_DAYS = 365;

/** How far back the hub's openings strip reaches for places that just opened. */
export const JUST_OPENED_WINDOW_DAYS = 60;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Central calendar day an opening_date names, or null.
 *
 * opening_date is usually a bare date. `new Date("2026-10-01")` reads that as
 * UTC midnight, which is Sep 30 in Des Moines, so a date-only value is taken
 * as written and only a full timestamp is converted to Central.
 */
export function openingDay(value: string | null | undefined): CentralDate | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (DATE_ONLY_RE.test(trimmed)) return trimmed;
  const head = trimmed.slice(0, 10);
  const parsed = parseISO(trimmed);
  if (Number.isNaN(parsed.getTime())) return DATE_ONLY_RE.test(head) ? head : null;
  return centralDateOf(parsed);
}

/** "Sep 12", or "Sep 12, 2025" when the day is not in the current Central year. */
function formatDay(day: CentralDate, today: CentralDate): string {
  // parseISO on a bare date gives LOCAL midnight, so format() prints the same
  // calendar day in any browser time zone.
  const d = parseISO(day);
  return day.slice(0, 4) === today.slice(0, 4) ? format(d, "MMM d") : format(d, "MMM d, yyyy");
}

const UPCOMING_STATUSES: ReadonlySet<string> = new Set(["opening_soon", "announced"]);

function isUpcomingStatus(status: string | null | undefined): boolean {
  return UPCOMING_STATUSES.has(status ?? "");
}

/** The first 4-digit year in a timeframe ("Summer 2025", "late 2026"), or null. */
function timeframeYear(timeframe: string | null | undefined): number | null {
  const m = /\b(19|20)\d{2}\b/.exec(timeframe ?? "");
  return m ? Number(m[0]) : null;
}

/**
 * An upcoming opening (opening_soon or announced) that time has overtaken:
 * its opening_date is behind us, or it has no date and its timeframe names a
 * year before the current Central one ("Opening Summer 2025", read in 2026).
 * Nothing confirmed the place opened, and nothing clears the status, so it
 * cannot be printed as upcoming (eat-drink pass 2, WP2.7).
 */
export function isStaleUpcoming(row: OpeningRow, now: Date = new Date()): boolean {
  if (!isUpcomingStatus(row.status)) return false;
  const today = centralDateOf(now);
  const day = openingDay(row.opening_date);
  if (day) return day < today;
  const year = timeframeYear(row.opening_timeframe);
  return year !== null && year < Number(today.slice(0, 4));
}

/**
 * THE definition of a newly opened restaurant, for the hub's openings watch,
 * /restaurants/new and the card. A place is new when it has an opening_date
 * in the last `windowDays` Central days (today included) and is not closed or
 * still upcoming. created_at is never read: it is the day a scraper found the
 * row, and a place that opened in 2019 was "New This Week" on every card the
 * week it was imported. An undated newly_opened row is not new either; the
 * flag has no clock and nothing clears it.
 */
export function isNewlyOpened(
  row: OpeningRow,
  now: Date = new Date(),
  windowDays: number = JUST_OPENED_WINDOW_DAYS,
): boolean {
  const status = row.status ?? "";
  if (status === "closed" || isUpcomingStatus(status)) return false;
  const day = openingDay(row.opening_date);
  if (!day) return false;
  const today = centralDateOf(now);
  return day <= today && day >= addCentralDays(today, -windowDays);
}

/**
 * The dated line for one place: "Opened Sep 12", "Opening Oct 2",
 * "Opening Oct 2026", "Announced", "Announced Summer 2025, not confirmed".
 * Returns null for a row that is not an opening (an ordinary open place with
 * no date, a closed one, a newly_opened flag with no date to back it).
 */
export function openingLabel(row: OpeningRow, now: Date = new Date()): string | null {
  const status = row.status ?? "";
  if (status === "closed") return null;
  const today = centralDateOf(now);
  const day = openingDay(row.opening_date);
  const timeframe = row.opening_timeframe?.trim() || null;

  if (isUpcomingStatus(status)) {
    // A date or year already behind us on a place still marked upcoming is
    // stale. Say what was announced, and that nobody has confirmed it.
    if (isStaleUpcoming(row, now)) {
      if (timeframe) return `Announced ${timeframe}, not confirmed`;
      if (day) return `Announced for ${formatDay(day, today)}, not confirmed`;
      return "Announced, not confirmed";
    }
    if (day) return `Opening ${formatDay(day, today)}`;
    if (timeframe) return `Opening ${timeframe}`;
    return status === "announced" ? "Announced" : "Opening soon";
  }

  if (day && day <= today) return `Opened ${formatDay(day, today)}`;
  return null;
}

function dayTime(row: OpeningRow): number {
  const day = openingDay(row.opening_date);
  const t = day ? Date.parse(`${day}T12:00:00Z`) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/** Newest opening_date first; undated last. */
function byNewest(a: OpeningRow, b: OpeningRow): number {
  return (dayTime(b) || 0) - (dayTime(a) || 0);
}

/** Soonest opening_date first; undated last. */
function bySoonest(a: OpeningRow, b: OpeningRow): number {
  return (dayTime(a) || Infinity) - (dayTime(b) || Infinity);
}

export interface OpeningGroups<T> {
  /** Opened in the last RECENT_WINDOW_DAYS, newest first. */
  recent: T[];
  /** Opening on a date not yet reached, soonest first, then undated. */
  upcoming: T[];
  /** Upcoming by status, but the date or year has passed. Newest announcement first. */
  unconfirmed: T[];
  /** Marked newly_opened with no opening_date: no recency claim. */
  undatedNew: T[];
}

export function groupOpenings<T extends OpeningRow>(rows: T[], now: Date = new Date()): OpeningGroups<T> {
  const recent: T[] = [];
  const upcoming: T[] = [];
  const unconfirmed: T[] = [];
  const undatedNew: T[] = [];
  for (const row of rows) {
    const status = row.status ?? "";
    if (status === "closed") continue;
    if (isUpcomingStatus(status)) {
      (isStaleUpcoming(row, now) ? unconfirmed : upcoming).push(row);
      continue;
    }
    if (isNewlyOpened(row, now, RECENT_WINDOW_DAYS)) {
      recent.push(row);
      continue;
    }
    // newly_opened is a status nothing clears, so a place flagged in 2023
    // still carries it. A dated one outside the window is not recent. An
    // undated one is listed on its own, without a claim about when.
    if (status === "newly_opened" && openingDay(row.opening_date) === null) undatedNew.push(row);
  }
  recent.sort(byNewest);
  upcoming.sort(bySoonest);
  unconfirmed.sort(byNewest);
  return { recent, upcoming, unconfirmed, undatedNew };
}

/**
 * The hub's openings watch order (WP2.7): places that opened, newest first;
 * then dated upcoming openings, soonest first; then undated announcements.
 * Stale announcements are dropped, since a watch with eight slots should not
 * spend one on a 2025 promise. `toRow` maps the caller's shape to OpeningRow.
 */
export function orderOpeningsWatch<T>(
  rows: readonly T[],
  toRow: (row: T) => OpeningRow,
  now: Date = new Date(),
): T[] {
  const opened: Array<[T, OpeningRow]> = [];
  const dated: Array<[T, OpeningRow]> = [];
  const undated: Array<[T, OpeningRow]> = [];
  for (const item of rows) {
    const row = toRow(item);
    const status = row.status ?? "";
    if (status === "closed") continue;
    if (isUpcomingStatus(status)) {
      if (isStaleUpcoming(row, now)) continue;
      (openingDay(row.opening_date) ? dated : undated).push([item, row]);
      continue;
    }
    // The query applied the JUST_OPENED_WINDOW_DAYS window to these; an
    // undated flag has no date to order by and makes no claim, so it goes.
    if (openingDay(row.opening_date)) opened.push([item, row]);
  }
  opened.sort((a, b) => byNewest(a[1], b[1]));
  dated.sort((a, b) => bySoonest(a[1], b[1]));
  return [...opened, ...dated, ...undated].map(([item]) => item);
}
