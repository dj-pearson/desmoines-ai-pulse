/**
 * The answers a restaurant page gives next to its <h1> (SEO-034): the hours
 * for one day, the "last updated" date, and the area page it belongs to.
 *
 * Search Console, 12 months to 2026-09-30: restaurant pages drew 714 of 1,040
 * clicks, and 239 of the 329 restaurant pages with impressions got none. The
 * queries are "<name> hours", "<name> menu", "<name> <suburb>"; the page
 * answered them below a hero photo, a button row and a section nav, and the
 * hours only after JavaScript had run.
 *
 * PHRASED BY SCHEDULE, NOT BY CLOCK. The prerender captures this page once,
 * at build time, and a crawler or a visitor can read that HTML days later.
 * "Open now" in it would be a claim about the build machine's minute. "Open
 * 11 AM to 9 PM on Fridays" is true whenever it is read. Once the app mounts,
 * the same function runs again on the visitor's clock and names their day.
 *
 * NEVER GUESSED. A day the source does not cover gives null, not "Closed",
 * which is the same rule RestaurantStatus.tsx applies to its weekly table:
 * Google's structured hours list every open day, so a missing day there is
 * closed; free text that never mentions Saturday says nothing about Saturday.
 *
 * RELATIVE IMPORTS ONLY: functions/_middleware.ts imports this file, and the
 * Pages bundler does not read the "@/" alias.
 */
import {
  desMoinesNow,
  formatClockLabel,
  getOpeningCoverage,
  getOpeningHoursSpecificationFromJson,
  type StoredOpeningHours,
} from './restaurantHours';
import { findNeighborhood } from './neighborhoods';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MINUTES_PER_DAY = 24 * 60;

function clockMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  // The schema builders clamp a midnight close to 23:59; read it as midnight.
  return minutes === 23 * 60 + 59 ? MINUTES_PER_DAY : minutes;
}

interface Range {
  open: number;
  close: number;
}

function isAllDay(r: Range): boolean {
  return r.open === 0 && (r.close === MINUTES_PER_DAY || r.close === 0);
}

/** "11 AM to 9 PM", or "11 AM to 2 PM and 5 PM to 9 PM" for a split day. */
function rangesText(ranges: Range[]): string {
  return ranges.map((r) => `${formatClockLabel(r.open)} to ${formatClockLabel(r.close)}`).join(" and ");
}

/**
 * Google encodes "open around the clock" as ONE period that opens Sunday
 * 00:00 and has no close (Places API, openingHours.periods). Any other
 * period without a close is unreadable, and the whole week is then unknown.
 */
function jsonShape(hours: StoredOpeningHours | null | undefined): 'none' | 'always' | 'periods' | 'unreadable' {
  const periods = hours?.periods;
  if (!Array.isArray(periods) || periods.length === 0) return 'none';
  const missingClose = periods.filter((p) => !p?.close);
  if (missingClose.length === 0) return 'periods';
  const only = periods[0]?.open;
  if (periods.length === 1 && only?.day === 0 && (only.hour ?? 0) === 0 && (only.minute ?? 0) === 0) return 'always';
  return 'unreadable';
}

/** The ranges for one weekday (0 = Sunday), or null when the source says nothing about that day. */
function dayRanges(
  hoursJson: StoredOpeningHours | null | undefined,
  opening: string | null | undefined,
  day: number,
): Range[] | 'always' | null {
  const shape = jsonShape(hoursJson);
  if (shape === 'always') return 'always';
  if (shape === 'unreadable') return null;
  if (shape === 'periods') {
    const specs = getOpeningHoursSpecificationFromJson(hoursJson);
    if (!specs) return null;
    return specs
      .filter((s) => s.dayOfWeek.includes(DAY_NAMES[day]))
      .map((s) => ({ open: clockMinutes(s.opens), close: clockMinutes(s.closes) }))
      .filter((r): r is Range => r.open !== null && r.close !== null)
      .sort((a, b) => a.open - b.open);
  }
  const coverage = getOpeningCoverage(opening);
  const d = coverage?.days.find((c) => c.day === day);
  if (!d || d.state === 'not-listed') return null;
  return d.ranges.map((r) => ({ open: r.openMinutes, close: r.closeMinutes }));
}

/**
 * One sentence for one weekday, or null when the hours are unknown:
 *   "Open 11 AM to 9 PM on Fridays"
 *   "Open 11 AM to 2 PM and 5 PM to 9 PM on Tuesdays"
 *   "Open 24 hours on Sundays"
 *   "Closed on Mondays"
 *
 * `now` picks the day, in Central time. The caller decides whether the place
 * is open for business at all; a closed or not-yet-open place gets no hours.
 */
export function scheduleHoursSentence(
  hoursJson: StoredOpeningHours | null | undefined,
  opening: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const day = desMoinesNow(now).getDay();
  const plural = `${DAY_NAMES[day]}s`;
  const ranges = dayRanges(hoursJson, opening, day);
  if (ranges === null) return null;
  if (ranges === 'always') return `Open 24 hours on ${plural}`;
  if (ranges.length === 0) return `Closed on ${plural}`;
  if (ranges.length === 1 && isAllDay(ranges[0])) return `Open 24 hours on ${plural}`;
  return `Open ${rangesText(ranges)} on ${plural}`;
}

/**
 * "October 1, 2026" in Central time from updated_at, or null.
 *
 * Shown as "Last updated", not "Last verified": updated_at moves on any write
 * to the row (the SEO-030 title backfill touched all 478 rows on 2026-10-01),
 * so it says when the listing changed, not that anyone checked the place.
 */
export function lastUpdatedLabel(updatedAt: unknown): string | null {
  if (typeof updatedAt !== 'string' || !updatedAt) return null;
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
}

export interface AreaLink {
  href: string;
  label: string;
}

function slugOf(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * The neighbourhood or suburb page this restaurant belongs to, or null.
 *
 * The `neighborhood` column first (SEO-060 is filling it from coordinates),
 * then the address's city. Only slugs in the neighbourhood inventory count,
 * so a Davenport or Norwalk address links nowhere rather than to a 404.
 */
export function neighborhoodLink(row: { neighborhood?: string | null }, locality: string | null): AreaLink | null {
  for (const candidate of [row.neighborhood, locality]) {
    if (!candidate) continue;
    const hood = findNeighborhood(slugOf(candidate));
    if (hood) return { href: `/neighborhoods/${hood.slug}`, label: `${hood.name} restaurants and things to do` };
  }
  return null;
}
