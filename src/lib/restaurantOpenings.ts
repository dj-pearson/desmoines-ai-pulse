/**
 * Which restaurants the /restaurants/new hub shows, and where (SEO-010/026).
 *
 * "new restaurants des moines 2026" is the best-converting query on the site
 * (7.63% CTR at position 7.2) and it landed on a restaurant detail page. The
 * restaurants table already says which places are new: status carries
 * newly_opened, opening_soon and announced, and opening_date is set by the
 * openings pipeline. Nothing is written about any of them here; the page is
 * the list, and each entry links to the restaurant's own page.
 */
export interface OpeningRow {
  id: string;
  name: string;
  slug?: string | null;
  status?: string | null;
  opening_date?: string | null;
}

export const RECENT_WINDOW_DAYS = 365;

function openedAt(row: OpeningRow): number {
  const t = row.opening_date ? Date.parse(row.opening_date) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

export function groupOpenings<T extends OpeningRow>(rows: T[], now: Date = new Date()) {
  const since = now.getTime() - RECENT_WINDOW_DAYS * 86_400_000;
  const recent: T[] = [];
  const upcoming: T[] = [];
  for (const row of rows) {
    const status = row.status ?? "";
    if (status === "closed") continue;
    if (status === "opening_soon" || status === "announced") {
      upcoming.push(row);
      continue;
    }
    const at = openedAt(row);
    const openedRecently = Number.isFinite(at) && at >= since && at <= now.getTime();
    if (status === "newly_opened" || openedRecently) recent.push(row);
  }
  // Newest first; an unknown date sorts last rather than being guessed.
  recent.sort((a, b) => (openedAt(b) || 0) - (openedAt(a) || 0));
  // Soonest first; an unknown date sorts last.
  upcoming.sort((a, b) => (openedAt(a) || Infinity) - (openedAt(b) || Infinity));
  return { recent, upcoming };
}
