/**
 * SEO-036: the heading and first sentence of the three event hubs, and the
 * hubs' "top picks", built from the rows each page actually fetched.
 *
 * DATES ARE ABSOLUTE. The hubs are prerendered and the HTML is served until the
 * next build (a daily rebuild once the owner adds the deploy hook, SEO-035), so
 * a sentence like "42 events today" is false by the next morning. "42 events on
 * Thursday, October 1, 2026" stays true about the day it names. The client
 * refetches on load (createRoot, not hydrate), so a visitor sees the current
 * day's heading; only a crawler reading the static file sees the build's.
 *
 * COUNTS ARE THE ROWS ON THE PAGE. The weekend count is the rows the weekend
 * page lists (it does not merge duplicate listings the way the weekly article
 * does), so the number in the heading matches the cards under it. A count at
 * the fetch cap reads "500+", never an exact-looking number.
 *
 * Pure functions: no supabase, no React, no import.meta, so they test directly.
 */
import { formatInTimeZone } from "date-fns-tz";
import { eventCentralDate, eventCentralEndDate } from "./eventTime";
import { dedupeEvents, formatDateRange, pickTopEvents, type WeekendEventRow } from "./weekendArticle";

/** YYYY-MM-DD, America/Chicago. */
type CentralDay = string;

export interface HubHeadline {
  /** The h1 text. */
  heading: string;
  /** The first sentence under it. */
  summary: string;
}

function number(n: number): string {
  return n.toLocaleString("en-US");
}

/** "42 events", "1 event", "500+ events" at the fetch cap. */
export function eventCountPhrase(count: number, cap?: number): string {
  if (cap !== undefined && count >= cap) return `${number(cap)}+ events`;
  return `${number(count)} ${count === 1 ? "event" : "events"}`;
}

/** "3 free", or "none listed as free": an unknown price is never counted as free. */
export function freePhrase(free: number): string {
  return free > 0 ? `${number(free)} free` : "none listed as free";
}

/** "Thursday, October 1, 2026" for a Central date. Noon UTC is that date everywhere we format. */
export function formatCentralDay(day: CentralDay, pattern = "EEEE, MMMM d, yyyy"): string {
  return formatInTimeZone(new Date(`${day}T12:00:00Z`), "UTC", pattern);
}

export interface WindowCounts {
  /** Rows the page lists. */
  total: number;
  /** Of those, rows whose listed price says free (isFreePrice). */
  free: number;
  /** The request's row cap; a total at the cap reads "N+". */
  cap?: number;
}

/**
 * /events/this-weekend:
 *   "This weekend in Des Moines: October 2-4, 2026"
 *   "42 events on our calendar from Friday through Sunday, none listed as free."
 */
export function weekendHeadline(
  window: { startDay: CentralDay; endDay: CentralDay },
  counts: WindowCounts
): HubHeadline {
  return {
    heading: `This weekend in Des Moines: ${formatDateRange(window.startDay, window.endDay)}`,
    summary:
      counts.total === 0
        ? "No events on our calendar from Friday through Sunday yet."
        : `${eventCountPhrase(counts.total, counts.cap)} on our calendar from Friday through Sunday, ${freePhrase(counts.free)}.`,
  };
}

/**
 * /events/today. The heading names the date instead of saying "today", for
 * the reason at the top of this file:
 *   "Events in Des Moines: Thursday, October 1, 2026"
 *   "26 events on our calendar for October 1, 3 free."
 */
export function todayHeadline(day: CentralDay, counts: WindowCounts): HubHeadline {
  const short = formatCentralDay(day, "MMMM d");
  return {
    heading: `Events in Des Moines: ${formatCentralDay(day)}`,
    summary:
      counts.total === 0
        ? `No events on our calendar for ${short} yet.`
        : `${eventCountPhrase(counts.total, counts.cap)} on our calendar for ${short}, ${freePhrase(counts.free)}.`,
  };
}

/**
 * /events keeps its h1 ("Des Moines Events", the query it ranks for) and opens
 * with this sentence:
 *   "318 upcoming events from October 1, 2026 to March 14, 2027, 12 free."
 * (The single-hyphen range format reads badly across years, hence "to".)
 * lastDay is the date of the latest upcoming row; null drops the "to" half.
 */
export function hubSummary(
  firstDay: CentralDay,
  lastDay: CentralDay | null,
  counts: WindowCounts
): string {
  const from = formatCentralDay(firstDay, "MMMM d, yyyy");
  if (counts.total === 0) return `No upcoming events on our calendar from ${from}.`;
  const when =
    lastDay && lastDay > firstDay
      ? `from ${from} to ${formatCentralDay(lastDay, "MMMM d, yyyy")}`
      : `from ${from}`;
  const count = eventCountPhrase(counts.total, counts.cap).replace(/ (events?)$/, " upcoming $1");
  return `${count} ${when}, ${freePhrase(counts.free)}.`;
}

/** How many picks a hub shows. The weekly article prints eight; a hub shows the first five. */
export const HUB_PICK_COUNT = 5;

/**
 * The hubs' top picks, by the weekly article's rule (weekendArticle.ts
 * pickTopEvents) so the hub and the article agree:
 *   1. drop rows already over by `today` (end_date, else the start day),
 *   2. one row per show per day (dedupeEvents),
 *   3. featured, then major ticketed venue, then Festival/Family, then the
 *      rest; ties on popularity_score, start time, title; one per venue, three
 *      per category; weekly regulars and online events left out.
 */
export function hubTopPicks<T extends WeekendEventRow>(
  rows: readonly T[],
  today: CentralDay,
  count: number = HUB_PICK_COUNT
): T[] {
  const live = rows.filter((row) => {
    const last = eventCentralEndDate(row) ?? eventCentralDate(row);
    return last !== null && last >= today;
  });
  return pickTopEvents(dedupeEvents([...live]), { count }) as T[];
}

/** The rule above, in one sentence for the page, so a reader can check it. */
export const HUB_PICK_RULE =
  "Picked by a fixed rule, the same one as our weekly roundup: featured listings first, then shows at the big ticketed venues, then festivals and family events. One per venue; weekly regulars and online events are left out.";
