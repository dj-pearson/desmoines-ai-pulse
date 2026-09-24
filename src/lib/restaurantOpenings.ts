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

/**
 * The dated line for one place: "Opened Sep 12", "Opening Oct 2",
 * "Opening Oct 2026", "Announced". Returns null for a row that is not an
 * opening (an ordinary open place with no date, a closed one).
 */
export function openingLabel(row: OpeningRow, now: Date = new Date()): string | null {
  const status = row.status ?? "";
  if (status === "closed") return null;
  const today = centralDateOf(now);
  const day = openingDay(row.opening_date);
  const timeframe = row.opening_timeframe?.trim() || null;

  if (status === "opening_soon" || status === "announced") {
    // A date already behind us on a place still marked upcoming is stale; say
    // what we know rather than print a past "Opening" date.
    if (day && day >= today) return `Opening ${formatDay(day, today)}`;
    if (timeframe) return `Opening ${timeframe}`;
    return status === "announced" ? "Announced" : "Opening soon";
  }

  if (day && day <= today) return `Opened ${formatDay(day, today)}`;
  if (status === "newly_opened") return "Recently opened";
  return null;
}

function openedAt(row: OpeningRow): number {
  const day = openingDay(row.opening_date);
  const t = day ? Date.parse(`${day}T12:00:00Z`) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

export function groupOpenings<T extends OpeningRow>(rows: T[], now: Date = new Date()) {
  const today = centralDateOf(now);
  const since = addCentralDays(today, -RECENT_WINDOW_DAYS);
  const recent: T[] = [];
  const upcoming: T[] = [];
  for (const row of rows) {
    const status = row.status ?? "";
    if (status === "closed") continue;
    if (status === "opening_soon" || status === "announced") {
      upcoming.push(row);
      continue;
    }
    const day = openingDay(row.opening_date);
    const openedRecently = day !== null && day >= since && day <= today;
    // newly_opened is a status nothing clears, so a place flagged in 2023 still
    // carries it. A dated one outside the window is not recent; an undated one
    // is kept, since there is nothing to say it is old.
    if (status === "newly_opened" && (day === null || openedRecently)) recent.push(row);
    else if (openedRecently) recent.push(row);
  }
  // Newest first; an unknown date sorts last rather than being guessed.
  recent.sort((a, b) => (openedAt(b) || 0) - (openedAt(a) || 0));
  // Soonest first; an unknown date sorts last.
  upcoming.sort((a, b) => (openedAt(a) || Infinity) - (openedAt(b) || Infinity));
  return { recent, upcoming };
}
