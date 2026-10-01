/**
 * Which /events/<month>-<year> pages exist and which are indexable
 * (docs/page-plans/events-pass2.md WP3 item 6).
 *
 * The month route used to answer any month in any year with a full page and
 * rel=prev/next links, so a crawler could walk from march-1998 to 2140 one
 * empty page at a time. The rule now:
 *
 *   - a month from last month to twelve months ahead is in range;
 *   - it is indexable when it is in range AND lists at least
 *     MIN_EVENTS_PER_MONTH events, the same floor the sitemap generator uses
 *     (scripts/generate-dynamic-sitemaps.ts imports the constant from here);
 *   - a month whose year is outside the range's years renders the not-found
 *     state.
 *
 * "Now" is read in Central. No imports on purpose: the sitemap script loads
 * this file under tsx, where the `@/` alias is not guaranteed.
 */

/** Fewer events than this and the month page is noindex and out of the sitemap. */
export const MIN_EVENTS_PER_MONTH = 3;

/** How far back and ahead a month page is in range, in months from the current one. */
export const MONTHS_BACK = 1;
export const MONTHS_AHEAD = 12;

export interface MonthRef {
  year: number;
  /** 1-12 */
  month: number;
}

export const MONTH_SLUGS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

/** "august-2026" or "August-2026" -> { year: 2026, month: 8 }; null when unparseable. */
export function parseMonthSlug(slug: string | null | undefined): MonthRef | null {
  if (!slug) return null;
  const match = /^([a-z]+)-(\d{4})$/i.exec(slug);
  if (!match) return null;
  const index = (MONTH_SLUGS as readonly string[]).indexOf(match[1].toLowerCase());
  if (index < 0) return null;
  return { year: Number(match[2]), month: index + 1 };
}

export function monthSlug({ year, month }: MonthRef): string {
  return `${MONTH_SLUGS[month - 1]}-${year}`;
}

/** "September 2026" */
export function monthName({ year, month }: MonthRef): string {
  const name = MONTH_SLUGS[month - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

function monthIndex({ year, month }: MonthRef): number {
  return year * 12 + (month - 1);
}

const CENTRAL_MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "numeric",
});

/** The Central calendar month `now` falls in. */
export function centralMonthOf(now: Date = new Date()): MonthRef {
  const parts = CENTRAL_MONTH.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

/** Last month through twelve months ahead, Central. */
export function isMonthInRange(target: MonthRef, now: Date = new Date()): boolean {
  const current = monthIndex(centralMonthOf(now));
  const index = monthIndex(target);
  return index >= current - MONTHS_BACK && index <= current + MONTHS_AHEAD;
}

/** In range and at least MIN_EVENTS_PER_MONTH events. */
export function isIndexableMonth(target: MonthRef, count: number, now: Date = new Date()): boolean {
  return isMonthInRange(target, now) && count >= MIN_EVENTS_PER_MONTH;
}

/**
 * Is the month's year one the range touches? A month in such a year renders
 * (noindex when outside the range); any other year is the not-found state.
 */
export function isYearInRange(year: number, now: Date = new Date()): boolean {
  const current = centralMonthOf(now);
  const first = shiftMonth(current, -MONTHS_BACK).year;
  const last = shiftMonth(current, MONTHS_AHEAD).year;
  return year >= first && year <= last;
}

export function isCurrentMonth(target: MonthRef, now: Date = new Date()): boolean {
  return monthIndex(target) === monthIndex(centralMonthOf(now));
}
